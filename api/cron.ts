import { BotEngine } from '../src/core/engine';
import { logger } from '../src/core/logger';
import { config } from '../src/config/env';

const bot = new BotEngine(config.STRATEGY_NAME);

export default async function handler(request: any, response: any) {
    try {
        logger.info('[Vercel] Cron Tick Triggered');

        // Validate Auth (Basic security for Cron)
        const authHeader = request.headers.authorization;
        if (config.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
                logger.warn('[Vercel] Unauthorized Cron Access Attempt');
                return response.status(401).json({ error: 'Unauthorized' });
            }
        }

        await bot.tick(config.STRATEGY_SYMBOL, config.STRATEGY_INTERVAL, {/* Pass custom Strategy config here if needed */});

        response.status(200).json({ status: 'ok', timestamp: Date.now() });
    } catch (error) {
        logger.error('[Vercel] Tick Error:', error);
        response.status(500).json({ error: 'Internal Error' });
    }
}
