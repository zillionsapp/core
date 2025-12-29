import { BotEngine } from './core/engine';
import { config } from './config/env';

async function main() {
    console.log('--- Zillion Trading Bot ---');
    console.log('Mode:', config.NODE_ENV);
    console.log('Exchange:', config.EXCHANGE_DRIVER);

    // Hardcoded for demo, normally read from config
    const SYMBOL = 'BTC/USDT';
    const INTERVAL = '1m';
    const STRATEGY = 'SMA_CROSSOVER';

    const bot = new BotEngine(STRATEGY);

    process.on('SIGINT', async () => {
        await bot.stop();
        process.exit(0);
    });

    await bot.start(SYMBOL, INTERVAL);
}

main().catch(err => console.error(err));
