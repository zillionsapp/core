import { PaperExchange } from '../src/adapters/exchange/paper';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { config } from '../src/config/env';

// Mock Data Provider
const mockDataProvider = {
    getCandles: jest.fn(),
    getTicker: jest.fn(),
    start: jest.fn(),
} as unknown as IMarketDataProvider;

describe('Audit Reproduction Tests', () => {
    let exchange: PaperExchange;

    beforeEach(() => {
        // Reset config
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 5;
        (config as any).PAPER_BALANCE_ASSET = 'USDT';

        exchange = new PaperExchange(mockDataProvider);
    });

    test('BUG: Infinite Money Glitch (Short Selling)', async () => {
        // 1. Setup
        const initialBalance = await exchange.getBalance('USDT');
        const price = 50000;
        const quantity = 0.1;

        (mockDataProvider.getTicker as jest.Mock).mockResolvedValue({
            symbol: 'BTC/USDT',
            price: price,
            timestamp: Date.now()
        });

        // 2. Open Short
        // Expected behavior: Balance decreases (margin locked)
        // Bug behavior: Balance INCREASES by full notional value - margin
        await exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'SELL',
            type: 'MARKET',
            quantity: quantity
        });

        const newBalance = await exchange.getBalance('USDT');

        console.log(`Initial Balance: ${initialBalance}`);
        console.log(`New Balance: ${newBalance}`);

        // The bug: newBalance > initialBalance
        // If fixed: newBalance < initialBalance (Margin deducted)
        expect(newBalance).toBeLessThan(initialBalance);
    });

    test('BUG: Instant Limit Order Fills', async () => {
        // 1. Setup
        const marketPrice = 50000;
        const limitPrice = 100; // Deep OTM Buy Limit

        (mockDataProvider.getTicker as jest.Mock).mockResolvedValue({
            symbol: 'BTC/USDT',
            price: marketPrice,
            timestamp: Date.now()
        });

        // 2. Place Limit Order
        // Expected: Error thrown (Pending Limit not supported)
        await expect(exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'LIMIT',
            price: limitPrice,
            quantity: 1.0
        })).rejects.toThrow('Pending Limit Orders not supported');
    });
});
