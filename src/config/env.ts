import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Exchange Configuration
    EXCHANGE_DRIVER: z.enum(['PAPER', 'BINANCE', 'HYPERLIQUID', 'DRIFT', 'CCXT', 'OKX']).default('PAPER'),
    EXCHANGE_API_KEY: z.string().optional(),
    EXCHANGE_API_SECRET: z.string().optional(),

    // Paper Trading Defaults
    PAPER_INITIAL_BALANCE: z.coerce.number().default(10000),
    PAPER_BALANCE_ASSET: z.string().default('USDT'),

    // Vault Configuration
    VAULT_ENABLED: z.string().default('false').transform(v => v === 'true'),
    VAULT_SHARE_ASSET: z.string().default('ZILLION-SHARES'),

    // Database
    SUPABASE_URL: z.string().optional(),
    SUPABASE_KEY: z.string().optional(),

    // Risk Management
    MAX_DAILY_DRAWDOWN_PERCENT: z.coerce.number().default(5), // 5%
    DEFAULT_STOP_LOSS_PERCENT: z.coerce.number().default(5), // 5% of entry price (technical SL)
    DEFAULT_TAKE_PROFIT_PERCENT: z.coerce.number().default(10), // 10% of entry price (technical TP)
    POSITION_SIZE_PERCENT: z.coerce.number().default(10), // 10% of balance (position size)
    RISK_PER_TRADE_PERCENT: z.coerce.number().default(1), // 1% of equity per trade (professional risk)

    // Trailing Stop Loss
    TRAILING_STOP_ENABLED: z.string().default('false').transform(v => v === 'true'),
    TRAILING_STOP_ACTIVATION_PERCENT: z.coerce.number().default(2), // 2% profit to activate trailing
    TRAILING_STOP_TRAIL_PERCENT: z.coerce.number().default(1), // 1% trail distance

    // Position Management
    ALLOW_MULTIPLE_POSITIONS: z.string().default('false').transform(v => v === 'true'), // Allow hedging/multiple positions
    CLOSE_ON_OPPOSITE_SIGNAL: z.string().default('false').transform(v => v === 'true'), // Close existing position on opposite signal

    // Strategy Configuration
    STRATEGY_NAME: z.string().default('MACD'),
    STRATEGY_SYMBOL: z.string().default('BTC/USDT'),
    STRATEGY_INTERVAL: z.string().default('1m'),

    // Leverage Configuration
    LEVERAGE_ENABLED: z.string().transform(v => v === 'true').default(false as any),
    LEVERAGE_VALUE: z.coerce.number().default(1),
    MAX_LEVERAGE_UTILIZATION: z.coerce.number().default(50), // Max position value as % of (balance × leverage) - full number like other percentages
    MAX_OPEN_TRADES: z.coerce.number().default(10), // Maximum number of concurrent open positions
});

export const config = envSchema.parse(process.env);
