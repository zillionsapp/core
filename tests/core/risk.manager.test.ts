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
        it('should calculate SL/TP based on position value for BUY position with defaults', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY');

            // Position value = 50000 * 1 = 50000
            // Risk amount = 50000 * 0.05 = 2500
            // Reward amount = 50000 * 0.10 = 5000
            // SL = 50000 - (2500 / 1) = 47500
            // TP = 50000 + (5000 / 1) = 55000
            expect(stopLoss).toBe(47500);
            expect(takeProfit).toBe(55000);
        });

        it('should calculate SL/TP based on position value for BUY position with custom percentages', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const customSL = 3; // 3%
            const customTP = 8; // 8%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY', customSL, customTP);

            // Position value = 50000 * 1 = 50000
            // Risk amount = 50000 * 0.03 = 1500
            // Reward amount = 50000 * 0.08 = 4000
            // SL = 50000 - (1500 / 1) = 48500
            // TP = 50000 + (4000 / 1) = 54000
            expect(stopLoss).toBe(48500);
            expect(takeProfit).toBe(54000);
        });

        it('should calculate SL/TP based on position value for SELL position with defaults', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'SELL');

            // Position value = 50000 * 1 = 50000
            // Risk amount = 50000 * 0.05 = 2500
            // Reward amount = 50000 * 0.10 = 5000
            // SL = 50000 + (2500 / 1) = 52500 (above entry for shorts)
            // TP = 50000 - (5000 / 1) = 45000 (below entry for shorts)
            expect(stopLoss).toBe(52500);
            expect(takeProfit).toBe(45000);
        });

        it('should calculate SL/TP based on position value for SELL position with custom percentages', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const customSL = 2; // 2%
            const customTP = 6; // 6%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'SELL', customSL, customTP);

            // Position value = 50000 * 1 = 50000
            // Risk amount = 50000 * 0.02 = 1000
            // Reward amount = 50000 * 0.06 = 3000
            // SL = 50000 + (1000 / 1) = 51000
            // TP = 50000 - (3000 / 1) = 47000
            expect(stopLoss).toBe(51000);
            expect(takeProfit).toBe(47000);
        });

        it('should scale SL/TP correctly with quantity', () => {
            const entryPrice = 100000;
            const quantity = 0.1; // Smaller position
            const signalSL = 10; // 10%
            const signalTP = 15; // 15%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY', signalSL, signalTP);

            // Position value = 100000 * 0.1 = 10000
            // Risk amount = 10000 * 0.10 = 1000
            // Reward amount = 10000 * 0.15 = 1500
            // SL = 100000 - (1000 / 0.1) = 100000 - 10000 = 90000
            // TP = 100000 + (1500 / 0.1) = 100000 + 15000 = 115000
            expect(stopLoss).toBe(90000);
            expect(takeProfit).toBe(115000);
        });
    });
});
