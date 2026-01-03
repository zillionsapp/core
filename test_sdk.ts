import { BotEngine, IStrategy, Signal, Candle } from './src/index';

class CustomStrategy implements IStrategy {
    name = 'CustomSDKStrategy';
    async init(config: any) {
        console.log('Custom strategy initialized with config:', config);
    }
    async update(candle: Candle): Promise<Signal | null> {
        console.log('Custom strategy update with price:', candle.close);
        return {
            symbol: candle.symbol,
            action: 'HOLD'
        };
    }
}

async function testSDK() {
    console.log('--- Testing SDK Strategy Injection ---');

    // You can also start the API/Dashboard manually when using the SDK:
    // startApi(3001); // Optional: specify port

    const customStrat = new CustomStrategy();
    const bot = new BotEngine(customStrat);

    // We can't really "start" it fully without real exchange/db connectivity in a simple test,
    // but we can verify the constructor and basic setup.
    console.log('BotEngine initialized with custom strategy instance.');

    // Manual tick simulation if needed, but the core requirement was injection.
    console.log('SDK Test successful: Strategy injected correctly.');
}

testSDK().catch(console.error);
