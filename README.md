# Zillions Core - Scalable Node.js Trading Bot

**Zillions Core** is a professional-grade, scalable, and modular trading bot engine built with Node.js, TypeScript, and a Hexagonal Architecture. It is designed to be exchange-agnostic, strategy-pluggable, and production-ready with built-in risk management and structured logging.

---

## Table of Contents

- [🚀 Key Features](#key-features)
- [🛠 Prerequisites](#prerequisites)
- [📦 Installation](#installation)
- [🏃‍♂️ Usage](#usage)
- [📦 Zillions SDK](#zillions-sdk)
  - [Setup](#setup)
  - [Basic Usage](#basic-usage)
  - [Custom Strategies](#custom-strategies)
  - [Serverless / Vercel Usage](#serverless--vercel-usage)
- [🛠 Available Strategies](#available-strategies)
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
- [ Deployment](#deployment)
  - [Docker](#docker)
  - [PM2 (VPS/Bare Metal)](#pm2-vps-bare-metal)
  - [Vercel (Serverless / Production)](#vercel-serverless-production)
    - [💡 Vercel Hobby Plan (Free Tier)](#vercel-hobby-plan-free-tier)
- [🏦 Vault System](#vault-system)
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
*   **Vault System**: Implementation of a decentralized-style vault for pooled funding. Automatically manages share prices (LPs) based on portfolio performance and handles dynamic deposits/withdrawals.
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

2.  **Install & Build for SDK Usage**:
    ```bash
    npm install
    npm run build
    npm link # Makes the 'zillions' package available locally
    ```

> [!TIP]
> After running `npm link` in this directory, you can use the SDK in any other local project by running `npm link zillions` in that project's root.

3.  **Environment Setup**:
    Copy the example configuration:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` to configure your exchange and database credentials:
    ```env
    NODE_ENV=development

    # Exchange Selection
    EXCHANGE_DRIVER=PAPER

    # Paper Trading Settings
    PAPER_INITIAL_BALANCE=10000
    PAPER_BALANCE_ASSET=USDT

    # Vault Settings
    VAULT_ENABLED=false
    VAULT_SHARE_ASSET=ZILLIONS

    # Supabase (Service role key required for vault access)
    # IMPORTANT: Use the SERVICE ROLE key (not anon key) to bypass RLS and keep data private
    # Find this in: Supabase Dashboard → Settings → API → service_role key
    SUPABASE_URL=
    SUPABASE_KEY=

    # Strategy Settings
    STRATEGY_NAME=MACD
    STRATEGY_SYMBOL=BTC/USDT
    STRATEGY_INTERVAL=1d

    # Real-time Monitoring (seconds between checks)
    TICK_INTERVAL_SECONDS=30

    # Leverage Settings
    LEVERAGE_ENABLED=true
    LEVERAGE_VALUE=5
    MAX_LEVERAGE_UTILIZATION=50

    # Vercel / Cron Configuration
    CRON_SECRET=your_random_secret_string_here

    # Risk Management (All percentages as full numbers, e.g. 5 = 5%)
    MAX_DAILY_DRAWDOWN_PERCENT=3
    MAX_TOTAL_RISK_PERCENT=10
    MAX_POSITION_SIZE_PERCENT=10
    DEFAULT_STOP_LOSS_PERCENT=2
    DEFAULT_TAKE_PROFIT_PERCENT=6
    RISK_PER_TRADE_PERCENT=1

    # Trailing Stop Loss
    TRAILING_STOP_ENABLED=true
    TRAILING_STOP_ACTIVATION_PERCENT=1
    TRAILING_STOP_TRAIL_PERCENT=1

    # Position Management
    ALLOW_MULTIPLE_POSITIONS=false
    CLOSE_ON_OPPOSITE_SIGNAL=true
    MAX_OPEN_TRADES=5
    ```

4.  **Database Setup (Supabase)**:
    Run the SQL methods found in `supabase_schema.sql` in your Supabase SQL Editor to create the necessary tables (`trades`, `portfolio_snapshots`, `backtest_results`).

### 🎯 Want to Enable User Invitations & Commission System?

The core bot runs standalone with basic Supabase tables. If you want to **offer your trading bot to other users** and enable a referral/commission system:

👉 **Head over to the [Zillions App Repository](https://github.com/zillionsapp/zillion-app)**

The app extends the core with:
- **User Authentication** - Users can sign up and manage their accounts
- **Invitation System** - Create referral links with custom commission rates (e.g., 10%)
- **Commission Tracking** - Real-time commission payments to inviters when their referrals profit
- **Dashboard UI** - User-friendly interface to view portfolios, trades, and earnings

**How the Commission System Works:**
1. Users create invite links with configurable commission rates (e.g., 5%, 10%, 15%)
2. New users register using an invite code
3. When a referred user closes a **profitable trade**, the inviter earns a commission
4. Commissions are calculated per-trade in real-time by the bot
5. Both inviter and invited user can view their commission history in the app

**Database Setup for App+Bot:**
If you deploy the app, run `app/frontend_schema.sql` instead of the basic `supabase_schema.sql` - it includes all tables for the commission system.

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

### Strategy Comparison Backtesting
Runs comprehensive backtests comparing all 24 built-in strategies against each other. Generates detailed reports with rankings, performance metrics, and Buy&Hold analysis.
```bash
npm run backtest:compare
```

**Features:**
- **All Strategies**: Automatically tests all available strategies (24 total)
- **Comprehensive Report**: Ranked performance table with trades, winrate, profit factor, PnL %, and Buy&Hold differences
- **Best/Worst Analysis**: Highlights top performers and statistical summaries
- **Configurable**: Uses `BACKTEST_CANDLE_COUNT` env var (default: 100 candles)
- **Buy&Hold Comparison**: Shows which strategies outperform passive holding

**Usage Examples:**
```bash
# Compare all strategies on BTC/USDT 1d with default settings
npm run backtest:compare

# Compare on different symbol/timeframe
npm run backtest:compare ETH/USDT 4h

# With verbose logging
npm run backtest:compare BTC/USDT 1d verbose
```

**Configuration:**
Set `BACKTEST_CANDLE_COUNT` in your `.env` to change the number of historical candles used for backtesting (default: 100).

### Live Historical Replay

The **Replay** feature simulates paper trading over a historical period using the **exact same engine logic as production**. Results are stored in the main database alongside live trades for analysis in your dashboard.

**Key Benefits:**
- **True Simulation**: Uses the same BotEngine, VaultManager, CommissionManager, and PortfolioManager as live trading
- **Time-Aware Vault**: Vault transactions are filtered by simulation time (deposits only count after their timestamp)
- **Commission Tracking**: Commission payments use trade timestamps
- **Seamless Continuation**: After replay completes, run `npm start` to continue trading into real-time from where replay left off

```bash
npm run replay
```

**Options:**
- `symbol`: Trading pair (default: from `.env`)
- `interval`: Timeframe (default: from `.env`)
- `days`: Number of days to replay (default: 120)

**Example:**
```bash
# Replay 30 days of 1h candles for ETH/USDT
npm run replay ETH/USDT 1h 30

# Replay 7 days of 15m candles
npm run replay BTC/USDT 15m 7
```

#### How It Works

The replay system advances simulation time through historical candles:

1. **Candle Fetching**: Downloads historical candles from Binance Public API
2. **Time Synchronization**: A shared `SimulationTimeProvider` coordinates all time-sensitive operations:
   - `VaultManager.getTotalDepositedBalance()` only includes transactions where `timestamp <= simulationTime`
   - `PortfolioManager` generates snapshots with simulation timestamps
   - `CommissionManager` uses trade timestamps for commission tracking
3. **Engine Tick Loop**: For each candle:
   - Sets simulation time to candle's end time
   - Updates market data buffer
   - Runs `engine.tick()` which processes signals, manages positions, and executes trades

#### Migrating Past Vault Transactions

When migrating historical vault transactions, insert them with their original timestamps:

```sql
INSERT INTO vault_transactions (email, amount, shares, type, timestamp)
VALUES 
  ('user@example.com', 10000, 10000, 'DEPOSIT', 1700000000000),
  ('user@example.com', 5000, 4852.46, 'DEPOSIT', 1702500000000);
```

During replay:
- Before `1700000000000`: Balance = 0
- Between `1700000000000` and `1702500000000`: Balance = 10,000
- After `1702500000000`: Balance = 14,852.46

#### After Replay: Continue to Real-Time

When replay completes:
1. The database contains all trades, vault transactions, and portfolio snapshots from the replay period
2. Simply run `npm start` to begin live trading
3. The bot will continue from real-time, seamlessly transitioning from where replay left off

**Important**: Replay and live trading share the same database. Trades and vault transactions from replay are preserved and visible in the dashboard alongside future live activity.

### Database Cleanup
**⚠️ DANGER: This will permanently delete ALL data from your database. Only use in development/testing environments.**

Clears all data from the database tables while preserving table structures. Useful for resetting your development environment.
```bash
npm run cleanup
```

### Strategy Configuration
Zillion Core supports runtime strategy configuration for both long-running and serverless deployments:

#### Long-Running Bots (`src/main.ts`)
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

## 📦 Zillions SDK

You can use Zillions Core as an SDK in your own projects by installing it directly from the GitHub repository.

### Installation
Install the SDK directly from GitHub in your project:
```bash
npm install https://github.com/zillionsapp/core.git
```

> [!TIP]
> This installs the built package directly from the repository, so you don't need to clone or build the project locally.

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

### 3. Custom Strategies

Zillion's strategy system is highly extensible. You can implement the `IStrategy` interface and inject your instance directly into `BotEngine`.

#### Simple Strategy (Signal-Based)
```typescript
import { IStrategy, Candle, Signal } from 'zillions';

class MyStrategy implements IStrategy {
    name = 'MY_STRATEGY';
    async update(candle: Candle): Promise<Signal | null> {
        if (candle.close > 100) {
            return { action: 'BUY', symbol: candle.symbol, stopLoss: 5, takeProfit: 10 };
        }
        return null;
    }
}

const bot = new BotEngine(new MyStrategy());
```

#### Advanced Strategy (Custom ST/TP Logic)

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

### 4. Runtime Usage
For long-running processes, use the `start()` method with your custom strategy:

```typescript
import { BotEngine, startApi } from 'zillions';

async function main() {
    // Optional: Start the dashboard on port 3000
    startApi(3000);

    // Use your custom strategy in a long-running bot
    const bot = new BotEngine(new AdvancedStrategy());
    await bot.start('BTC/USDT', '15m', {
        // Optional: Strategy-specific configuration
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30
    });
}

main().catch(console.error);
```

### 5. Serverless / Vercel Usage
For serverless environments, use the `tick()` method for stateless execution:

```typescript
import { BotEngine } from 'zillions';

export default async function handler(req, res) {
    const bot = new BotEngine(new MyCustomStrategy());
    await bot.tick('BTC/USDT', '1h');
    res.status(200).json({ status: 'ok' });
}
```

---
 
 ##  Available Strategies
 
 Zillion includes 24 professional-grade strategies from the `indicatorts` library, organized by category:
 
 | Category | Strategies |
 | :--- | :--- |
 | **Trend** | `MACD`, `APO`, `AROON`, `BOP`, `CFO`, `KDJ`, `PSAR`, `TYPPRICE`, `VWMA`, `VORTEX` |
 | **Momentum** | `AO`, `ICHIMOKU`, `RSI2`, `STOCH`, `WILLR` |
 | **Volatility** | `BB`, `AB`, `PO` |
 | **Volume** | `CMF`, `EMV`, `FI`, `MFI`, `NVI`, `VWAP` |
 
---

## 🛡 Risk Management

### RiskManager
The `RiskManager` module (`src/core/risk.manager.ts`) implements **professional risk management** following the "Golden Sequence":

1. **Risk Per Trade**: Fixed percentage of equity risked per trade (Default: 1%)
2. **Technical SL Levels**: Stop Loss based on percentages of entry price (chart-based levels)
3. **Position Sizing**: Calculated to match risk amount with technical SL distance

**Key Concepts:**
- **Risk Amount**: `Equity × RISK_PER_TRADE_PERCENT`
- **SL Distance**: `EntryPrice × STOP_LOSS_PERCENT`
- **Position Size**: `Risk Amount ÷ SL Distance`

**Practical Example:**
> "I want to risk max 1% of my $10,000 account on this trade."
- **Scenario A (Tight Stop)**: SL at 1%.
  - Risk: $100.
  - Position Size: $10,000. (If price drops 1%, you lose $100).
- **Scenario B (Wide Stop)**: SL at 5%.
  - Risk: $100.
  - Position Size: $2,000. (If price drops 5%, you lose $100).

**Key Features:**
- **Consistent Risk**: Every trade risks the same percentage of your account, regardless of volatility.
- **Daily Drawdown Protection**: Halts trading if equity drops by a specific percentage from the start-of-day balance. Resets daily at 00:00 UTC. (Default: 3%)
- **Max Open Trades**: Limits the total number of concurrent open positions to prevent over-exposure. (Default: 5)

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

#### Bulletproof Risk Management 🛡️
Zillion Core now includes a suite of "Bulletproof" features designed to eliminate risk early and adapt to market conditions automatically. These features are **enabled by default** to ensure maximum safety.

**1. Breakeven Trigger (The "Safety Net")**
- **Goal:** Eliminate risk as soon as the trade moves in your favor.
- **How it works:** When a position reaches a configurable profit percentage (Default: **1%**), the Stop Loss is automatically moved to your **Entry Price + Fees**.
- **Benefit:** If the market reverses after a small pop, you exit with $0 loss instead of a full Stop Loss hit. This dramatically improves your "non-losing" rate.

**2. ATR-Based Dynamic Stops (The "Smart Guard")**
- **Goal:** Adapt Stop Loss and Take Profit levels to current market volatility (Noise).
- **How it works:** Instead of arbitrary fixed percentages (e.g., 5%), the bot calculates the **Average True Range (ATR)** of the last 14 candles.
    - **Stop Loss:** `1.5 x ATR` (Tighter in quiet markets, wider in volatile ones).
    - **Take Profit:** `3.0 x ATR` (Ensures a consistent 1:2 Risk/Reward ratio).
- **Benefit:** Prevents being stopped out by normal market noise while ensuring targets are statistically reachable.

**3. Trailing Stop Loss (The "Profit Locker")**
- **Goal:** Let winners run while securing gains.
- **How it works:** Once a trade is profitable (Default: >2%), the Stop Loss trails the price distance (Default: 1%).
- **Benefit:** Captures the "fat tail" of big trends without manual intervention.

**Configuration (Hardened Defaults):**
```env
# Breakeven Trigger
BREAKEVEN_TRIGGER_PERCENT=1  # Move SL to Entry at 1% profit

# Dynamic ATR Stops
USE_ATR_BASED_STOPS=true     # Enable Volatility Sensing
ATR_PERIOD=14
ATR_MULTIPLIER_SL=1.5
ATR_MULTIPLIER_TP=3.0

# Trailing Stop
TRAILING_STOP_ENABLED=true   # Enable Profit Locking
```

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

## 🏦 Vault System

Zillion Core includes a professional **Vault System** designed for pooled funding and decentralized-style asset management. When enabled, the bot ignores the static `PAPER_INITIAL_BALANCE` and instead derives its trading capital dynamically from deposited funds.

### How it Works
The vault uses a **Share Price (NAV)** model similar to modern DeFi protocols or Traditional Finance funds:
1. **Initial State**: Vault starts at a Share Price of 1.00.
2. **Deposits**: Users receive shares based on the current Share Price (`Amount / SharePrice`).
3. **Performance**: As the bot generates profit/loss, the **Total Assets** (Equity) of the vault changes, causing the **Share Price** to move up or down (`TotalAssets / TotalShares`).
4. **Withdrawals**: Users burn shares to receive assets back at the current Share Price.

### Configuration
Enable the vault in your `.env`:
```env
VAULT_ENABLED=true
VAULT_SHARE_ASSET=ZILLION-SHARES  # The name of your LP token
```

### Integration
- **Internal Initialization**: The `VaultManager` is managed internally by the exchange driver.
- **Dynamic Balance**: The `PortfolioManager` automatically queries the vault for the total deposited balance to use as the starting capital.
- **Persistence**: Transactions (`DEPOSIT`, `WITHDRAW`) and state snapshots are persisted to Supabase for full auditing.

### Safety Measures
- **Equity-Linked Valuation**: Share price is always calculated against real-time portfolio equity, ensuring accurate entry/exit for all participants.
- **Withdrawal Verification**: (Planned) Verification of available cash vs. margin-locked funds before processing withdrawals.

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

## 🔮 Roadmap

- [ ] **Exchange Support**: Implement Drift.trade adapter.
- [ ] **Exchange Support**: Implement Hyperliquid adapter.
- [x] **Strategies**: Implement standard strategy library (RSI, MACD, etc.).
- [x] **Connectivity**: REST APIs for custom dashboards.
- [ ] **Connectivity**: WebSocket for custom dashboards.
- [x] **UI**: Build a simple in-built dashboard.
- [ ] **Intelligence**: AI/ML implementation for signal optimization.

## 🚀 REST API

Zillion Core includes a built-in REST API to expose portfolio data, trade history, market prices, and backtest functionality. The API is available in two deployment modes:

- **Server Mode** (`/src/api/`): Full Express.js server for local development and VPS deployments
- **Serverless Mode** (`/api/`): Vercel-compatible serverless functions for production deployments

Both modes expose identical endpoints with the same request/response formats.

### Running the API & Dashboard

#### Local Development (Server Mode)
The API and Dashboard start automatically when you run the main bot:
```bash
npm run dev  # or npm start
```
Access the dashboard at [http://localhost:3000](http://localhost:3000)

To run **only** the API server:
```bash
npm run api
```

#### Serverless Deployment (Vercel)
Deploy to Vercel and access endpoints at:
```
https://your-project.vercel.app/api/*
```

---

### API Endpoints

#### 1. Health Check
**Endpoint:** `GET /health`  
**Description:** System health check to verify the API is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1704384000000
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

---

#### 2. Portfolio Snapshot
**Endpoint:** `GET /api/portfolio`  
**Description:** Retrieves the most recent portfolio snapshot including balance, equity, PnL, and performance metrics.

**Response:**
```json
{
  "id": "uuid",
  "timestamp": 1704384000000,
  "currentBalance": 10500.50,
  "currentEquity": 10750.25,
  "totalPnL": 750.25,
  "totalPnLPercent": 7.50,
  "winRate": 65.5,
  "profitFactor": 2.1,
  "totalTrades": 42,
  "openPositions": 2,
  "closedPositions": 40
}
```

**Error Responses:**
- `404`: No portfolio snapshots found
- `500`: Internal server error

**Example:**
```bash
curl http://localhost:3000/api/portfolio
```

---

#### 3. Portfolio History (Chart Data)
**Endpoint:** `GET /api/portfolio-history`  
**Description:** Retrieves historical portfolio snapshots for charting. Data is cached and optimized for performance.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `all` | Time period filter: `1d`, `1w`, `1m`, `1y`, `all` |

**Response:**
```json
[
  {
    "timestamp": 1704384000000,
    "currentEquity": 10750.25,
    "currentBalance": 10500.50,
    "totalPnL": 750.25
  },
  {
    "timestamp": 1704297600000,
    "currentEquity": 10600.00,
    "currentBalance": 10400.00,
    "totalPnL": 600.00
  }
]
```

**Example:**
```bash
# Get all historical data
curl http://localhost:3000/api/portfolio-history

# Get last 7 days
curl http://localhost:3000/api/portfolio-history?period=1w

# Get last 30 days
curl http://localhost:3000/api/portfolio-history?period=1m
```

---

#### 4. Trade History
**Endpoint:** `GET /api/trades`  
**Description:** Retrieves trade execution history including both open and closed positions with pagination support.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `symbol` | string | - | Filter trades by symbol (e.g., `BTC/USDT`) |
| `limit` | number | `50` | Maximum number of trades to return |
| `offset` | number | `0` | Number of trades to skip (for pagination) |

**Response:**
```json
{
  "trades": [
    {
      "id": "uuid",
      "symbol": "BTC/USDT",
      "side": "BUY",
      "price": 45000.00,
      "quantity": 0.1,
      "timestamp": 1704384000000,
      "status": "OPEN",
      "stopLossPrice": 43000.00,
      "takeProfitPrice": 48000.00,
      "leverage": 5,
      "strategy": "MACD",
      "entryTime": 1704384000000,
      "duration": null,
      "exitPrice": null,
      "pnl": null,
      "pnlPercent": null
    },
    {
      "id": "uuid",
      "symbol": "ETH/USDT",
      "side": "SELL",
      "price": 2500.00,
      "quantity": 2.0,
      "timestamp": 1704297600000,
      "status": "CLOSED",
      "stopLossPrice": 2600.00,
      "takeProfitPrice": 2300.00,
      "leverage": 1,
      "strategy": "RSI",
      "entryTime": 1704297600000,
      "duration": "2h 15m",
      "exitPrice": 2350.00,
      "exitReason": "TAKE_PROFIT",
      "pnl": 300.00,
      "pnlPercent": 6.0
    }
  ],
  "total": 42
}
```

**Example:**
```bash
# Get all trades (first 50)
curl http://localhost:3000/api/trades

# Filter by symbol
curl http://localhost:3000/api/trades?symbol=BTC/USDT

# Pagination (get next 50 trades)
curl http://localhost:3000/api/trades?limit=50&offset=50

# Custom limit
curl http://localhost:3000/api/trades?limit=10
```

---

#### 5. Current Market Prices
**Endpoint:** `GET /api/prices`  
**Description:** Fetches current market prices for specified symbols from Binance.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbols` | string | Yes | Comma-separated list of symbols (e.g., `BTC/USDT,ETH/USDT`) |

**Response:**
```json
{
  "BTC/USDT": 45123.50,
  "ETH/USDT": 2456.75,
  "SOL/USDT": 98.32
}
```

**Error Handling:**
- If a symbol fails to fetch, it returns `0` as fallback
- Individual symbol errors are logged but don't fail the entire request

**Example:**
```bash
# Single symbol
curl "http://localhost:3000/api/prices?symbols=BTC/USDT"

# Multiple symbols
curl "http://localhost:3000/api/prices?symbols=BTC/USDT,ETH/USDT,SOL/USDT"
```

---

#### 6. Backtest Results
**Endpoint:** `GET /api/backtests`  
**Description:** Retrieves historical backtest results.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | `10` | Maximum number of results to return |

**Response:**
```json
[
  {
    "id": "uuid",
    "strategyName": "MACD",
    "symbol": "BTC/USDT",
    "interval": "1h",
    "timestamp": 1704384000000,
    "totalTrades": 150,
    "winRate": 58.5,
    "profitFactor": 1.85,
    "totalPnL": 1250.50,
    "maxDrawdown": -8.5
  }
]
```

**Example:**
```bash
# Get last 10 backtest results
curl http://localhost:3000/api/backtests

# Get last 5 results
curl http://localhost:3000/api/backtests?limit=5
```

---

#### 7. Run Backtest
**Endpoint:** `POST /api/backtest/run`  
**Description:** Triggers a new backtest execution for a specified strategy, symbol, and timeframe.

**Request Body:**
```json
{
  "strategyName": "MACD",
  "symbol": "BTC/USDT",
  "interval": "1h"
}
```

**Required Fields:**
- `strategyName`: Strategy to test (e.g., `MACD`, `RSI`, `BB`)
- `symbol`: Trading pair (e.g., `BTC/USDT`, `ETH/USDT`)
- `interval`: Timeframe (e.g., `1m`, `5m`, `15m`, `1h`, `4h`, `1d`)

**Response:**
```json
{
  "message": "Backtest completed successfully",
  "result": {
    "strategyName": "MACD",
    "symbol": "BTC/USDT",
    "interval": "1h",
    "totalTrades": 150,
    "winRate": 58.5,
    "profitFactor": 1.85,
    "totalPnL": 1250.50,
    "maxDrawdown": -8.5,
    "sharpeRatio": 1.42
  }
}
```

**Error Responses:**
- `400`: Missing required parameters
- `500`: Backtest execution failed

**Example:**
```bash
curl -X POST http://localhost:3000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "MACD",
    "symbol": "BTC/USDT",
    "interval": "1h"
  }'
```

---

#### 8. Cron Trigger (Serverless Only)
**Endpoint:** `POST /api/cron`  
**Description:** Serverless cron endpoint for scheduled bot execution. This endpoint is automatically called by Vercel Cron or external cron services.

**Authentication:**
Requires `Authorization` header with Bearer token in production:
```
Authorization: Bearer YOUR_CRON_SECRET
```

**Configuration:**
Set `CRON_SECRET` environment variable in your Vercel project settings.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1704384000000
}
```

**Error Responses:**
- `401`: Unauthorized (invalid or missing CRON_SECRET)
- `500`: Internal error during bot execution

**Example (with authentication):**
```bash
curl -X POST https://your-project.vercel.app/api/cron \
  -H "Authorization: Bearer your_cron_secret_here"
```

**External Cron Setup (Vercel Hobby Plan):**
Use [Cron-job.org](https://cron-job.org/) or similar service:
- **URL:** `https://your-project.vercel.app/api/cron`
- **Schedule:** Every 1 minute
- **Method:** POST
- **Headers:** `Authorization: Bearer your_cron_secret_here`

---

### API Usage Notes

#### CORS
The server mode API includes CORS support, allowing cross-origin requests from web applications.

#### Caching
- Portfolio and trade endpoints use `Cache-Control: no-cache, no-store, must-revalidate` headers to ensure fresh data
- Portfolio history endpoint uses cached data for performance optimization

#### Error Handling
All endpoints return consistent error responses:
```json
{
  "error": "Error message description"
}
```

#### Rate Limiting
No rate limiting is currently implemented. Consider adding rate limiting for production deployments.

#### Authentication
Currently, only the `/api/cron` endpoint requires authentication (in production). Other endpoints are publicly accessible. Consider implementing authentication for production use.

---

### Integration Examples

#### JavaScript/TypeScript
```typescript
// Fetch portfolio data
const portfolio = await fetch('http://localhost:3000/api/portfolio')
  .then(res => res.json());

// Fetch trades with pagination
const trades = await fetch('http://localhost:3000/api/trades?limit=20&offset=0')
  .then(res => res.json());

// Get current prices
const prices = await fetch('http://localhost:3000/api/prices?symbols=BTC/USDT,ETH/USDT')
  .then(res => res.json());

// Run backtest
const backtest = await fetch('http://localhost:3000/api/backtest/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    strategyName: 'MACD',
    symbol: 'BTC/USDT',
    interval: '1h'
  })
}).then(res => res.json());
```

#### Python
```python
import requests

# Fetch portfolio data
portfolio = requests.get('http://localhost:3000/api/portfolio').json()

# Fetch trades
trades = requests.get('http://localhost:3000/api/trades', params={
    'symbol': 'BTC/USDT',
    'limit': 50
}).json()

# Run backtest
backtest = requests.post('http://localhost:3000/api/backtest/run', json={
    'strategyName': 'MACD',
    'symbol': 'BTC/USDT',
    'interval': '1h'
}).json()
```

---


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
