/**
 * Thin HTTP client for talking to the prod backend from the local dev machine.
 * Used only by the 'Push to Live' admin action — pushes featured backtest
 * runs and strategy rows so they show up on algopulse.in without the admin
 * needing to SSH or manage DB dumps.
 *
 * Auth: logs in with stored admin credentials on each push (no token caching,
 * keeps the attack surface smaller if the env leaks).
 */

import { env as processEnv } from "process";

type LoginResponse = {
  success: boolean;
  data?: { accessToken: string };
  error?: string;
};

export class LiveSyncDisabledError extends Error {
  constructor() {
    super("Live sync is not configured — set LIVE_API_URL, LIVE_ADMIN_EMAIL, LIVE_ADMIN_PASSWORD in backend/.env");
  }
}

export class LiveSyncRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function getConfig() {
  const url = processEnv.LIVE_API_URL;
  const email = processEnv.LIVE_ADMIN_EMAIL;
  const password = processEnv.LIVE_ADMIN_PASSWORD;
  if (!url || !email || !password) return null;
  return { url: url.replace(/\/$/, ""), email, password };
}

export function isLiveSyncConfigured(): boolean {
  return getConfig() !== null;
}

async function loginToLive(): Promise<string> {
  const cfg = getConfig();
  if (!cfg) throw new LiveSyncDisabledError();

  const res = await fetch(`${cfg.url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });

  const body = (await res.json().catch(() => ({}))) as LoginResponse;
  if (!res.ok || !body.success || !body.data?.accessToken) {
    throw new LiveSyncRequestError(
      body.error ?? `Login to live failed (HTTP ${res.status})`,
      res.status,
    );
  }
  return body.data.accessToken;
}

async function postJson<T>(path: string, payload: unknown, token: string): Promise<T> {
  const cfg = getConfig()!;
  const res = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // body might be empty or HTML on 413/504
  }

  if (!res.ok) {
    const parsed = body as { error?: string } | null;
    throw new LiveSyncRequestError(
      parsed?.error ?? `Live API ${path} returned HTTP ${res.status}`,
      res.status,
    );
  }
  return body as T;
}

export async function pushFeaturedBacktestToLive(payload: {
  run: Record<string, unknown>;
  trades: Record<string, unknown>[];
}): Promise<{ runId: string }> {
  const token = await loginToLive();
  const res = await postJson<{ success: boolean; data: { runId: string }; error?: string }>(
    "/backtest/featured/import",
    payload,
    token,
  );
  if (!res.success || !res.data?.runId) {
    throw new LiveSyncRequestError(res.error ?? "Live import did not return a runId");
  }
  return { runId: res.data.runId };
}

export async function pushStrategyToLive(payload: {
  strategy: Record<string, unknown>;
}): Promise<{ strategyId: string }> {
  const token = await loginToLive();
  const res = await postJson<{ success: boolean; data: { strategyId: string }; error?: string }>(
    "/strategies/import",
    payload,
    token,
  );
  if (!res.success || !res.data?.strategyId) {
    throw new LiveSyncRequestError(res.error ?? "Strategy import did not return a strategyId");
  }
  return { strategyId: res.data.strategyId };
}
