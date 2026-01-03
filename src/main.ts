import { BotEngine, config, startApi } from './index';

async function main() {
    console.log('--- Zillion Trading Bot ---');
    console.log('Mode:', config.NODE_ENV);
    console.log('Exchange:', config.EXCHANGE_DRIVER);

    // Start API & Dashboard
    startApi();

    const bot = new BotEngine(config.STRATEGY_NAME);

    process.on('SIGINT', async () => {
        await bot.stop();
        process.exit(0);
    });

    await bot.start(config.STRATEGY_SYMBOL, config.STRATEGY_INTERVAL, {/* Pass custom Strategy config here if needed */ });
}

main().catch(err => console.error(err));
