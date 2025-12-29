import { PaperExchange } from '../../src/adapters/exchange/paper';
import { IMarketDataProvider } from '../../src/interfaces/market_data.interface';
import { config } from '../../src/config/env';

describe('PaperExchange Leverage Math Validation', () => {
    let exchange: PaperExchange;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;

    beforeEach(() => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn(),
            start: jest.fn(),
        } as any;

        // Reset balance
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        exchange = new PaperExchange(mockDataProvider);
    });

    it('should settle PROFIT correctly with leverage', async () => {
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 10;

        // 1. Entry at 50,000
        mockDataProvider.getTicker.mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });
        await exchange.placeOrder({ symbol: 'BTC/USDT', side: 'BUY', type: 'MARKET', quantity: 1 });

        // Margin: 1 * 50,000 / 10 = 5,000. 
        // Balance: 10,000 - 5,000 = 5,000.
        expect(await exchange.getBalance('USDT')).toBe(5000);

        // 2. Exit at 55,000 (10% price move, 100% ROI on margin)
        mockDataProvider.getTicker.mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 55000, timestamp: Date.now() });
        await exchange.placeOrder({ symbol: 'BTC/USDT', side: 'SELL', type: 'MARKET', quantity: 1 });

        // Expected PnL: (55,000 - 50,000) * 1 = +5,000.
        // Return: Margin (5,000) + PnL (5,000) = 10,000.
        // Final Balance: 5,000 (current) + 10,000 = 15,000.
        expect(await exchange.getBalance('USDT')).toBe(15000);
    });

    it('should settle LOSS correctly with leverage', async () => {
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 10;

        // 1. Entry at 50,000
        mockDataProvider.getTicker.mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });
        await exchange.placeOrder({ symbol: 'BTC/USDT', side: 'BUY', type: 'MARKET', quantity: 1 });

        // Balance: 5,000
        expect(await exchange.getBalance('USDT')).toBe(5000);

        // 2. Exit at 45,000 (10% price move down, -100% ROI on margin)
        mockDataProvider.getTicker.mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 45000, timestamp: Date.now() });
        await exchange.placeOrder({ symbol: 'BTC/USDT', side: 'SELL', type: 'MARKET', quantity: 1 });

        // Expected PnL: (45,000 - 50,000) * 1 = -5,000.
        // Return: Margin (5,000) + PnL (-5,000) = 0.
        // Final Balance: 5,000 (current) + 0 = 5,000.
        expect(await exchange.getBalance('USDT')).toBe(5000);
    });
});
