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

    describe('calculateExitPrices', () => {
        it('should calculate SL/TP as percentages for BUY position with defaults', () => {
            const entryPrice = 50000;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, 'BUY');

            // Default SL = 5%, TP = 10%
            expect(stopLoss).toBe(47500); // 50000 * (1 - 0.05)
            expect(takeProfit).toBeCloseTo(55000, 2); // 50000 * (1 + 0.10)
        });

        it('should calculate SL/TP as percentages for BUY position with custom percentages', () => {
            const entryPrice = 50000;
            const customSL = 3; // 3%
            const customTP = 8; // 8%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, 'BUY', customSL, customTP);

            expect(stopLoss).toBe(48500); // 50000 * (1 - 0.03)
            expect(takeProfit).toBe(54000); // 50000 * (1 + 0.08)
        });

        it('should calculate SL/TP as percentages for SELL position with defaults', () => {
            const entryPrice = 50000;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, 'SELL');

            // Default SL = 5%, TP = 10%
            // For SHORT: SL is above entry, TP is below entry
            expect(stopLoss).toBe(52500); // 50000 * (1 + 0.05)
            expect(takeProfit).toBe(45000); // 50000 * (1 - 0.10)
        });

        it('should calculate SL/TP as percentages for SELL position with custom percentages', () => {
            const entryPrice = 50000;
            const customSL = 2; // 2%
            const customTP = 6; // 6%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, 'SELL', customSL, customTP);

            expect(stopLoss).toBe(51000); // 50000 * (1 + 0.02)
            expect(takeProfit).toBe(47000); // 50000 * (1 - 0.06)
        });

        it('should always use percentage-based calculation even when signal values provided', () => {
            const entryPrice = 100000;
            const signalSL = 10; // This should be treated as 10%, not an absolute price
            const signalTP = 15; // This should be treated as 15%, not an absolute price
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, 'BUY', signalSL, signalTP);

            expect(stopLoss).toBe(90000); // 100000 * (1 - 0.10)
            expect(takeProfit).toBeCloseTo(115000, 2); // 100000 * (1 + 0.15)
        });
    });
});

