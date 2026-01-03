# Zillions Core - Scalable Node.js Trading Bot

**Zillions Core** is a professional-grade, scalable, and modular trading bot engine built with Node.js, TypeScript, and a Hexagonal Architecture. It is designed to be exchange-agnostic, strategy-pluggable, and production-ready with built-in risk management and structured logging.

---

## Table of Contents

- [🚀 Key Features](#key-features)
- [🛠 Prerequisites](#prerequisites)
- [📦 Installation](#installation)
- [🏃‍♂️ Usage](#usage)
- [📦 Zillions SDK](#zillions-sdk)
- [🐳 Deployment](#deployment)
  - [Docker](#docker)
  - [PM2 (VPS/Bare Metal)](#pm2-vps-bare-metal)
  - [Vercel (Serverless / Production)](#vercel-serverless-production)
    - [💡 Vercel Hobby Plan (Free Tier)](#vercel-hobby-plan-free-tier)
- [🛠 Available Strategies](#available-strategies)
- [🏛 Architecture](#architecture)
- [🧩 Adding Strategies](#adding-strategies)
  - [Basic Strategy (Signal-Based)](#basic-strategy-signal-based)
  - [Advanced Strategy (Custom ST/TP Logic)](#advanced-strategy-custom-sttp-logic)
  - [Strategy Capabilities](#strategy-capabilities)
  - [Registering Your Strategy](#registering-your-strategy)
- [🛡 Risk Management](#risk-management)
  - [RiskManager](#riskmanager)
  - [Leverage Support](#leverage-support)
  - [TradeManager](#trademanager)
    - [Trailing Stop Loss](#trailing-stop-loss)
  - [Position Management](#position-management)
    - [Signal Conflict Resolution](#signal-conflict-resolution)
    - [Configuration](#configuration)
    - [How It Works](#how-it-works)
    - [Strategy Control](#strategy-control)
    - [Default Behavior](#default-behavior)
  - [PortfolioManager](#portfoliomanager)
- [🔮 Roadmap](#roadmap)
- [🚀 REST API](#rest-api)
  - [Running the API & Dashboard](#running-the-api--dashboard)
  - [Endpoints](#endpoints)
  - [Triggering a Backtest](#triggering-a-backtest)
- [🤝 Contributing](#contributing)
- [🔗 Connect](#connect)

## 🚀 Key Features

*   **Hexagonal Architecture**: Core logic is isolated from external adapters (Exchanges, Database), allowing easy swapping of components.
*   **Multi-Exchange Support**:
    *   **Real Market Data**: Decoupled data provider supporting `Binance Public API` (Free, no-auth) for Paper Trading and Backtesting.
    *   **Paper Trading**: Simulated matching engine using real-world price data for realistic testing.
    *   **Prepared for**: Binance, Hyperliquid, Drift, CCXT, OKX (Stubs ready).
*   **Robust Risk Management**:
    *   **TradeManager**: Global position management system that monitors all open positions across all symbols and strategies.
    *   **Automated Protection**: Stop Loss and Take Profit execution with real-time price monitoring.
    *   **Middleware Checks**: Max Order Size and Daily Drawdown limits.
*   **Backtesting Engine**: Dedicated runner to validate strategies against historical market data (no random walks).
*   **Live Historical Replay**: Simulate paper trading over historical periods using real engine logic and persist results to Supabase.
*   **Strategy System**: Pluggable strategy interface. Simply add a new class to `src/strategies`.
*   **Persistence**: Integration with **Supabase** (PostgreSQL) for trade history and portfolio snapshots.
*   **Production Ready**:
    *   **Smart Polling**: Interval-based execution loop to minimize API overhead and synchronize with candle boundaries.
    *   **Structured Logging**: JSON-formatted logs via `winston`.
    *   **Dockerized**: Optimized multi-stage `Dockerfile`.
    *   **Process Management**: `PM2` ecosystem config included.

---

## 🛠 Prerequisites

- **Node.js**: v18+
- **npm**: v9+
- **Supabase**: (Optional) For data persistence.
- **Docker**: (Optional) For containerized deployment.

---

## 📦 Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/zillion-core.git
    cd zillion-core
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    Copy the example configuration:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` to configure your exchange and database credentials:
    ```env
    NODE_ENV=development
    EXCHANGE_DRIVER=PAPER  # Options: PAPER, BINANCE, HYPERLIQUID, DRIFT, CCXT, OKX
    PAPER_INITIAL_BALANCE=10000
    SUPABASE_URL=your-supabase-url
    SUPABASE_KEY=your-supabase-key
    STRATEGY_NAME=MACD
    STRATEGY_SYMBOL=BTC/USDT
    STRATEGY_INTERVAL=1m
    POSITION_SIZE_PERCENT=10
    MAX_DAILY_DRAWDOWN_PERCENT=5
    DEFAULT_STOP_LOSS_PERCENT=5
    DEFAULT_TAKE_PROFIT_PERCENT=10
    LEVERAGE_ENABLED=false
    LEVERAGE_VALUE=5
    TRAILING_STOP_ENABLED=true
    TRAILING_STOP_ACTIVATION_PERCENT=2
    TRAILING_STOP_TRAIL_PERCENT=1
    ALLOW_MULTIPLE_POSITIONS=false  # Allow hedging/multiple positions
    CLOSE_ON_OPPOSITE_SIGNAL=false  # Close existing position on opposite signal
    ```

4.  **Database Setup (Supabase)**:
    Run the SQL methods found in `supabase_schema.sql` in your Supabase SQL Editor to create the necessary tables (`trades`, `portfolio_snapshots`, `backtest_results`).

---

## 🏃‍♂️ Usage

### Development Mode
Runs the bot with hot-reloading.
```bash
npm run dev
```

### Production Mode
Builds the TypeScript code and starts the optimized engine.
```bash
npm run build
npm start
```

### Backtesting
Runs the simulation runner against historical data. Includes Winrate, Profit Factor, and Buy & Hold benchmarks.
```bash
npm run backtest
```

### Live Historical Replay
Simulates paper trading over a historical period (e.g., last 90 days) using the live engine logic. Results are stored in the main database alongside live trades for analysis in your dashboard.
```bash
npm run replay
```
**Options:**
- `--symbol`: Trading pair (default: from .env)
- `--interval`: Timeframe (default: from .env)
- `--days`: Number of days to replay (default: 90)

**Example:**
```bash
npm run replay -- --symbol=ETH/USDT --interval=1h --days=30
```

### Testing
Runs the Jest test suite (Unit & Integration).
```bash
npm test
```

### Strategy Configuration
Zillion Core supports runtime strategy configuration for both long-running and serverless deployments:

#### Long-Running Bots (`src/index.ts`)
```typescript
const bot = new BotEngine('MACD');
await bot.start('BTC/USDT', '15m', {
  // Strategy-specific configuration
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9
});
```

#### Serverless Bots (`api/cron.ts`)
```typescript
const bot = new BotEngine('MACD');
await bot.tick('BTC/USDT', '15m', {
  // Same configuration options available
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30
});
```

**Benefits:**
- **Dynamic Configuration**: Adjust strategy parameters without code changes
- **Environment Flexibility**: Different configs for development/production
- **Strategy Agnostic**: Works with any strategy that accepts configuration
- **Serverless Compatible**: Full configuration support in stateless deployments

### Strategy Auto-Configuration

Zillion Core includes **dynamic, research-backed default parameters** for all standard strategies. These defaults are automatically applied based on your configured timeframe (`STRATEGY_INTERVAL`) if no custom parameters are provided.

**How It Works:**
1.  **Check Config**: The bot first checks for explicitly provided parameters (e.g., in `src/index.ts` or via API).
2.  **Load Dynamic Default**: If no custom config is found, it loads optimal defaults for the current `STRATEGY_INTERVAL` (e.g., "Scalping" settings for `1m`/`5m`, "Trend" settings for `1h`/`4h`).
3.  **Fallback**: If no timeframe match is found, it falls back to a hardcoded safe default.

**Supported Strategies:**
All standard strategies (`MACD`, `RSI`, `BB`, `STOCH`, etc.) support this dynamic loading. You can view and edit these defaults in:
`src/config/strategy_defaults.ts`

**Example Precedence:**
`User Config` > `Timeframe Default (1m, 1h, etc.)` > `Hardcoded Fallback`

**Supported Timeframes:**
- `1m`, `5m` (Scalping)
- `15m`, `1h`, `4h` (Intraday/Swing)
- `1d` (Long-term)

### Custom Configuration Examples

You can easily override these defaults by passing your own values during bot initialization.

**Long-Running Bot (`src/index.ts`):**
```typescript
// Override defaults for MACD on 15m timeframe
await bot.start('BTC/USDT', '15m', {
  fast: 14,   // Custom Fast EMA
  slow: 28,   // Custom Slow EMA
  signal: 9   // Standard Signal
});
```

**Serverless Cron (`api/cron.ts`):**
```typescript
// Override defaults for RSI on 1h timeframe
await bot.tick('ETH/USDT', '1h', {
  rPeriod: 21,    // Custom RSI Period
  kPeriod: 3,
  dPeriod: 3
});
```


---

## � Zillions SDK

You can use Zillions Core as an SDK in your own projects to build custom trading applications or deploy to serverless environments.

### 1. Installation
In your new project, add Zillions Core as a dependency:
```bash
npm install zillions
```

### 2. Basic Usage
Import the `BotEngine` and start the bot with a built-in strategy:
```typescript
import { BotEngine, startApi } from 'zillions';

async function main() {
    // Optional: Start the dashboard on port 3000
    startApi(3000);

    const bot = new BotEngine('MACD');
    await bot.start('BTC/USDT', '15m');
}
```

### 3. Injecting Custom Strategies
The SDK allows you to implement and inject your own strategies from outside the library.

```typescript
import { BotEngine, IStrategy, Candle, Signal } from 'zillions';

class MyCustomStrategy implements IStrategy {
    name = 'MyCustomStrategy';
    
    async init(config: any) {
        // Initialize logic
    }

    async update(candle: Candle): Promise<Signal | null> {
        // Your custom logic
        return {
            symbol: candle.symbol,
            action: 'BUY'
        };
    }
}

const bot = new BotEngine(new MyCustomStrategy());
await bot.start('BTC/USDT', '1h');
```

### 4. Serverless / Vercel Usage
For serverless environments, use the `tick()` method to run the engine in a stateless manner:

```typescript
import { BotEngine } from '@zillions/core';

export default async function handler(req, res) {
    const bot = new BotEngine(new MyCustomStrategy());
    
    // Execute one cycle (fetches data, manage positions, update strategy)
    await bot.tick('BTC/USDT', '1h');
    
    res.status(200).json({ status: 'ok' });
}
```

---

## 🐳 Deployment

### Docker
1.  **Build Image**:
    ```bash
    docker build -t zillion-core .
    ```
2.  **Run Container**:
    ```bash
    docker run -d --env-file .env --name zillion-bot zillion-core
    ```

### PM2 (VPS/Bare Metal)
Zillion includes an `ecosystem.config.js` for process management.
```bash
npm install -g pm2
npm run build
pm2 start ecosystem.config.js
```

### Vercel (Serverless / Production)
Zillion is optimized for Vercel Cron deployment. This mode uses a "pulsed" execution model where the bot runs once per minute and state is recovered from Supabase.

1.  **Preparation**:
    - **Database**: You **must** use Supabase for Vercel deployment. Run the SQL in `supabase_schema.sql` AND the migration script in `walkthrough.md` in your Supabase SQL Editor.
2.  **Deployment**:
    - Import your project into Vercel.
    - Add the following **Environment Variables** in the Vercel Dashboard:
        - `SUPABASE_URL` / `SUPABASE_KEY`
        - `EXCHANGE_DRIVER` (use `BINANCE` or `CCXT` for real trading)
        - `EXCHANGE_API_KEY` / `EXCHANGE_API_SECRET`
        - `STRATEGY_NAME`, `STRATEGY_SYMBOL`, `STRATEGY_INTERVAL`
        - `CRON_SECRET`: Generate a random string (e.g. via `openssl rand -base64 32`).
3.  **Security**:
    - Vercel will automatically detect `vercel.json` and protect your cron endpoint using the `CRON_SECRET`.
    - The Express Dashboard API is also accessible at `https://your-domain.vercel.app/api/...` via the bridging setup.

#### 💡 Vercel Hobby Plan (Free Tier)
Vercel Hobby limited crons to **once per day**. To run your bot every minute for free:
1.  **Use an External Pinger**: Sign up for a free service like [Cron-job.org](https://cron-job.org/).
2.  **Configure the Job**:
    - **URL**: `https://your-project.vercel.app/api/cron`
    - **Schedule**: Every 1 minute.
    - **Headers**: Add `Authorization: Bearer your_cron_secret_here`.
3.  **Execution**: This will "wake up" your Vercel function every minute, bypassing the built-in cron limit.

> [!IMPORTANT]
> When running on Vercel, the bot does **not** use `npm start`. It is triggered automatically by the Vercel Cron scheduler (Pro) or an External Pinger (Hobby). Ensure you do not have the same account running locally simultaneously to avoid duplicate orders.

---
 
 ## 🛠 Available Strategies
 
 Zillion includes 24 professional-grade strategies from the `indicatorts` library, organized by category:
 
 | Category | Strategies |
 | :--- | :--- |
 | **Trend** | `MACD`, `APO`, `AROON`, `BOP`, `CFO`, `KDJ`, `PSAR`, `TYPPRICE`, `VWMA`, `VORTEX` |
 | **Momentum** | `AO`, `ICHIMOKU`, `RSI2`, `STOCH`, `WILLR` |
 | **Volatility** | `BB`, `AB`, `PO` |
 | **Volume** | `CMF`, `EMV`, `FI`, `MFI`, `NVI`, `VWAP` |
 
 ---
 
## 🏛 Architecture

```
src/
├── index.ts           # Main entry point
├── core/               # Domain Logic (Engine, Risk Manager, Logger)
├── interfaces/         # Port Definitions (IExchange, IStrategy, IDataStore)
├── adapters/
│   ├── exchange/       # Adapters (Paper, Binance, Hyperliquid...)
│   └── database/       # Adapters (Supabase)
├── api/                # REST API routes and server
├── strategies/         # Trading Strategies
├── backtest/           # Backtesting module
└── config/             # Zod-typed Env validation
```

---

## 🧩 Adding Strategies

Zillion's strategy system is highly extensible. You can create simple signal-based strategies or complex strategies with custom exit logic.

### Basic Strategy (Signal-Based)

For simple strategies that generate entry signals with static exits:

1.  **Create a file**: `src/strategies/my_strategy.ts`
2.  **Implement the Interface**:
    ```typescript
    import { IStrategy } from '../interfaces/strategy.interface';
    import { Candle, Signal } from '../core/types';

    export class MyStrategy implements IStrategy {
        name = 'MY_STRATEGY';

        init(config: any): void {
            // Load parameters
        }

        async update(candle: Candle): Promise<Signal | null> {
            // Your entry logic here...
            if (candle.close > 100) {
                return {
                    action: 'BUY',
                    symbol: candle.symbol,
                    stopLoss: 5,    // 5% stop loss
                    takeProfit: 10, // 10% take profit
                    forceClose: false // Optional: force close conflicting positions
                };
            }
            return null; // HOLD
        }
    }
    ```

### Advanced Strategy (Custom ST/TP Logic)

For strategies with dynamic stop losses, custom exit conditions, or complex position management:

```typescript
import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { Candle, Signal, Trade } from '../core/types';

export class AdvancedStrategy implements IStrategy {
    name = 'ADVANCED_STRATEGY';
    private positionCount = 0;

    init(config: StrategyConfig): void {
        // Initialize with config
    }

    async update(candle: Candle): Promise<Signal | null> {
        // Entry logic - can still use static SL/TP or rely on checkExit
        if (this.shouldEnter(candle)) {
            return {
                action: 'BUY',
                symbol: candle.symbol,
                stopLoss: 2, // Wide initial stop, will be managed dynamically
                takeProfit: 20
            };
        }
        return null;
    }

    async checkExit(trade: Trade, candle: Candle): Promise<'HOLD' | 'CLOSE' | { action: 'UPDATE_SL' | 'UPDATE_TP' | 'PARTIAL_CLOSE', quantity?: number, newPrice?: number }> {
        const profitPercent = calculateProfitPercent(trade, candle.close);

        // Dynamic trailing stop based on profit
        if (profitPercent > 3) {
            const trailPercent = Math.min(1.5, profitPercent * 0.3); // Tighter trail as profit grows
            const newSL = trade.side === 'BUY'
                ? candle.close * (1 - trailPercent / 100)
                : candle.close * (1 + trailPercent / 100);

            return { action: 'UPDATE_SL', newPrice: newSL };
        }

        // Time-based exit (avoid holding overnight)
        const positionAge = Date.now() - trade.timestamp;
        if (positionAge > 8 * 60 * 60 * 1000) { // 8 hours
            return 'CLOSE';
        }

        // Momentum-based exit
        if (this.detectReversal(candle)) {
            return 'CLOSE';
        }

        return 'HOLD';
    }

    async onPositionOpened(trade: Trade): Promise<void> {
        this.positionCount++;
        console.log(`Position opened: ${trade.id}, total positions: ${this.positionCount}`);
        // Set up custom tracking, alerts, etc.
    }

    async onPositionClosed(trade: Trade): Promise<void> {
        this.positionCount--;
        const pnl = calculatePnL(trade);
        console.log(`Position closed: ${trade.id}, PnL: ${pnl}%, total positions: ${this.positionCount}`);
        // Performance analysis, logging, etc.
    }

    private shouldEnter(candle: Candle): boolean {
        // Your entry conditions
        return candle.close > this.calculateSupport(candle.symbol);
    }

    private detectReversal(candle: Candle): boolean {
        // Custom reversal detection logic
        return false; // Placeholder
    }

    private calculateSupport(symbol: string): number {
        // Calculate support level
        return 0; // Placeholder
    }
}

function calculateProfitPercent(trade: Trade, currentPrice: number): number {
    return trade.side === 'BUY'
        ? ((currentPrice - trade.price) / trade.price) * 100
        : ((trade.price - currentPrice) / trade.price) * 100;
}

function calculatePnL(trade: Trade): number {
    if (!trade.exitPrice) return 0;
    return calculateProfitPercent(trade, trade.exitPrice);
}
```

### Strategy Capabilities

| Feature | Basic Strategy | Advanced Strategy |
|---------|---------------|-------------------|
| Entry Signals | ✅ | ✅ |
| Static SL/TP | ✅ | ✅ |
| Force Close | ✅ | ✅ |
| Dynamic SL/TP | ❌ | ✅ |
| Custom Exit Logic | ❌ | ✅ |
| Position Lifecycle Hooks | ❌ | ✅ |
| Partial Closes | ❌ | ✅ |
| Time-based Exits | ❌ | ✅ |
| Momentum-based Exits | ❌ | ✅ |

### Registering Your Strategy

3.  **Register it**:
    Open `src/core/strategy.manager.ts` and add it to the map:
    ```typescript
    import { MyStrategy } from '../strategies/my_strategy';
    // ...
    private static strategies = new Map([
        ['SMA_CROSSOVER', SmaCrossoverStrategy],
        ['MY_STRATEGY', MyStrategy] // <-- Add this
    ]);
    ```

4.  **Run it**: Update `.env` or use environment variables:
    ```env
    STRATEGY_NAME=MY_STRATEGY
    STRATEGY_SYMBOL=ETH/USDT
    STRATEGY_INTERVAL=5m
    ```

---

## 🛡 Risk Management

### RiskManager
The `RiskManager` module (`src/core/risk.manager.ts`) implements **professional risk management** following the "Golden Sequence":

1. **Risk Per Trade**: Fixed percentage of equity risked per trade (Default: 1%)
2. **Technical SL Levels**: Stop Loss based on percentages of entry price (chart-based levels)
3. **Position Sizing**: Calculated to match risk amount with technical SL distance

**Key Features:**
- **Risk-Based Position Sizing**: Position size = (Risk % × Equity) ÷ SL Distance
- **Consistent Risk**: Every trade risks the same percentage of your account
- **Technical SL/TP**: Exit levels based on entry price percentages (professional standard)
- **Daily Drawdown Protection**: Halts trading if equity drops by a specific percentage from the start-of-day balance. Resets daily at 00:00 UTC. (Default: 5%)
- **Max Open Trades**: Limits the total number of concurrent open positions to prevent over-exposure. (Default: 10)

### Leverage Support
Zillion Core includes **professional leveraged trading** with built-in safety measures:

**How It Works:**
- **Margin Trading**: Control larger positions with less capital
- **Amplified Position Sizing**: Leverage multiplies position size for same risk level
- **Safety Limits**: Automatic position reduction to prevent over-leveraging
- **Liquidation Protection**: Losses capped at margin amount (no account blowup)

**Key Calculations:**
- **Margin Required**: `position_value ÷ leverage`
- **Position Size**: `(risk_amount × leverage) ÷ sl_distance`
- **P&L**: Percentage returns (leverage doesn't amplify profit/loss percentages)
- **Liquidation**: Losses cannot exceed margin amount

**Safety Features:**
- **Margin Limits**: Maximum 95% of balance can be used as margin
- **Position Caps**: Maximum position size limited to prevent over-exposure
- **Automatic Reduction**: Position sizes reduced if they would exceed safety limits
- **Balance Protection**: Emergency buffers prevent account depletion

**Configuration:**
```env
LEVERAGE_ENABLED=true
LEVERAGE_VALUE=5          # 5x leverage
RISK_PER_TRADE_PERCENT=1  # 1% risk per trade
MAX_LEVERAGE_UTILIZATION=50  # Max 50% leverage utilization (conservative)
```

**Example with 5x Leverage:**
- Account: $10,000
- Risk: 1% ($100)
- SL: 5% of entry price
- Position Size: ($100 × 5) ÷ (5% × price) = Larger position with same $100 risk
- Margin Used: 20% of account (safe buffer maintained)

### TradeManager
The `TradeManager` (`src/core/trade.manager.ts`) provides **global position management** across all trading activities:
- **Centralized Monitoring**: Tracks all open positions from any strategy or symbol in real-time.
- **Automated SL/TP Execution**: Continuously monitors price movements and automatically executes stop-loss and take-profit orders.
- **Trailing Stop Loss**: Dynamic stop loss that trails behind profitable price movements.
- **Multi-Position Support**: Unlike the previous single-position-per-engine limitation, TradeManager handles unlimited concurrent positions.
- **Cross-Strategy Protection**: Ensures risk management works regardless of which strategy opened the position.
- **Real-time Price Tracking**: Uses live market data to check exit conditions on every tick.

**Key Benefits:**
- **No Position Left Behind**: Even if a strategy instance stops, positions remain protected.
- **Improved Risk Control**: Centralized system prevents conflicting risk management logic.
- **Scalability**: Supports multiple strategies running simultaneously with proper position isolation.

#### Trailing Stop Loss
The Trailing Stop Loss feature provides **dynamic risk management** that locks in profits as price moves favorably:

- **Activation Threshold**: Trailing begins when profit reaches a configurable percentage (default: 2%).
- **Trail Distance**: Stop loss follows price at a specified distance (default: 1%).
- **Automatic Adjustment**: Stop loss moves up (BUY positions) or down (SELL positions) as price continues in your favor.
- **Break-even Protection**: Ensures you never lose money on profitable trades.

**Configuration:**
```env
TRAILING_STOP_ENABLED=true
TRAILING_STOP_ACTIVATION_PERCENT=2
TRAILING_STOP_TRAIL_PERCENT=1
```

**Benefits:**
- **Maximize Profits**: Capture more upside while protecting gains
- **Reduce Drawdown**: Smaller losses on reversals
- **Set-and-Forget**: Automatic adjustment requires no manual intervention

### Position Management
Zillion Core provides flexible position management to handle conflicting signals and maintain strategy control over risk management:

#### Signal Conflict Resolution
When a strategy generates a new signal while positions are already open, you can configure how the system responds:

- **Close on Opposite Signal** (`CLOSE_ON_OPPOSITE_SIGNAL=true`): Automatically closes existing positions when a strategy signals the opposite direction. This prevents holding conflicting positions and ensures the strategy's latest intent is executed.
- **Allow Multiple Positions** (`ALLOW_MULTIPLE_POSITIONS=true`): Enables hedging by allowing multiple positions to be open simultaneously. The strategy can build complex position structures.
- **Force Close** (Signal-level): Strategies can include `forceClose: true` in their signal to override all risk management and immediately close conflicting positions before opening new ones.

#### Configuration
```env
# Position Management
ALLOW_MULTIPLE_POSITIONS=false  # Allow hedging/multiple positions
CLOSE_ON_OPPOSITE_SIGNAL=false  # Close existing position on opposite signal
```

#### How It Works
1. **Signal Generation**: Strategy always generates signals regardless of existing positions
2. **Conflict Detection**: Engine checks for positions that conflict with the new signal
3. **Resolution**: Applies configured behavior:
   - Force close conflicting positions if `signal.forceClose=true`
   - Close positions on opposite signals if `CLOSE_ON_OPPOSITE_SIGNAL=true`
   - Skip new signals if multiple positions not allowed and positions exist
   - Allow new positions alongside existing ones if `ALLOW_MULTIPLE_POSITIONS=true`

#### Strategy Control
Strategies maintain full control over position management:
```typescript
// Force close existing positions before opening new one
return {
    action: 'SELL',
    symbol: 'BTC/USDT',
    forceClose: true  // Closes all conflicting positions immediately
};
```

#### Default Behavior
By default, maintains backward compatibility - waits for positions to close naturally (via SL/TP) before opening new ones.

**Benefits:**
- **Strategy Autonomy**: Strategies can override risk management when needed
- **Flexible Risk Management**: Choose between conservative single-position or aggressive multi-position approaches
- **Conflict Prevention**: Avoid unintended hedging or conflicting positions
- **Backward Compatible**: Existing configurations continue to work unchanged

### PortfolioManager
The `PortfolioManager` (`src/core/portfolio.manager.ts`) provides **comprehensive portfolio analytics and snapshot generation**:
- **Real-time Metrics**: Calculates PnL, Win Rate, Profit Factor, and other key performance indicators.
- **Position Tracking**: Maintains detailed information about open and closed trades with current valuations.
- **Equity Monitoring**: Tracks current balance and equity including unrealized gains/losses.
- **Automated Snapshots**: Generates portfolio snapshots periodically (every 5 minutes) for performance tracking.
- **Historical Analysis**: Stores complete trade history with entry/exit prices and realized PnL.

**Key Metrics Calculated:**
- **PnL**: Total realized profit/loss from closed trades.
- **Win Rate**: Percentage of profitable trades (0-100%).
- **Profit Factor**: Ratio of gross profits to gross losses.
- **Open Trades**: Current positions with unrealized PnL based on live market prices.
- **Closed Trades**: Historical trades with confirmed realized PnL.
- **Current Equity**: Total account value including unrealized gains/losses (`Wallet Balance + Unrealized PnL`).
- **Current Balance**: Available cash balance for new trades (`Wallet Balance - Used Margin`). **Note**: This intelligently falls back to a calculated value if the exchange API is unavailable.

**Key Benefits:**
- **Performance Tracking**: Monitor trading performance with industry-standard metrics.
- **Risk Assessment**: Evaluate strategy effectiveness through comprehensive analytics.
- **Portfolio Visibility**: Real-time view of all positions and their current status.
- **Historical Records**: Complete audit trail of all trading activity.

> [!NOTE]
> All risk management percentages are configured as full numbers in the `.env` file (e.g., `5` means `5%`).

---

## 🔮 Roadmap

- [ ] **Exchange Support**: Implement Drift.trade adapter.
- [ ] **Exchange Support**: Implement Hyperliquid adapter.
- [x] **Strategies**: Implement standard strategy library (RSI, MACD, etc.).
- [x] **Connectivity**: REST APIs for custom dashboards.
- [ ] **Connectivity**: WebSocket for custom dashboards.
- [x] **UI**: Build a simple in-built dashboard.
- [ ] **Intelligence**: AI/ML implementation for signal optimization.

## 🚀 REST API

Zillion Core includes a built-in REST API to expose data and control the bot.

### Running the API & Dashboard
The API and Dashboard now start automatically when you run the main bot. Simply open [http://localhost:3000](http://localhost:3000) while the bot is running.

If you want to run **only** the API server:
```bash
npm run api
```

### Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | System health check. |
| `/api/portfolio` | `GET` | Get the latest portfolio snapshot (balance, equity). |
| `/api/trades` | `GET` | Get recent trade execution history. |
| `/api/backtests` | `GET` | Get previous backtest results. |
| `/api/backtest/run` | `POST` | Trigger a new backtest. |

#### Triggering a Backtest
**Request Body:**
```json
{
  "strategyName": "MACD",
  "symbol": "BTC/USDT",
  "interval": "1h"
}
```


## 🤝 Contributing
We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

---

**License**: Apache License 2.0. contains **NOTICE** file with mandatory attribution to **Zillions.app** / **@christonomous**.

---

## 🔗 Connect

*   **App**: 
    *   [Website](https://zillions.app)
    *   [GitHub](https://github.com/zillionsapp)
*   **Founder**: **@christonomous**
    *   [Website](https://chris.berlin)
    *   [GitHub](https://github.com/christonomous)
    *   [X.com](https://x.com/christonomous)
    *   [LinkedIn](https://linkedin.com/in/christonomous)
    *   [Instagram](https://instagram.com/christonomous)
