const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type FetchOptions = RequestInit & { skipAuth?: boolean };

function getTokens() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("cryptox-auth");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.state as { accessToken: string; refreshToken: string } | null;
  } catch {
    return null;
  }
}

function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem("cryptox-auth");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    parsed.state.accessToken = accessToken;
    parsed.state.refreshToken = refreshToken;
    sessionStorage.setItem("cryptox-auth", JSON.stringify(parsed));
  } catch { /* ignore */ }
}

async function refreshToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.success) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { skipAuth, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const tokens = getTokens();
    if (tokens?.accessToken) {
      headers["Authorization"] = `Bearer ${tokens.accessToken}`;
    }
  }

  let res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });
    }
  }

  const json = await res.json();
  return json;
}

// Auth
export const authApi = {
  signup: (email: string, password: string, name?: string) =>
    apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
      skipAuth: true,
    }),

  login: (email: string, password: string) =>
    apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    }),

  logout: (refreshToken: string) =>
    apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  google: (params: { credential?: string; code?: string }) =>
    apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify(params),
      skipAuth: true,
    }),

  verifyOtp: (email: string, otp: string) =>
    apiFetch("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
      skipAuth: true,
    }),

  resendOtp: (email: string) =>
    apiFetch("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuth: true,
    }),
};

// Brokers
export const brokerApi = {
  list: () => apiFetch("/brokers"),

  get: (id: string) => apiFetch(`/brokers/${id}`),

  connect: (data: { uid: string; exchangeId: string; name: string; apiKey: string; apiSecret: string; passphrase?: string }) =>
    apiFetch("/brokers", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: { uid?: string; apiKey?: string; apiSecret?: string; passphrase?: string; ipWhitelist?: boolean }) =>
    apiFetch(`/brokers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getBalance: (id: string) => apiFetch(`/brokers/${id}/balance`),

  getTicker: (id: string, symbol: string) =>
    apiFetch(`/brokers/${id}/ticker/${symbol.replace("/", "-")}`),

  remove: (id: string) => apiFetch(`/brokers/${id}`, { method: "DELETE" }),
};

// Strategies
export const strategyApi = {
  list: () => apiFetch("/strategies"),
  get: (id: string) => apiFetch(`/strategies/${id}`),
};

// Deployed
export const deployedApi = {
  list: (filters?: { brokerId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.brokerId) params.set("brokerId", filters.brokerId);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return apiFetch(`/deployed${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => apiFetch(`/deployed/${id}`),

  getTrades: (id: string, status?: "OPEN" | "CLOSED") =>
    apiFetch(`/deployed/${id}/trades${status ? `?status=${status}` : ""}`),

  deploy: (data: {
    strategyId: string;
    brokerId: string;
    pair: string;
    investedAmount: number;
    config?: Record<string, unknown>;
  }) => apiFetch("/deployed", { method: "POST", body: JSON.stringify(data) }),

  pause: (id: string) =>
    apiFetch(`/deployed/${id}/pause`, { method: "PATCH" }),

  resume: (id: string) =>
    apiFetch(`/deployed/${id}/resume`, { method: "PATCH" }),

  stop: (id: string) =>
    apiFetch(`/deployed/${id}/stop`, { method: "PATCH" }),

  remove: (id: string) =>
    apiFetch(`/deployed/${id}`, { method: "DELETE" }),
};

// User Profile
export const userApi = {
  getProfile: () => apiFetch("/user/profile"),

  updateProfile: (data: {
    name?: string
    displayName?: string
    phone?: string
    bio?: string
    timezone?: string
    country?: string
  }) => apiFetch("/user/profile", { method: "PATCH", body: JSON.stringify(data) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch("/user/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
}

// Market (public, no auth)
export const marketApi = {
  overview: () => apiFetch("/market/overview", { skipAuth: true }),
  candles: (symbol: string, timeframe = "1d", limit = 90) =>
    apiFetch(`/market/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`, { skipAuth: true }),
}

// Backtest
export const backtestApi = {
  run: (config: {
    coin: string
    startDate: string
    endDate: string
    strategyType: "code" | "ui"
    strategyName: string
    strategyConfig: Record<string, unknown>
    initialCapital: number
    makerFee?: number
    slippage?: number
  }) => apiFetch("/backtest/run", { method: "POST", body: JSON.stringify(config) }),

  listRuns: (page = 1, limit = 20) =>
    apiFetch(`/backtest/runs?page=${page}&limit=${limit}`),

  getRun: (id: string) => apiFetch(`/backtest/runs/${id}`),

  getTrades: (id: string, page = 1, limit = 50) =>
    apiFetch(`/backtest/runs/${id}/trades?page=${page}&limit=${limit}`),

  getEquity: (id: string) => apiFetch(`/backtest/runs/${id}/equity`),

  deleteRun: (id: string) =>
    apiFetch(`/backtest/runs/${id}`, { method: "DELETE" }),

  getStrategies: () => apiFetch("/backtest/strategies"),

  getCoins: () => apiFetch("/backtest/coins"),
}

// Historical Data
export const historicalApi = {
  status: () => apiFetch("/historical/status"),
  syncStatus: () => apiFetch("/historical/sync/status"),
  sync: (coin?: string) =>
    apiFetch("/historical/sync", {
      method: "POST",
      body: JSON.stringify(coin ? { coin } : { all: true }),
    }),
}

// Subscription
export const subscriptionApi = {
  plans: () => apiFetch("/subscription/plans", { skipAuth: true }),
  current: () => apiFetch("/subscription"),
  subscribe: (plan: string, cycle: string) =>
    apiFetch("/subscription/subscribe", { method: "POST", body: JSON.stringify({ plan, cycle }) }),
  cancel: () => apiFetch("/subscription/cancel", { method: "POST" }),
  limits: () => apiFetch("/subscription/limits"),
}

// Notifications
export const notificationApi = {
  list: (limit = 30, unreadOnly = false) =>
    apiFetch(`/notifications?limit=${limit}${unreadOnly ? "&unread=true" : ""}`),
  unreadCount: () => apiFetch("/notifications/unread-count"),
  markRead: (id: string) =>
    apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    apiFetch("/notifications/read-all", { method: "PATCH" }),
}

// Portfolio
export const portfolioApi = {
  stats: () => apiFetch("/portfolio/stats"),
  trades: (limit = 20) => apiFetch(`/portfolio/trades?limit=${limit}`),
  pnlHistory: (days = 30) => apiFetch(`/portfolio/pnl-history?days=${days}`),
  report: () => apiFetch("/portfolio/report"),
};
