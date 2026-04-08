const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type FetchOptions = RequestInit & { skipAuth?: boolean };

function getTokens() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("cryptox-auth");
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
  const raw = localStorage.getItem("cryptox-auth");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    parsed.state.accessToken = accessToken;
    parsed.state.refreshToken = refreshToken;
    localStorage.setItem("cryptox-auth", JSON.stringify(parsed));
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

  google: (googleId: string, email: string, name?: string) =>
    apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ googleId, email, name }),
      skipAuth: true,
    }),
};

// Brokers
export const brokerApi = {
  list: () => apiFetch("/brokers"),

  get: (id: string) => apiFetch(`/brokers/${id}`),

  connect: (data: { exchangeId: string; name: string; apiKey: string; apiSecret: string; passphrase?: string }) =>
    apiFetch("/brokers", { method: "POST", body: JSON.stringify(data) }),

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

  deploy: (data: {
    strategyId: string;
    brokerId: string;
    pair: string;
    investedAmount: number;
    config?: Record<string, unknown>;
  }) => apiFetch("/deployed", { method: "POST", body: JSON.stringify(data) }),

  updateStatus: (id: string, status: "ACTIVE" | "PAUSED" | "STOPPED") =>
    apiFetch(`/deployed/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// Portfolio
export const portfolioApi = {
  stats: () => apiFetch("/portfolio/stats"),
  trades: (limit = 20) => apiFetch(`/portfolio/trades?limit=${limit}`),
  pnlHistory: (days = 30) => apiFetch(`/portfolio/pnl-history?days=${days}`),
};
