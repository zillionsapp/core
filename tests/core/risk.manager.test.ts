import { RiskManager } from '../../src/core/risk.manager';
import { PaperExchange } from '../../src/adapters/exchange/paper'; // Using concrete implementation as mock for simplicity
import { OrderRequest } from '../../src/core/types';

describe('RiskManager', () => {
    let riskManager: RiskManager;
    let exchange: PaperExchange;

    beforeEach(async () => {
        // Reset Env
        process.env.PAPER_INITIAL_BALANCE = '10000';

        // Mock Provider
        const mockProvider = {
            name: 'MOCK',
            getCandles: jest.fn().mockResolvedValue([]),
            getTicker: jest.fn().mockResolvedValue({ symbol: 'BTC/USDT', price: 1000, timestamp: Date.now() })
        };

        exchange = new PaperExchange(mockProvider);
        await exchange.start();
        riskManager = new RiskManager(exchange);
        await riskManager.init();
    });

    it('should accept a safe order', async () => {
        const order: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.1 // Value ~1000 USDT (< 10k Limit)
        };

        const result = await riskManager.validateOrder(order);
        expect(result).toBe(true);
    });

    it('should reject an order exceeding Max Value', async () => {
        // Mock price to be sure
        jest.spyOn(exchange, 'getTicker').mockResolvedValue({
            symbol: 'BTC/USDT',
            price: 50000,
            timestamp: Date.now()
        });

        const order: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 1 // Value 50,000 > 10,000 Limit
        };

        const result = await riskManager.validateOrder(order);
        expect(result).toBe(false);
    });

    it('should reject order if Daily Drawdown exceeded', async () => {
        // Simulate a massive loss by manually overriding balance in the "mock" exchange
        // PaperExchange uses a map we can't easily access publicly unless we cast to any or use a getter if available.
        // Or we just spy on getBalance.

        // Initial Balance is 10000. 5% loss is 500. Limit at 9500.
        // We simulate current balance is 9000 (10% loss).
        jest.spyOn(exchange, 'getBalance').mockResolvedValue(9000);

        const order: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'BUY', // Buys trigger the check
            type: 'MARKET',
            quantity: 0.01
        };

        const result = await riskManager.validateOrder(order);
        expect(result).toBe(false);
    });
});
