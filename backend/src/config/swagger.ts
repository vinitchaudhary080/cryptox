import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "CryptoX API",
      version: "1.0.0",
      description: "Algorithmic Crypto Trading Platform — Backend API",
    },
    servers: [
      { url: "http://13.55.42.137:4000", description: "Local Development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication — signup, login, logout" },
      { name: "Brokers", description: "Exchange connections — connect, list, delete" },
      { name: "Strategies", description: "Trading strategy templates" },
      { name: "Deployed", description: "Deployed strategies — deploy, pause, stop" },
      { name: "Portfolio", description: "Portfolio stats, trades, PnL" },
      { name: "Market", description: "Live market data from Delta Exchange" },
    ],
    paths: {
      // ──── Auth ────
      "/api/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Create a new account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", example: "user@example.com" },
                    password: { type: "string", example: "MyPassword123" },
                    name: { type: "string", example: "John Doe" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "User created with JWT tokens" },
            "409": { description: "Email already registered" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email and password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", example: "user@example.com" },
                    password: { type: "string", example: "MyPassword123" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "JWT access + refresh tokens" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Refresh access token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    refreshToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "New token pair" } },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout and invalidate refresh token",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { refreshToken: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "Logged out" } },
        },
      },
      "/api/auth/google": {
        post: {
          tags: ["Auth"],
          summary: "Login/signup with Google OAuth",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["googleId", "email"],
                  properties: {
                    googleId: { type: "string" },
                    email: { type: "string" },
                    name: { type: "string" },
                    avatarUrl: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "JWT tokens + user" } },
        },
      },

      // ──── Brokers ────
      "/api/brokers": {
        get: {
          tags: ["Brokers"],
          summary: "List connected brokers with live balance",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Array of brokers" } },
        },
        post: {
          tags: ["Brokers"],
          summary: "Connect a new broker (tests API key first)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["exchangeId", "name", "apiKey", "apiSecret"],
                  properties: {
                    exchangeId: { type: "string", example: "delta", enum: ["delta", "binance", "bybit", "okx", "kucoin", "bitget"] },
                    name: { type: "string", example: "Delta Exchange" },
                    apiKey: { type: "string" },
                    apiSecret: { type: "string" },
                    passphrase: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Broker connected" },
            "400": { description: "Connection failed" },
          },
        },
      },
      "/api/brokers/{id}": {
        get: {
          tags: ["Brokers"],
          summary: "Get broker detail with supported pairs",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Broker detail" } },
        },
        delete: {
          tags: ["Brokers"],
          summary: "Disconnect broker",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Disconnected" } },
        },
      },
      "/api/brokers/{id}/balance": {
        get: {
          tags: ["Brokers"],
          summary: "Get live wallet balance",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Balance object" } },
        },
      },
      "/api/brokers/{id}/ticker/{symbol}": {
        get: {
          tags: ["Brokers"],
          summary: "Get live ticker for a symbol",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "symbol", in: "path", required: true, schema: { type: "string" }, example: "BTC-USD" },
          ],
          responses: { "200": { description: "Ticker data" } },
        },
      },

      // ──── Strategies ────
      "/api/strategies": {
        get: {
          tags: ["Strategies"],
          summary: "List all strategy templates",
          responses: { "200": { description: "Array of strategies" } },
        },
      },
      "/api/strategies/{id}": {
        get: {
          tags: ["Strategies"],
          summary: "Get single strategy detail",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Strategy object" } },
        },
      },

      // ──── Deployed ────
      "/api/deployed": {
        get: {
          tags: ["Deployed"],
          summary: "List deployed strategies (filter by broker/status)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "brokerId", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string", enum: ["all", "ACTIVE", "PAUSED", "STOPPED"] } },
          ],
          responses: { "200": { description: "Array of deployed strategies with PnL" } },
        },
        post: {
          tags: ["Deployed"],
          summary: "Deploy a strategy on a broker",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["strategyId", "brokerId", "pair", "investedAmount"],
                  properties: {
                    strategyId: { type: "string", example: "grid-trading-bot" },
                    brokerId: { type: "string" },
                    pair: { type: "string", example: "BTC/USD:USD" },
                    investedAmount: { type: "number", example: 1000 },
                    config: {
                      type: "object",
                      properties: {
                        stopLoss: { type: "number", example: 5 },
                        takeProfit: { type: "number", example: 10 },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Strategy deployed, worker started" },
            "404": { description: "Strategy or broker not found" },
          },
        },
      },
      "/api/deployed/{id}": {
        get: {
          tags: ["Deployed"],
          summary: "Get deployed strategy with all trades",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deployed strategy + trades" } },
        },
      },
      "/api/deployed/{id}/status": {
        patch: {
          tags: ["Deployed"],
          summary: "Pause, resume, or stop a deployed strategy",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: ["ACTIVE", "PAUSED", "STOPPED"] },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Status updated" } },
        },
      },

      // ──── Portfolio ────
      "/api/portfolio/stats": {
        get: {
          tags: ["Portfolio"],
          summary: "Portfolio overview — total value, PnL, win rate",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Portfolio stats" } },
        },
      },
      "/api/portfolio/trades": {
        get: {
          tags: ["Portfolio"],
          summary: "Recent trades across all strategies",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 20 } }],
          responses: { "200": { description: "Array of trades" } },
        },
      },
      "/api/portfolio/pnl-history": {
        get: {
          tags: ["Portfolio"],
          summary: "Daily cumulative PnL history",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 30 } }],
          responses: { "200": { description: "Array of { date, pnl }" } },
        },
      },

      // ──── Market ────
      "/api/market/overview": {
        get: {
          tags: ["Market"],
          summary: "Top 10 crypto prices (real-time from Delta Exchange)",
          responses: { "200": { description: "Array of coin tickers" } },
        },
      },
      "/api/market/candles/{symbol}": {
        get: {
          tags: ["Market"],
          summary: "OHLCV candlestick data",
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" }, example: "BTC" },
            { name: "timeframe", in: "query", schema: { type: "string", default: "1d", enum: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] } },
            { name: "limit", in: "query", schema: { type: "integer", default: 90 } },
          ],
          responses: { "200": { description: "Array of OHLCV candles" } },
        },
      },
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Server health check",
          responses: { "200": { description: "{ status: 'ok' }" } },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
