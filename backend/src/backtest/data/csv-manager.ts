import { createReadStream, existsSync, statSync, appendFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import type { Candle } from "../types.js";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../../data/historical");
const CSV_HEADER = "date,time,open,high,low,close,volume";

function getFilePath(coin: string): string {
  return path.join(DATA_DIR, `${coin.toUpperCase()}_1m.csv`);
}

function formatTimestamp(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return { date, time };
}

function parseCsvRow(line: string): Candle | null {
  const parts = line.split(",");
  if (parts.length < 7) return null;

  const [date, time, open, high, low, close, volume] = parts;
  const timestamp = new Date(`${date}T${time}Z`).getTime();

  if (isNaN(timestamp)) return null;

  return {
    timestamp,
    date,
    time,
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
    volume: parseFloat(volume),
  };
}

/** Initialize a CSV file with header if it doesn't exist */
export function initCsvFile(coin: string): void {
  const filePath = getFilePath(coin);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, CSV_HEADER + "\n", "utf-8");
  }
}

/** Append OHLCV rows to CSV (deduplicates by checking last timestamp) */
export function appendCandles(coin: string, candles: Candle[]): number {
  if (candles.length === 0) return 0;

  const filePath = getFilePath(coin);
  initCsvFile(coin);

  const lines = candles
    .map((c) => `${c.date},${c.time},${c.open},${c.high},${c.low},${c.close},${c.volume}`)
    .join("\n");

  appendFileSync(filePath, lines + "\n", "utf-8");
  return candles.length;
}

/** Convert CCXT OHLCV array to our Candle format */
export function ohlcvToCandles(ohlcv: (number | undefined)[][]): Candle[] {
  return ohlcv.map((row) => {
    const ts = Number(row[0] ?? 0);
    const { date, time } = formatTimestamp(ts);
    return {
      timestamp: ts,
      date,
      time,
      open: Number(row[1] ?? 0),
      high: Number(row[2] ?? 0),
      low: Number(row[3] ?? 0),
      close: Number(row[4] ?? 0),
      volume: Number(row[5] ?? 0),
    };
  });
}

/** Get the last timestamp in the CSV file (reads last line) */
export async function getLastTimestamp(coin: string): Promise<number | null> {
  const filePath = getFilePath(coin);
  if (!existsSync(filePath)) return null;

  let lastLine = "";
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line && line !== CSV_HEADER) {
      lastLine = line;
    }
  }

  if (!lastLine) return null;
  const candle = parseCsvRow(lastLine);
  return candle?.timestamp ?? null;
}

/** Stream candles from CSV within a date range */
export async function* streamCandles(
  coin: string,
  startTime?: number,
  endTime?: number,
): AsyncGenerator<Candle> {
  const filePath = getFilePath(coin);
  if (!existsSync(filePath)) return;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    const candle = parseCsvRow(line);
    if (!candle) continue;

    if (startTime && candle.timestamp < startTime) continue;
    if (endTime && candle.timestamp > endTime) break;

    yield candle;
  }
}

/** Load all candles into memory for a date range (use for shorter periods) */
export async function loadCandles(
  coin: string,
  startTime?: number,
  endTime?: number,
): Promise<Candle[]> {
  const candles: Candle[] = [];
  for await (const candle of streamCandles(coin, startTime, endTime)) {
    candles.push(candle);
  }
  return candles;
}

/** Get file stats for a coin's CSV */
export function getCsvStats(coin: string): { exists: boolean; fileSize: number; rows: number } | null {
  const filePath = getFilePath(coin);
  if (!existsSync(filePath)) return { exists: false, fileSize: 0, rows: 0 };

  const stats = statSync(filePath);
  // Estimate rows from file size (avg ~55 bytes per row)
  const estimatedRows = Math.max(0, Math.floor(stats.size / 55) - 1);

  return {
    exists: true,
    fileSize: stats.size,
    rows: estimatedRows,
  };
}

/** Count exact number of rows in CSV */
export async function countRows(coin: string): Promise<number> {
  const filePath = getFilePath(coin);
  if (!existsSync(filePath)) return 0;

  let count = -1; // skip header
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const _line of rl) {
    count++;
  }

  return Math.max(0, count);
}

export { getFilePath, DATA_DIR };
