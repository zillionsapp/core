# Zillions Core - Scalable Node.js Trading Bot

**Zillions Core** is a professional-grade, scalable, and modular trading bot engine built with Node.js, TypeScript, and a Hexagonal Architecture. It is designed to be exchange-agnostic, strategy-pluggable, and production-ready with built-in risk management and structured logging.

---

## 🚀 Key Features

*   **Hexagonal Architecture**: Core logic is isolated from external adapters (Exchanges, Database), allowing easy swapping of components.
*   **Multi-Exchange Support**:
    *   **Real Market Data**: Decoupled data provider supporting `Binance Public API` (Free, no-auth) for Paper Trading and Backtesting.
    *   **Paper Trading**: Simulated matching engine using real-world price data for realistic testing.
    *   **Prepared for**: Binance, Hyperliquid, Drift, CCXT, OKX (Stubs ready).
*   **Robust Risk Management**:
    *   **Automated Protection**: Stop Loss and Take Profit execution engine.
    *   **Middleware Checks**: Max Order Size and Daily Drawdown limits.
*   **Backtesting Engine**: Dedicated runner to validate strategies against historical market data (no random walks).
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
    STRATEGY_NAME=SMA_CROSSOVER
    STRATEGY_SYMBOL=BTC/USDT
    STRATEGY_INTERVAL=1m
    LEVERAGE_ENABLED=false
    LEVERAGE_VALUE=10
    ```

4.  **Database Setup (Supabase)**:
    Run the SQL methods found in `supabase_schema.sql` in your Supabase SQL Editor to create the necessary tables (`trades`, `portfolio_snapshots`, `backtest_results`).

---

## 🏃‍♂️ Usage

### Development Mode
Runs the bot with hot-reloading.
```bash
npm run start:dev
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

### Testing
Runs the Jest test suite (Unit & Integration).
```bash
npm test
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

## 🏛 Architecture

```
src/
├── core/               # Domain Logic (Engine, Risk Manager, Logger)
├── interfaces/         # Port Definitions (IExchange, IStrategy, IDataStore)
├── adapters/
│   ├── exchange/       # Adapters (Paper, Binance, Hyperliquid...)
│   └── database/       # Adapters (Supabase)
├── strategies/         # Trading Strategies
├── backtest/           # Backtesting module
└── config/             # Zod-typed Env validation
```

---

## 🧩 Adding Strategies

Zillion's strategy system is pluggable. To add your own logic:

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
            // Logic here...
            if (candle.close > 100) {
                return { action: 'BUY', symbol: candle.symbol, stopLoss: 95, takeProfit: 110 };
            }
            return null;
        }
    }
    ```
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

The `RiskManager` module (`src/core/risk.manager.ts`) intercepts every order before execution.
- **Max Order Value**: Prevents fat-finger errors (Default: 10,000 USDT).
- **Daily Drawdown**: Halts trading if equity drops by 5% in a single day.
- **Stop Loss / Take Profit**: Automatically tracks positions and triggers exit orders if price limits are crossed (Default: 5% SL / 10% TP).

---

## 🔮 Roadmap

- [ ] **Exchange Support**: Implement Drift.trade adapter.
- [ ] **Exchange Support**: Implement Hyperliquid adapter.
- [ ] **Strategies**: Implement standard strategy library (RSI, MACD, etc.).
- [x] **Connectivity**: REST APIs for custom dashboards.
- [ ] **Connectivity**: WebSocket for custom dashboards.
- [ ] **UI**: Build a simple in-built dashboard.
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
  "strategyName": "SMA_CROSSOVER",
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
