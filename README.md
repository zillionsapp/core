# Zillions Core - Scalable Node.js Trading Bot

**Zillions Core** is a professional-grade, scalable, and modular trading bot engine built with Node.js, TypeScript, and a Hexagonal Architecture. It is designed to be exchange-agnostic, strategy-pluggable, and production-ready with built-in risk management and structured logging.

---

## 🚀 Key Features

*   **Hexagonal Architecture**: Core logic is isolated from external adapters (Exchanges, Database), allowing easy swapping of components.
*   **Multi-Exchange Support**:
    *   **Paper Trading**: Simulated matching engine for safe testing.
    *   **Prepared for**: Binance, Hyperliquid, Drift, CCXT, OKX (Stubs ready).
*   **Robust Risk Management**: Middleware layer preventing catastrophic losses (Max Order Size, Daily Drawdown limits).
*   **Backtesting Engine**: Dedicated runner to validate strategies against historical data.
*   **Strategy System**: Pluggable strategy interface. Simply add a new class to `src/strategies`.
*   **Persistence**: Integration with **Supabase** (PostgreSQL) for trade history and portfolio snapshots.
*   **Production Ready**:
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
Runs the simulation runner against the active strategy.
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

### Vercel (Serverless)
Zillion is configured for Vercel Cron deployment.
1.  **Push** your code to GitHub.
2.  **Import** the project into Vercel.
3.  **Deploy**. Vercel will automatically detect `vercel.json` and trigger `api/cron.ts` every minute.

*Note: Paper Trading on serverless will reset state every minute unless you connect a database.*

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

## 🛡 Risk Management

The `RiskManager` module (`src/core/risk.manager.ts`) intercepts every order before execution.
- **Max Order Value**: Prevents fat-finger errors (Default: 10,000 USDT).
- **Daily Drawdown**: Halts trading if equity drops by 5% in a single day.

---

## 🔮 Roadmap

- [ ] **Exchange Support**: Implement Drift.trade adapter.
- [ ] **Exchange Support**: Implement Hyperliquid adapter.
- [ ] **Strategies**: Implement standard strategy library (RSI, MACD, etc.).
- [ ] **Connectivity**: WebSocket and REST APIs for custom dashboards.
- [ ] **UI**: Build a simple in-built dashboard.
- [ ] **Intelligence**: AI/ML implementation for signal optimization.

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
