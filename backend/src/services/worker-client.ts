/**
 * HTTP client used by the web process to issue commands to the strategy
 * worker process running on a sibling PM2 instance.
 */

const WORKER_BASE = process.env.WORKER_URL || "http://127.0.0.1:4001";

async function call<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Worker call ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export const workerClient = {
  startStrategy: (deployedId: string) =>
    call<{ ok: true }>("/start", { deployedId }),

  stopStrategy: (deployedId: string) =>
    call<{ ok: true }>("/stop", { deployedId }),

  closeAllOpenTrades: (deployedId: string) =>
    call<{ closed: number; totalPnl: number }>("/close-all-trades", { deployedId }),
};
