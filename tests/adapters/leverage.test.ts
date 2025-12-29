import { PaperExchange } from '../../src/adapters/exchange/paper';
import { IMarketDataProvider } from '../../src/interfaces/market_data.interface';
import { config } from '../../src/config/env';

describe('PaperExchange Leverage', () => {
    let exchange: PaperExchange;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;

    beforeEach(() => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn().mockResolvedValue({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() }),
            start: jest.fn(),
        } as any;

        // Reset balance
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        exchange = new PaperExchange(mockDataProvider);
    });

    it('should allow buying more with leverage', async () => {
        // Mock leverage to 10x
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 10;

        // Balance is 10,000. With 10x leverage, buying power is 100,000.
        // Try to buy 1.5 BTC at 50,000 each = 75,000 cost.
        // Margin required = 7,500.

        await exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 1.5
        });

        const remainingBalance = await exchange.getBalance('USDT');
        expect(remainingBalance).toBe(10000 - 7500);
    });

    it('should fail if margin exceeds balance', async () => {
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 10;

        // Cost: 3 BTC * 50,000 = 150,000. Required Margin: 15,000. Balance: 10,000.
        await expect(exchange.placeOrder({
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 3
        })).rejects.toThrow(/Insufficient funds \(Margin\)/);
    });
});
