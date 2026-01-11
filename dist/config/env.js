"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    // Exchange Configuration
    EXCHANGE_DRIVER: zod_1.z.enum(['PAPER', 'BINANCE', 'HYPERLIQUID', 'DRIFT', 'CCXT', 'OKX']).default('PAPER'),
    EXCHANGE_API_KEY: zod_1.z.string().optional(),
    EXCHANGE_API_SECRET: zod_1.z.string().optional(),
    // Paper Trading Defaults
    PAPER_INITIAL_BALANCE: zod_1.z.coerce.number().default(0),
    PAPER_BALANCE_ASSET: zod_1.z.string().default('USDT'),
    // Vault Configuration
    VAULT_ENABLED: zod_1.z.string().default('false').transform(v => v === 'true'),
    VAULT_SHARE_ASSET: zod_1.z.string().default('ZILLION-SHARES'),
    // Database
    SUPABASE_URL: zod_1.z.string().optional(),
    SUPABASE_KEY: zod_1.z.string().optional(),
    // Risk Management
    MAX_DAILY_DRAWDOWN_PERCENT: zod_1.z.coerce.number().default(5), // 5%
    MAX_TOTAL_RISK_PERCENT: zod_1.z.coerce.number().default(10), // 10% max total risk across all positions
    MAX_POSITION_SIZE_PERCENT: zod_1.z.coerce.number().default(10), // 10% max position size as % of available balance
    DEFAULT_STOP_LOSS_PERCENT: zod_1.z.coerce.number().default(5), // 5% of entry price (technical SL)
    DEFAULT_TAKE_PROFIT_PERCENT: zod_1.z.coerce.number().default(10), // 10% of entry price (technical TP)
    RISK_PER_TRADE_PERCENT: zod_1.z.coerce.number().default(1), // 1% of equity per trade (professional risk)
    // Trailing Stop Loss
    TRAILING_STOP_ENABLED: zod_1.z.string().default('false').transform(v => v === 'true'),
    TRAILING_STOP_ACTIVATION_PERCENT: zod_1.z.coerce.number().default(2), // 2% profit to activate trailing
    TRAILING_STOP_TRAIL_PERCENT: zod_1.z.coerce.number().default(1), // 1% trail distance
    // Position Management
    ALLOW_MULTIPLE_POSITIONS: zod_1.z.string().default('false').transform(v => v === 'true'), // Allow hedging/multiple positions
    CLOSE_ON_OPPOSITE_SIGNAL: zod_1.z.string().default('false').transform(v => v === 'true'), // Close existing position on opposite signal
    // Strategy Configuration
    STRATEGY_NAME: zod_1.z.string().default('MACD'),
    STRATEGY_SYMBOL: zod_1.z.string().default('BTC/USDT'),
    STRATEGY_INTERVAL: zod_1.z.string().default('1m'),
    // Real-time Monitoring
    TICK_INTERVAL_SECONDS: zod_1.z.coerce.number().default(30), // How often to check for signals and manage positions (seconds)
    // Backtest Configuration
    BACKTEST_CANDLE_COUNT: zod_1.z.coerce.number().default(100),
    // Leverage Configuration
    LEVERAGE_ENABLED: zod_1.z.string().transform(v => v === 'true').default(false),
    LEVERAGE_VALUE: zod_1.z.coerce.number().default(1),
    MAX_LEVERAGE_UTILIZATION: zod_1.z.coerce.number().default(50), // Max position value as % of (balance × leverage) - full number like other percentages
    MAX_OPEN_TRADES: zod_1.z.coerce.number().default(10), // Maximum number of concurrent open positions
});
exports.config = envSchema.parse(process.env);
