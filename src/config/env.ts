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

    // Database
    SUPABASE_URL: z.string().optional(),
    SUPABASE_KEY: z.string().optional(),
});

export const config = envSchema.parse(process.env);
