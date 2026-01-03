import { PortfolioManager } from '../../src/core/portfolio.manager';
import { Trade } from '../../src/core/types';

describe('PortfolioManager Audit Tests', () => {
    let portfolioManager: PortfolioManager;
    let mockExchange: any;
    let mockDb: any;

    beforeEach(() => {
        // Reset environment
        delete process.env.LEVERAGE_VALUE;
        delete process.env.PAPER_INITIAL_BALANCE;
        delete process.env.PAPER_BALANCE_ASSET;

        // Mock exchange
        mockExchange = {
            getTicker: jest.fn(),
            getBalance: jest.fn()
        };

        // Mock database
        mockDb = {
            getTrades: jest.fn(),
            getOpenTrades: jest.fn().mockResolvedValue([]),
            savePortfolioSnapshot: jest.fn()
        };

        portfolioManager = new PortfolioManager(mockExchange, mockDb);
    });

    it('should fall back to calculated balance when exchange throws error', async () => {
        process.env.PAPER_INITIAL_BALANCE = '10000';
        mockDb.getTrades.mockResolvedValue([]);
        mockDb.getOpenTrades.mockResolvedValue([]);

        // Exchange throws error
        mockExchange.getBalance.mockRejectedValue(new Error('API Error'));

        const snapshot = await portfolioManager.generateSnapshot();

        // Should use initial balance (10000)
        expect(snapshot.currentBalance).toBe(10000);
        expect(snapshot.currentEquity).toBe(10000);
    });

    it('should fall back to calculated balance when exchange returns NaN', async () => {
        process.env.PAPER_INITIAL_BALANCE = '10000';
        mockDb.getTrades.mockResolvedValue([]);

        // Exchange returns NaN
        mockExchange.getBalance.mockResolvedValue(NaN);

        const snapshot = await portfolioManager.generateSnapshot();

        expect(snapshot.currentBalance).toBe(10000);
    });

    it('should handle unlimited number of open trades', async () => {
        process.env.PAPER_INITIAL_BALANCE = '1000000';
        const numTrades = 1000;
        const openTrades: Trade[] = [];

        for (let i = 0; i < numTrades; i++) {
            openTrades.push({
                id: `trade${i}`,
                orderId: `order${i}`,
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 0.01,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                margin: 500 // Assuming 500 margin per trade
            });
        }

        mockDb.getTrades.mockResolvedValue(openTrades);
        mockDb.getOpenTrades.mockResolvedValue(openTrades);
        mockExchange.getBalance.mockResolvedValue(500000); // Arbitrary exchange balance
        mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50000 });

        const snapshot = await portfolioManager.generateSnapshot();

        expect(snapshot.openTrades).toHaveLength(numTrades);
        // Verify no trades were dropped
        expect(snapshot.openTrades.length).toBe(1000);
    });

    it('should prevent negative balance reporting', async () => {
        process.env.PAPER_INITIAL_BALANCE = '1000';
        // Mock exchange returning negative balance (e.g. debt)
        mockExchange.getBalance.mockResolvedValue(-500);
        mockDb.getTrades.mockResolvedValue([]);

        const snapshot = await portfolioManager.generateSnapshot();

        // Should clamp to 0
        expect(snapshot.currentBalance).toBe(0);
    });

    it('should correctly calculate margin with updated leverage config', async () => {
        process.env.PAPER_INITIAL_BALANCE = '10000';
        process.env.LEVERAGE_VALUE = '10'; // 10x leverage

        const positionValue = 10000; // 10,000 USDT position
        const expectedMargin = 1000; // 1,000 USDT margin

        const trade: Trade = {
            id: 't1',
            orderId: 'o1',
            symbol: 'BTC/USDT',
            side: 'BUY',
            quantity: 0.2, // 0.2 * 50000 = 10000
            price: 50000,
            timestamp: Date.now(),
            status: 'OPEN'
            // margin undefined, should be calculated
        };

        mockDb.getTrades.mockResolvedValue([trade]);
        mockDb.getOpenTrades.mockResolvedValue([trade]);
        mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50000 });

        // Force fallback to check margin calc
        mockExchange.getBalance.mockRejectedValue(new Error('Fail'));

        const snapshot = await portfolioManager.generateSnapshot();

        // Wallet Balance = 10000
        // Margin Used = 1000
        // Current Balance = 9000
        expect(snapshot.currentBalance).toBe(9000);
    });
});
