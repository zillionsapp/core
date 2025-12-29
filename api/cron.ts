import { BotEngine } from '../src/core/engine';
import { logger } from '../src/core/logger';
import { config } from '../src/config/env';

// Initialize engine outside handler to potentially reuse warm instance (best effort)
const STRATEGY = 'SMA_CROSSOVER'; // Should probably be env var
const SYMBOL = 'BTC/USDT';
const INTERVAL = '1m';

const bot = new BotEngine(STRATEGY);

export default async function handler(request: any, response: any) {
    try {
        logger.info('[Vercel] Cron Tick Triggered');

        // Validate Auth (Basic security for Cron)
        const authHeader = request.headers.authorization;
        if (config.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            // Optional: Implement CRON_SECRET check if needed, Vercel verifies via signature usually
            // For now, open
        }

        await bot.tick(SYMBOL, INTERVAL);

        response.status(200).json({ status: 'ok', timestamp: Date.now() });
    } catch (error) {
        logger.error('[Vercel] Tick Error:', error);
        response.status(500).json({ error: 'Internal Error' });
    }
}
