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
            quantity: 0.1
        };

        const result = await riskManager.validateOrder(order);
        expect(result).toBe(true);
    });

    it('should reject order if Daily Drawdown exceeded', async () => {
        // ... (existing test code)
        jest.spyOn(exchange, 'getBalance').mockResolvedValue(9000);

        const order: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.01
        };

        const result = await riskManager.validateOrder(order);
        expect(result).toBe(false);
    });

    describe('calculateQuantity', () => {
        it('should calculate quantity based on balance and config percentage', async () => {
            // Balance 10000, 10% = 1000 USDT. Price 1000 => Quantity 1.
            const quantity = await riskManager.calculateQuantity('BTC/USDT', 1000);
            expect(quantity).toBe(1);
        });

        it('should respect custom POSITION_SIZE_PERCENT', async () => {
            // Change config (we can override it directly for the test)
            const { config } = require('../../src/config/env');
            const originalValue = config.POSITION_SIZE_PERCENT;
            config.POSITION_SIZE_PERCENT = 5; // 5%

            // Balance 10000, 5% = 500 USDT. Price 1000 => Quantity 0.5.
            const quantity = await riskManager.calculateQuantity('BTC/USDT', 1000);
            expect(quantity).toBe(0.5);

            config.POSITION_SIZE_PERCENT = originalValue; // Restore
        });
    });
});
