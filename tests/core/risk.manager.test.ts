import { RiskManager } from '../../src/core/risk.manager';
import { PaperExchange } from '../../src/adapters/exchange/paper'; // Using concrete implementation as mock for simplicity
import { OrderRequest } from '../../src/core/types';
import { MockStore, MockTimeProvider } from '../test_mocks';

describe('RiskManager', () => {
    let riskManager: RiskManager;
    let exchange: PaperExchange;
    let mockStore: MockStore;
    let mockTimeProvider: MockTimeProvider;

    beforeEach(async () => {
        // Reset config directly
        const { config } = require('../../src/config/env');
        config.PAPER_INITIAL_BALANCE = 10000;
        config.LEVERAGE_ENABLED = false;
        config.LEVERAGE_VALUE = 1;
        config.RISK_PER_TRADE_PERCENT = 1;

        // Mock Provider
        const mockProvider = {
            name: 'MOCK',
            getCandles: jest.fn().mockResolvedValue([]),
            getTicker: jest.fn().mockResolvedValue({ symbol: 'BTC/USDT', price: 1000, timestamp: Date.now() })
        };

        mockStore = new MockStore();
        mockTimeProvider = new MockTimeProvider();

        exchange = new PaperExchange(mockProvider);
        await exchange.start();
        riskManager = new RiskManager(exchange, mockStore, mockTimeProvider);
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
        it('should calculate quantity based on balance and risk percentage, capped at POSITION_SIZE_PERCENT', async () => {
            // Balance 10000, RISK_PER_TRADE_PERCENT = 1% = 100 USDT risk
            // SL distance = 1000 * 5% = 50
            // Leverage = 1 (default), initial quantity = (100 * 1) / 50 = 2
            // Position value = 2 * 1000 = 2000 (20% of balance)
            // But POSITION_SIZE_PERCENT = 10%, max position value = 1000
            // So quantity capped to 1000 / 1000 = 1
            const quantity = await riskManager.calculateQuantity('BTC/USDT', 1000);
            expect(quantity).toBe(1);
        });

        it('should respect custom RISK_PER_TRADE_PERCENT', async () => {
            // Change config (we can override it directly for the test)
            const { config } = require('../../src/config/env');
            const originalValue = config.RISK_PER_TRADE_PERCENT;
            config.RISK_PER_TRADE_PERCENT = 0.5; // 0.5%

            // Balance 10000, 0.5% = 50 USDT risk
            // SL distance = 1000 * 5% = 50
            // Leverage = 1, quantity = (50 * 1) / 50 = 1
            const quantity = await riskManager.calculateQuantity('BTC/USDT', 1000);
            expect(quantity).toBe(1);

            config.RISK_PER_TRADE_PERCENT = originalValue; // Restore
        });
    });

    describe('calculateExitPrices', () => {
        it('should calculate SL/TP as percentages of entry price for BUY position with defaults', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY');

            // SL = entry * (1 - 0.05) = 50000 * 0.95 = 47500
            // TP = entry * (1 + 0.10) = 50000 * 1.10 = 55000
            expect(stopLoss).toBeCloseTo(47500, 2);
            expect(takeProfit).toBeCloseTo(55000, 2);
        });

        it('should calculate SL/TP as percentages of entry price for BUY position with custom percentages', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const customSL = 3; // 3%
            const customTP = 8; // 8%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY', customSL, customTP);

            // SL = entry * (1 - 0.03) = 50000 * 0.97 = 48500
            // TP = entry * (1 + 0.08) = 50000 * 1.08 = 54000
            expect(stopLoss).toBe(48500);
            expect(takeProfit).toBe(54000);
        });

        it('should calculate SL/TP as percentages of entry price for SELL position with defaults', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'SELL');

            // SL = entry * (1 + 0.05) = 50000 * 1.05 = 52500 (above entry for shorts)
            // TP = entry * (1 - 0.10) = 50000 * 0.90 = 45000 (below entry for shorts)
            expect(stopLoss).toBe(52500);
            expect(takeProfit).toBe(45000);
        });

        it('should calculate SL/TP as percentages of entry price for SELL position with custom percentages', () => {
            const entryPrice = 50000;
            const quantity = 1;
            const customSL = 2; // 2%
            const customTP = 6; // 6%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'SELL', customSL, customTP);

            // SL = entry * (1 + 0.02) = 50000 * 1.02 = 51000
            // TP = entry * (1 - 0.06) = 50000 * 0.94 = 47000
            expect(stopLoss).toBe(51000);
            expect(takeProfit).toBe(47000);
        });

        it('should calculate SL/TP as percentages regardless of quantity', () => {
            const entryPrice = 100000;
            const quantity = 0.1; // Smaller position - should not affect percentage calculation
            const signalSL = 10; // 10%
            const signalTP = 15; // 15%
            const { stopLoss, takeProfit } = riskManager.calculateExitPrices(entryPrice, quantity, 'BUY', signalSL, signalTP);

            // SL = entry * (1 - 0.10) = 100000 * 0.90 = 90000
            // TP = entry * (1 + 0.15) = 100000 * 1.15 = 115000
            expect(stopLoss).toBeCloseTo(90000, 2);
            expect(takeProfit).toBeCloseTo(115000, 2);
        });
    });
});
