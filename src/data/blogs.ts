/**
 * Blog posts for /blog and /blog/[slug].
 *
 * Content is authored as structured Block[] instead of raw markdown so we
 * skip the markdown-parser dependency and keep strict TypeScript on every
 * piece of rendered content.  The renderer lives in
 * components/blog/blog-renderer.tsx.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; kind: "tip" | "warn" | "info"; title?: string; text: string }
  | { type: "code"; lang?: string; code: string }
  | { type: "quote"; text: string };

export type BlogCategory =
  | "Getting Started"
  | "Broker Setup"
  | "Strategies"
  | "Backtesting"
  | "Risk & Safety";

export type Blog = {
  slug: string;
  title: string;
  description: string;
  category: BlogCategory;
  author: string;
  publishedAt: string; // ISO datetime
  readTime: string;
  tags: string[];
  content: Block[];
};

const AUTHOR = "AlgoPulse Team";

/* ─────────────────────────────────────────────────────────────
   10 posts, dates fall between 2026-04-01 and 2026-04-19.
   Sort happens at render time, data order is just for readability.
   ───────────────────────────────────────────────────────────── */
export const blogs: Blog[] = [
  {
    slug: "getting-started-algopulse",
    title: "Getting Started with AlgoPulse: From Sign-Up to Your First Live Trade",
    description:
      "A complete walkthrough of your first 15 minutes on AlgoPulse: creating an account, connecting a broker, picking a pre-built strategy, and deploying it on a live market.",
    category: "Getting Started",
    author: AUTHOR,
    publishedAt: "2026-04-19T09:00:00.000Z",
    readTime: "6 min",
    tags: ["onboarding", "first trade", "quickstart"],
    content: [
      {
        type: "p",
        text: "AlgoPulse is a free, no-code algorithmic trading platform built for Indian crypto traders. This guide takes you from signing up to your first live strategy in under 15 minutes.",
      },
      { type: "h2", text: "Step 1, Create your account" },
      {
        type: "p",
        text: "Head to algopulse.in and click Sign Up. Use your email or continue with Google. You'll land on the Dashboard, empty for now, but that changes in the next 3 steps.",
      },
      { type: "h2", text: "Step 2, Connect a broker" },
      {
        type: "p",
        text: "AlgoPulse doesn't hold your money. Instead, it connects to your existing exchange account via API keys and places trades on your behalf. Supported exchanges:",
      },
      {
        type: "ul",
        items: [
          "Delta Exchange India, USD-M perpetual futures",
          "CoinDCX, USDT perpetual futures",
          "Pi42, INR-settled futures (India-compliant)",
          "Bybit, USDT-M perpetual futures",
        ],
      },
      {
        type: "p",
        text: "Go to Brokers → Add Broker. Pick your exchange, paste your API key and secret (generated from the exchange dashboard), and give the connection a nickname like 'main-delta'. Trade-only API keys are strongly recommended, disable withdrawal permissions.",
      },
      {
        type: "callout",
        kind: "tip",
        title: "Security tip",
        text: "Always create a trade-only API key (read + trade, withdrawal OFF). This way even if your key leaks, no one can pull your funds.",
      },
      { type: "h2", text: "Step 3, Pick a strategy" },
      {
        type: "p",
        text: "Click Strategies in the top nav. You'll see 6 pre-built strategies, each with its own backtest report and risk profile. A few to start with:",
      },
      {
        type: "ul",
        items: [
          "Meri Strategy, 5m EMA(9/21) crossover + RSI + 15m trend confirmation. Medium risk.",
          "Supertrend Strategy, 15m SuperTrend + ADX filter + EMA(50) alignment. Medium risk.",
          "Support/Resistance Breakout, Volume-confirmed pivot zone breakouts with KAMA trail. Medium risk.",
        ],
      },
      {
        type: "p",
        text: "Click View Backtest Report to see how the strategy performed on 3 years of real BTC/ETH data. Compare win rate, max drawdown, Sharpe ratio, and trade frequency before committing real capital.",
      },
      { type: "h2", text: "Step 4, Deploy it" },
      {
        type: "p",
        text: "Hit Deploy Strategy, pick your broker, choose a pair (e.g. ETH/USD), set investment ($50+ recommended for Delta India to meet minimum contract size), and confirm leverage + position size. The dialog validates in real-time that your configuration will produce executable trades.",
      },
      {
        type: "callout",
        kind: "warn",
        title: "Minimum amount matters",
        text: "Delta India requires a minimum 0.01 ETH contract (~$23 notional). At 10x leverage and 50% position size, that works out to $50 minimum investment. AlgoPulse tells you this upfront in the deploy dialog.",
      },
      { type: "h2", text: "Step 5, Watch it trade" },
      {
        type: "p",
        text: "Go to Deployed. Your strategy is now polling the broker every minute. When entry conditions match, it places a market order with your configured leverage. You'll see trades appear in real time, along with PnL, win rate, and equity curve.",
      },
      { type: "h2", text: "What's next?" },
      {
        type: "ul",
        items: [
          "Check /reports for portfolio-wide analytics",
          "Browse individual strategy backtest pages to learn what the metrics mean",
          "Deploy a second strategy on a different pair for diversification",
        ],
      },
      {
        type: "p",
        text: "That's it, you're live. AlgoPulse costs nothing, so experiment freely. Start small, learn what works, then scale up.",
      },
    ],
  },

  {
    slug: "deploy-first-strategy-walkthrough",
    title: "Deploying Your First Strategy: A Step-by-Step Walkthrough",
    description:
      "What every field in the deploy dialog actually does: amount, leverage, position size, and why the 'meets minimum' check matters.",
    category: "Getting Started",
    author: AUTHOR,
    publishedAt: "2026-04-17T11:30:00.000Z",
    readTime: "5 min",
    tags: ["deploy", "first trade", "tutorial"],
    content: [
      {
        type: "p",
        text: "The deploy dialog looks simple, 4 fields, but each one has a precise impact on how much you'll risk per trade. This post explains the math so you can configure with confidence.",
      },
      { type: "h2", text: "The 4 fields that matter" },
      { type: "h3", text: "Investment Amount" },
      {
        type: "p",
        text: "The total capital you're committing to this deployment. This is NOT the per-trade amount, it's the pool the strategy draws from. A $100 investment with 10% position size means each trade uses $10 of margin.",
      },
      { type: "h3", text: "Leverage" },
      {
        type: "p",
        text: "Futures leverage multiplier (1x–100x depending on pair). Set to 10x, a $10 margin trade becomes a $100 notional position. More leverage = bigger wins AND bigger losses. Start conservative.",
      },
      { type: "h3", text: "Position Size (%)" },
      {
        type: "p",
        text: "Percentage of your investment deployed per trade. 10% (default) means 10 trades would cumulatively expose your full capital. 100% means each trade uses all of it.",
      },
      {
        type: "callout",
        kind: "info",
        title: "Locked position sizes",
        text: "Some strategies (Meri V2, Gann Matrix Momentum) have their position sizing coded into the strategy itself. You'll see a 'Locked by strategy' badge and the input will be disabled.",
      },
      { type: "h3", text: "Pair" },
      {
        type: "p",
        text: "The trading pair, typically ETH/USD or BTC/USD on Delta India. The deploy dialog shows the instrument's minimum notional and max leverage for the pair you pick.",
      },
      { type: "h2", text: "The 'meets minimum' check" },
      {
        type: "p",
        text: "Every exchange has a minimum order size. For Delta India ETH futures it's 0.01 ETH (≈ $23 at current prices). If your per-trade notional is below this, orders will fail, so AlgoPulse validates before you deploy.",
      },
      { type: "h3", text: "The formula" },
      {
        type: "code",
        lang: "text",
        code: "per-trade notional = investment × (position size %) × leverage\n\nexample: $100 × 10% × 10x = $100 notional\nexample: $50  × 50% × 10x = $250 notional",
      },
      {
        type: "p",
        text: "If the result is below the broker's minimum, the dialog shows a red warning and the Deploy button stays disabled. Increase investment, bump leverage, or raise position size.",
      },
      { type: "h2", text: "Our recommended starting config" },
      {
        type: "ul",
        items: [
          "Investment: $50–$100 (enough to clear Delta India minimums comfortably)",
          "Leverage: 10x (enough to matter, not enough to blow up on noise)",
          "Position Size: 10% (spreads risk over ~10 trades before full exposure)",
          "Pair: ETH/USD:USD (better liquidity than altcoins, smaller min contracts than BTC)",
        ],
      },
      {
        type: "p",
        text: "After your first week, look at the Deployed page. How many trades fired? What's the average PnL? If it feels too aggressive, drop leverage. Too conservative, raise position size. Iterate.",
      },
    ],
  },

  {
    slug: "understanding-backtest-report",
    title: "Understanding Your Backtest Report: 15 Metrics Explained",
    description:
      "Win rate is not enough. A complete guide to reading every number on your AlgoPulse backtest report and what it really says about a strategy.",
    category: "Backtesting",
    author: AUTHOR,
    publishedAt: "2026-04-15T14:00:00.000Z",
    readTime: "8 min",
    tags: ["backtest", "metrics", "analysis"],
    content: [
      {
        type: "p",
        text: "Every AlgoPulse strategy comes with a 3-year backtest report. The numbers can look intimidating, here's what each one actually means and which ones you should weight most heavily.",
      },
      { type: "h2", text: "Core performance metrics" },
      { type: "h3", text: "Net PnL" },
      {
        type: "p",
        text: "Total profit after fees and slippage. This is the real number, what you'd actually have in your account. Gross PnL before fees is misleading because crypto fees compound quickly on high-frequency strategies.",
      },
      { type: "h3", text: "ROI %" },
      {
        type: "p",
        text: "(Final equity − Initial capital) / Initial capital × 100. Tells you the total return over the entire backtest period, but doesn't account for how risky the journey was.",
      },
      { type: "h3", text: "Win Rate" },
      {
        type: "p",
        text: "Percentage of trades that closed profitable. A 40% win rate with 2:1 reward:risk is better than a 70% win rate with 1:3, don't look at this in isolation.",
      },
      { type: "h3", text: "Profit Factor" },
      {
        type: "p",
        text: "Gross profit ÷ Gross loss. 1.0 = break-even. 1.5+ is decent. 2.0+ is strong. Below 1.2 and you're one bad streak from negative.",
      },
      { type: "h2", text: "Risk metrics (read these carefully)" },
      { type: "h3", text: "Max Drawdown" },
      {
        type: "p",
        text: "The largest peak-to-trough equity drop during the backtest. Shown as both $ and %. If max DD is 40%, your account fell to 60% of its previous high at some point. Can you sit through that without pulling the plug? If not, the strategy is too aggressive for you.",
      },
      { type: "h3", text: "MDD Recovery Days" },
      {
        type: "p",
        text: "How many days it took to recover the max drawdown back to the prior peak. Fast recovery (<30 days) = resilient strategy. Slow recovery (>90 days) = you'll spend a lot of time underwater.",
      },
      { type: "h3", text: "Sharpe Ratio" },
      {
        type: "p",
        text: "Return per unit of risk. Above 1 = decent. Above 2 = excellent. Above 3 = suspiciously good (probably overfit to backtest data).",
      },
      { type: "h2", text: "Trade-level metrics" },
      {
        type: "ul",
        items: [
          "Avg Win / Avg Loss, ratio tells you about reward:risk symmetry",
          "Best Trade / Worst Trade, outlier detection, are results driven by one lucky trade?",
          "Avg Days Winning / Losing, how long your money is tied up per trade",
          "Account Blowouts, times equity hit ≤1% of initial (would you have quit?)",
          "Account Doubles, times equity crossed 2× initial (winners you'd have taken off?)",
        ],
      },
      { type: "h2", text: "What to weight most" },
      {
        type: "ol",
        items: [
          "Max Drawdown, can you emotionally survive this?",
          "Profit Factor, is the math even positive?",
          "MDD Recovery Days, how long underwater?",
          "Sharpe Ratio, risk-adjusted return",
          "Win Rate × Avg W:L, actual expectancy",
        ],
      },
      {
        type: "callout",
        kind: "warn",
        title: "Past ≠ Future",
        text: "A backtest shows what WOULD have happened with perfect hindsight on fixed historical data. Live markets evolve. Treat backtests as filters (rule out bad strategies), not guarantees.",
      },
    ],
  },

  {
    slug: "connect-bybit-to-algopulse",
    title: "How to Connect Bybit to AlgoPulse",
    description:
      "Step-by-step guide to generating a Bybit USDT perpetual API key and pasting it into AlgoPulse, safely.",
    category: "Broker Setup",
    author: AUTHOR,
    publishedAt: "2026-04-13T10:15:00.000Z",
    readTime: "4 min",
    tags: ["bybit", "broker", "setup"],
    content: [
      {
        type: "p",
        text: "Bybit is a globally available derivatives exchange with deep liquidity on major pairs. Here's how to wire it up to AlgoPulse in under 3 minutes.",
      },
      { type: "h2", text: "1. Create the API key on Bybit" },
      {
        type: "ol",
        items: [
          "Log in to bybit.com. Click your profile icon → API → Create New Key",
          "Select 'System-generated API Keys' and 'API Transaction'",
          "Permissions: check 'Contract - Orders' and 'Contract - Positions'. LEAVE WITHDRAWAL UNCHECKED.",
          "IP restriction: optional but recommended. For AlgoPulse production IP, contact support.",
          "Copy the API Key and API Secret, you won't see the secret again.",
        ],
      },
      {
        type: "callout",
        kind: "warn",
        title: "Withdrawal stays OFF",
        text: "AlgoPulse only needs read + trade permissions. Never enable withdrawal on an API key used by a bot, it's not needed and massively increases your risk.",
      },
      { type: "h2", text: "2. Add the broker in AlgoPulse" },
      {
        type: "ol",
        items: [
          "On AlgoPulse, go to Brokers → Add Broker",
          "Select Bybit",
          "Give it a nickname (e.g., 'bybit-main')",
          "Paste API Key and API Secret",
          "Click Connect",
        ],
      },
      {
        type: "p",
        text: "AlgoPulse immediately probes the API by fetching your USDT balance. If it returns a number, you're connected. If it returns an error, double-check the key has Contract - Orders permission and hasn't been IP-restricted.",
      },
      { type: "h2", text: "3. Deploy a strategy on Bybit" },
      {
        type: "p",
        text: "Go to Strategies, pick one (Meri Strategy is a good starter), hit Deploy, and select your newly added Bybit broker. Pair picker will auto-populate with available Bybit USDT perps.",
      },
      { type: "h2", text: "Common issues" },
      {
        type: "ul",
        items: [
          "'Invalid API key', you copied a testnet key instead of mainnet. Make sure you generated it on bybit.com, not testnet.bybit.com.",
          "'Permission denied', the key doesn't have Contract permission enabled. Edit the key and add it.",
          "'IP not allowed', you set an IP restriction but didn't include AlgoPulse's IP. Either remove the restriction or contact support.",
        ],
      },
    ],
  },

  {
    slug: "meri-strategy-v2-compounding",
    title: "Meri Strategy V2: How 50% Equity Compounding Works",
    description:
      "Meri V2 uses the same entry logic as V1 but sizes every trade at 50% of current equity. Here's why compounding changes the long-term curve dramatically.",
    category: "Strategies",
    author: AUTHOR,
    publishedAt: "2026-04-11T16:45:00.000Z",
    readTime: "5 min",
    tags: ["meri strategy", "compounding", "position sizing"],
    content: [
      {
        type: "p",
        text: "Meri Strategy V2 looks identical to V1 at first glance, same 5m EMA crossover, same RSI filter, same 15m trend confirmation. The one difference is position sizing, and it's bigger than it sounds.",
      },
      { type: "h2", text: "V1 vs V2 in one line" },
      {
        type: "ul",
        items: [
          "V1, Fixed 10% of your INITIAL investment per trade",
          "V2, 50% of your CURRENT equity per trade (position size grows with wins, shrinks with losses)",
        ],
      },
      { type: "h2", text: "Why compounding matters" },
      {
        type: "p",
        text: "Imagine $100 starting capital. V1 risks $10 per trade regardless of how the account has done. If you've grown to $200, V1 is still risking $10, but that's only 5% now. It's getting less aggressive as you succeed.",
      },
      {
        type: "p",
        text: "V2 risks 50% of current equity. On $100 it's $50. After a win that takes you to $110, V2 now risks $55. After a loss that takes you to $95, V2 risks $47.50.",
      },
      {
        type: "quote",
        text: "Compounding magnifies both wins and losses, but in a stretched way: losing streaks auto-shrink the position size, while winning streaks auto-expand it.",
      },
      { type: "h2", text: "The math over 100 trades" },
      {
        type: "p",
        text: "With a 40% win rate and 2:1 reward:risk, both V1 and V2 are profitable. But V2's equity curve is steeper, it took the same signals and turned them into larger and larger trades as the account grew.",
      },
      {
        type: "callout",
        kind: "warn",
        title: "Drawdown trade-off",
        text: "V2's max drawdown is also larger because a losing streak happens at a bigger position size. V1's max DD was ~15% on backtest; V2's was ~35%. If you can't sit through a 35% drawdown without panicking, stick with V1.",
      },
      { type: "h2", text: "Why position size is locked in V2" },
      {
        type: "p",
        text: "V2's magic comes from the 50% equity sizing. Letting users dial this down to 10% would defeat the purpose, you'd get V1 with a confusing name. So the deploy dialog locks it at 50% and tells you clearly.",
      },
      { type: "h2", text: "When to pick V2 over V1" },
      {
        type: "ul",
        items: [
          "You have $200+ capital (so 50% of equity is still above broker minimums)",
          "You understand and accept larger drawdowns",
          "You want compounding to do its work over 6–12 months",
        ],
      },
      {
        type: "p",
        text: "V1 is the safer starting point. V2 is for people who've already watched V1 run for a few weeks and want more punch.",
      },
    ],
  },

  {
    slug: "connect-pi42-to-algopulse",
    title: "How to Connect Pi42 to AlgoPulse",
    description:
      "Pi42 is India's first compliant INR-settled crypto derivatives exchange. Here's how to connect it to AlgoPulse.",
    category: "Broker Setup",
    author: AUTHOR,
    publishedAt: "2026-04-09T13:20:00.000Z",
    readTime: "4 min",
    tags: ["pi42", "broker", "india"],
    content: [
      {
        type: "p",
        text: "Pi42 is a FIU-registered, INR-settled crypto futures exchange based in India. If you want your algo trading profits (and losses) in INR rather than USDT, Pi42 is the natural choice.",
      },
      { type: "h2", text: "1. Generate the API key on Pi42" },
      {
        type: "ol",
        items: [
          "Log in to pi42.com. Go to Profile → API Management → Create Key",
          "Name it 'AlgoPulse' so you can identify it later",
          "Permissions: enable Trading. Leave Withdrawals OFF.",
          "Copy the API Key and Secret immediately, the Secret is shown only once",
        ],
      },
      { type: "h2", text: "2. Add it in AlgoPulse" },
      {
        type: "ol",
        items: [
          "Brokers → Add Broker → Pi42",
          "Give it a nickname like 'pi42-inr'",
          "Paste API Key and Secret",
          "Connect",
        ],
      },
      {
        type: "p",
        text: "AlgoPulse fetches your INR margin balance to verify the connection. A successful connection shows a green Connected badge and your available INR.",
      },
      { type: "h2", text: "Pi42-specific notes" },
      {
        type: "ul",
        items: [
          "Settlement currency is INR, AlgoPulse will show PnL in INR in deploy reports",
          "Minimum lot sizes can differ from USD exchanges, the deploy dialog uses Pi42's live rules",
          "1% TDS is withheld automatically by Pi42 on profits (Indian tax compliance)",
          "KYC is required before API trading is enabled",
        ],
      },
      {
        type: "callout",
        kind: "tip",
        title: "Why Pi42 if you're Indian",
        text: "Profits settle straight to your INR bank account via Pi42's integrated UPI withdrawal, no USDT → INR conversion headaches, no P2P risk.",
      },
      { type: "h2", text: "What strategies work best on Pi42?" },
      {
        type: "p",
        text: "All 6 AlgoPulse strategies work on Pi42 with minor tuning. Meri Strategy and Supertrend Strategy are good starting choices given Pi42's liquid BTC-INR and ETH-INR futures.",
      },
    ],
  },

  {
    slug: "position-sizing-leverage-money-math",
    title: "Position Sizing, Leverage & Minimum Notional: The Money Math",
    description:
      "The single most important thing to understand about algo trading: how much money is actually at stake per trade. A plain-English breakdown.",
    category: "Risk & Safety",
    author: AUTHOR,
    publishedAt: "2026-04-07T08:30:00.000Z",
    readTime: "6 min",
    tags: ["risk management", "leverage", "position sizing"],
    content: [
      {
        type: "p",
        text: "Most new algo traders blow up because they don't understand the relationship between investment, leverage, and position size. Let's fix that with one page of math and three examples.",
      },
      { type: "h2", text: "The three numbers" },
      { type: "h3", text: "Investment ($)" },
      {
        type: "p",
        text: "The total pool of capital you're committing to one strategy deployment. Think of it as the 'budget'. Stays fixed until you change it.",
      },
      { type: "h3", text: "Position Size (%)" },
      {
        type: "p",
        text: "What fraction of the investment the strategy deploys per trade. 10% means each trade uses 1/10th of the budget as margin.",
      },
      { type: "h3", text: "Leverage (x)" },
      {
        type: "p",
        text: "How much the exchange multiplies your margin. 10x leverage means $10 margin controls a $100 position. Losses are calculated on the $100 notional, not the $10 margin.",
      },
      { type: "h2", text: "The formula that matters" },
      {
        type: "code",
        lang: "text",
        code: "Per-trade notional = Investment × (Position Size / 100) × Leverage\n\nExample 1:  $100 × 10%  × 10x = $100 notional\nExample 2:  $50  × 50%  × 10x = $250 notional\nExample 3:  $500 × 25%  × 5x  = $625 notional",
      },
      {
        type: "p",
        text: "The notional is what actually matters. It has to clear the exchange's minimum (e.g., $23 for Delta India ETH). And every 1% move in the underlying asset moves your notional by 1%, meaning your margin moves by leverage × 1%.",
      },
      { type: "h2", text: "A worked example" },
      {
        type: "p",
        text: "Sanjay deploys Meri Strategy with $100 investment, 10% position size, 10x leverage on ETH/USD at $2300.",
      },
      {
        type: "ul",
        items: [
          "Margin per trade: $100 × 10% = $10",
          "Notional: $10 × 10x = $100",
          "Quantity: $100 / $2300 = 0.0435 ETH",
          "If ETH drops 5%: $100 × 5% = $5 loss on $10 margin = 50% of margin gone",
          "If ETH drops 10%: margin is wiped out, position liquidated",
        ],
      },
      {
        type: "callout",
        kind: "warn",
        title: "Liquidation math",
        text: "At 10x leverage, ~10% adverse move = full margin loss. At 20x, ~5% is all it takes. This is why institutional algos typically run 2x–5x, not 50x.",
      },
      { type: "h2", text: "Our three rules for starters" },
      {
        type: "ol",
        items: [
          "Start with 5x–10x leverage until you have a feel for how the strategy behaves on live markets",
          "Keep position size at 10% or less until you've watched at least 20 trades play out",
          "Never deploy more than 10% of your exchange balance into a single strategy/pair",
        ],
      },
      {
        type: "p",
        text: "Every field in AlgoPulse's deploy dialog is designed so you see these numbers BEFORE you confirm. The 'meets minimum' check is your safety net, not a warning to bypass.",
      },
    ],
  },

  {
    slug: "connect-coindcx-to-algopulse",
    title: "How to Connect CoinDCX Futures to AlgoPulse",
    description:
      "Complete guide to generating a CoinDCX Futures API key, adding it to AlgoPulse, and placing your first automated trade.",
    category: "Broker Setup",
    author: AUTHOR,
    publishedAt: "2026-04-05T09:45:00.000Z",
    readTime: "4 min",
    tags: ["coindcx", "broker", "setup"],
    content: [
      {
        type: "p",
        text: "CoinDCX Futures is one of the largest Indian-owned crypto derivatives exchanges. Here's how to wire up its API to AlgoPulse.",
      },
      { type: "h2", text: "1. Generate the API key" },
      {
        type: "ol",
        items: [
          "Log in to coindcx.com → Settings → Access API",
          "Click Create API Key. Name it 'AlgoPulse'.",
          "Permissions: Read + Trade ON. Withdraw OFF.",
          "IP whitelist: enter AlgoPulse IP if you want extra safety (see FAQ)",
          "Save the API Key + API Secret. The Secret appears ONCE, copy it now.",
        ],
      },
      {
        type: "callout",
        kind: "warn",
        title: "Two products, one API",
        text: "CoinDCX has both spot and futures markets. Make sure 'Futures' is enabled on the key, not just spot. Spot-only keys won't let AlgoPulse open leveraged positions.",
      },
      { type: "h2", text: "2. Connect it in AlgoPulse" },
      {
        type: "ol",
        items: [
          "AlgoPulse → Brokers → Add Broker",
          "Select CoinDCX",
          "Nickname: 'coindcx-futures'",
          "Paste API Key and Secret",
          "Click Connect, AlgoPulse probes balance for confirmation",
        ],
      },
      { type: "h2", text: "3. Minimum order sizes (important)" },
      {
        type: "p",
        text: "CoinDCX futures has a minimum contract size of $24 USDT notional. Your deploy config needs to produce at least that per trade. AlgoPulse validates this live in the deploy dialog.",
      },
      {
        type: "p",
        text: "Rough cheat sheet at 10x leverage and 10% position size:",
      },
      {
        type: "ul",
        items: [
          "$50 investment → $50 notional → below min, won't deploy",
          "$250 investment → $250 notional → comfortable",
          "Or drop position size to 100% on $25 investment → $250 notional → works",
        ],
      },
      { type: "h2", text: "Common errors you might hit" },
      {
        type: "ul",
        items: [
          "'Insufficient funds', your CoinDCX Futures wallet is empty. Transfer from spot to futures wallet inside CoinDCX first.",
          "'Quantity should be divisible by 0.001', AlgoPulse auto-rounds, but if you see this the instrument step size is unusual. Switch pair or contact support.",
          "'IP not allowed', you added an IP restriction without AlgoPulse's IP. Remove it or add the correct IP.",
        ],
      },
    ],
  },

  {
    slug: "connect-delta-india-to-algopulse",
    title: "How to Connect Delta Exchange India to AlgoPulse in 3 Minutes",
    description:
      "Delta India is one of the most popular derivatives exchanges for Indian algo traders. Here's the fastest way to link your account.",
    category: "Broker Setup",
    author: AUTHOR,
    publishedAt: "2026-04-03T12:00:00.000Z",
    readTime: "3 min",
    tags: ["delta india", "broker", "setup"],
    content: [
      {
        type: "p",
        text: "Delta Exchange India (DEI) supports BTC, ETH, SOL, XRP, DOGE, SUI perpetual futures, plus a compliance-first Indian setup. This is the fastest 3-minute walk-through.",
      },
      { type: "h2", text: "1. API key on Delta India" },
      {
        type: "ol",
        items: [
          "Log in to delta.exchange → Account icon → API Keys",
          "Click Create New API Key",
          "Permissions: Read + Trade ON. Withdraw OFF.",
          "IP whitelist: add AlgoPulse's server IP (ask support) for extra protection, or leave open for now",
          "Complete 2FA. Copy the API Key + API Secret.",
        ],
      },
      { type: "h2", text: "2. Paste it in AlgoPulse" },
      {
        type: "ol",
        items: [
          "AlgoPulse → Brokers → Add Broker",
          "Select Delta Exchange India",
          "Nickname: something like 'delta-main'",
          "Paste API Key and API Secret",
          "Click Connect",
        ],
      },
      {
        type: "p",
        text: "AlgoPulse calls Delta's balance endpoint. Green Connected badge + your USD balance means you're live.",
      },
      { type: "h2", text: "3. Minimum order sizes to know" },
      {
        type: "ul",
        items: [
          "ETH/USD:USD, minimum 0.01 ETH (~$23 notional)",
          "BTC/USD:USD, minimum 0.001 BTC (~$65 notional)",
          "SOL/USD:USD, minimum 1 SOL (~$150 notional)",
        ],
      },
      {
        type: "p",
        text: "AlgoPulse's deploy dialog shows these live, if your config produces a trade below the minimum, it won't let you deploy.",
      },
      {
        type: "callout",
        kind: "tip",
        title: "Fastest way to start",
        text: "Investment $50, Leverage 10x, Position Size 50%, Pair ETH/USD:USD. That produces $250 notional trades, comfortably above Delta's 0.01 ETH minimum.",
      },
      { type: "h2", text: "What can go wrong" },
      {
        type: "ul",
        items: [
          "'Signature invalid', you copied the API Key into the Secret field (or vice versa). Double-check.",
          "'Permission denied', the key wasn't given Trade permission. Regenerate with Trade checked.",
          "'Rate limit exceeded', too many deploys in quick succession. Wait 30 seconds and retry.",
        ],
      },
    ],
  },

  {
    slug: "5-mistakes-first-algo-strategy",
    title: "5 Mistakes to Avoid When Deploying Your First Algo Strategy",
    description:
      "Every new algo trader makes at least three of these. Here's what to watch for so you don't have to learn the hard way.",
    category: "Risk & Safety",
    author: AUTHOR,
    publishedAt: "2026-04-01T10:00:00.000Z",
    readTime: "5 min",
    tags: ["beginner", "mistakes", "risk management"],
    content: [
      {
        type: "p",
        text: "We've watched hundreds of deployments over the last few months. These are the 5 mistakes that show up again and again.",
      },
      { type: "h2", text: "Mistake 1, Going straight to max leverage" },
      {
        type: "p",
        text: "New traders see 100x leverage on the exchange and assume that's the interesting setting. It isn't, it's the liquidation setting. A 1% adverse move at 100x wipes out your margin. Professional algos run 2x–5x.",
      },
      {
        type: "callout",
        kind: "tip",
        text: "Start at 5x. Watch how the strategy behaves for a week. If drawdowns feel manageable, try 10x. Don't go higher without a reason.",
      },
      { type: "h2", text: "Mistake 2, Ignoring the backtest report" },
      {
        type: "p",
        text: "A flashy ROI number doesn't mean a strategy is safe. The backtest report also shows max drawdown, Sharpe ratio, and MDD recovery days, those are the numbers that predict whether you'll stick with the strategy when it has a losing week.",
      },
      { type: "h2", text: "Mistake 3, Deploying the minimum amount to 'test it'" },
      {
        type: "p",
        text: "Counter-intuitive, but: deploying $5 on Delta India with the default 10% position size produces $0.50 trades, which fail because they're below the broker's minimum contract. The strategy looks broken but isn't. Start with at least $50.",
      },
      {
        type: "callout",
        kind: "info",
        text: "AlgoPulse's deploy dialog now warns you upfront when the math produces a sub-minimum trade, the green/red badge is not cosmetic.",
      },
      { type: "h2", text: "Mistake 4, Running 6 strategies on the same pair" },
      {
        type: "p",
        text: "Two strategies on ETH that both go long on crossovers will open at nearly the same time, eating the same market move twice and doubling your exposure without doubling your edge. Diversify across pairs, not strategies on one pair.",
      },
      { type: "h2", text: "Mistake 5, Pulling the plug during the first drawdown" },
      {
        type: "p",
        text: "Even a 60% win rate strategy will have losing streaks. If the backtest says max drawdown is 20%, seeing your account down 18% in week 3 is expected, not a bug. Stop only if current drawdown exceeds historical max by 1.5×.",
      },
      {
        type: "quote",
        text: "The biggest edge in algo trading isn't the strategy, it's the discipline to leave it alone.",
      },
      { type: "h2", text: "Bonus: the one thing experienced traders do" },
      {
        type: "p",
        text: "They paper-trade for a week before going live. AlgoPulse doesn't yet have a native paper-trading mode (on the roadmap), so the next-best thing is to deploy a strategy with tiny capital and treat the first 10 trades as learning, not earning.",
      },
    ],
  },
];

/** Get all blogs sorted newest-first. */
export function getBlogs(): Blog[] {
  return [...blogs].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

/** Get one blog by slug. */
export function getBlogBySlug(slug: string): Blog | null {
  return blogs.find((b) => b.slug === slug) ?? null;
}
