import { TradeManager } from '../../src/core/trade.manager';
import { Trade } from '../../src/core/types';

describe('TradeManager', () => {
    let tradeManager: TradeManager;
    let mockExchange: any;
    let mockDb: any;

    beforeEach(() => {
        // Mock exchange
        mockExchange = {
            getTicker: jest.fn(),
            placeOrder: jest.fn()
        };

        // Mock database
        mockDb = {
            getOpenTrades: jest.fn(),
            updateTrade: jest.fn()
        };

        tradeManager = new TradeManager(mockExchange, mockDb);
    });

    describe('checkAndManagePositions', () => {
        it('should do nothing if no open trades', async () => {
            mockDb.getOpenTrades.mockResolvedValue([]);

            await tradeManager.checkAndManagePositions();

            expect(mockDb.getOpenTrades).toHaveBeenCalled();
            expect(mockExchange.getTicker).not.toHaveBeenCalled();
        });

        it('should check positions and close when stop loss is hit for BUY position', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 47000, timestamp: Date.now() });
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder1',
                price: 47000,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.getTicker).toHaveBeenCalledWith('BTC/USDT');
            expect(mockExchange.placeOrder).toHaveBeenCalledWith({
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: 1
            });
            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                status: 'CLOSED',
                exitPrice: 47000,
                exitTimestamp: expect.any(Number),
                duration: expect.any(Number)
            });
        });

        it('should check positions and close when take profit is hit for BUY position', async () => {
            const trade: Trade = {
                id: 'trade2',
                orderId: 'order2',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 56000, timestamp: Date.now() });
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder2',
                price: 56000,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.placeOrder).toHaveBeenCalledWith({
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: 1
            });
            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade2', {
                status: 'CLOSED',
                exitPrice: 56000,
                exitTimestamp: expect.any(Number),
                duration: expect.any(Number)
            });
        });

        it('should check positions and close when stop loss is hit for SELL position', async () => {
            const trade: Trade = {
                id: 'trade3',
                orderId: 'order3',
                symbol: 'BTC/USDT',
                side: 'SELL',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 52000,
                takeProfitPrice: 45000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 53000, timestamp: Date.now() });
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder3',
                price: 53000,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.placeOrder).toHaveBeenCalledWith({
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                quantity: 1
            });
            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade3', {
                status: 'CLOSED',
                exitPrice: 53000,
                exitTimestamp: expect.any(Number),
                duration: expect.any(Number)
            });
        });

        it('should not close position if price is within range', async () => {
            const trade: Trade = {
                id: 'trade4',
                orderId: 'order4',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 51000, timestamp: Date.now() });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.placeOrder).not.toHaveBeenCalled();
            expect(mockDb.updateTrade).not.toHaveBeenCalled();
        });

        it('should handle multiple positions', async () => {
            const trade1: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000
            };

            const trade2: Trade = {
                id: 'trade2',
                orderId: 'order2',
                symbol: 'ETH/USDT',
                side: 'SELL',
                quantity: 10,
                price: 3000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 3200,
                takeProfitPrice: 2800
            };

            mockDb.getOpenTrades.mockResolvedValue([trade1, trade2]);
            mockExchange.getTicker
                .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 47000, timestamp: Date.now() })
                .mockResolvedValueOnce({ symbol: 'ETH/USDT', price: 2900, timestamp: Date.now() });
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder1',
                price: 47000,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.getTicker).toHaveBeenCalledWith('BTC/USDT');
            expect(mockExchange.getTicker).toHaveBeenCalledWith('ETH/USDT');
            expect(mockExchange.placeOrder).toHaveBeenCalledTimes(1); // Only BTC/USDT hit SL
            expect(mockDb.updateTrade).toHaveBeenCalledTimes(1);
        });

        it('should handle errors gracefully', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockRejectedValue(new Error('Network error'));

            // Should not throw
            await expect(tradeManager.checkAndManagePositions()).resolves.not.toThrow();
        });

        it('should activate trailing stop when profit reaches activation threshold for BUY position', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000,
                trailingStopEnabled: true,
                trailingStopActivated: false,
                trailingStopActivationPercent: 2,
                trailingStopTrailPercent: 1,
                trailingStopHighPrice: 50000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 51000, timestamp: Date.now() }); // 2% profit

            await tradeManager.checkAndManagePositions();

            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                trailingStopActivated: true,
                trailingStopHighPrice: 51000,
                stopLossPrice: 51000 * 0.99 // 51000 * (1 - 0.01) = 50490
            });
            expect(mockExchange.placeOrder).not.toHaveBeenCalled();
        });

        it('should trail stop loss for BUY position as price increases', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 50490, // Previous trailing stop
                takeProfitPrice: 55000,
                trailingStopEnabled: true,
                trailingStopActivated: true,
                trailingStopActivationPercent: 2,
                trailingStopTrailPercent: 1,
                trailingStopHighPrice: 51000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 52000, timestamp: Date.now() }); // New high

            await tradeManager.checkAndManagePositions();

            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                trailingStopHighPrice: 52000,
                stopLossPrice: 52000 * 0.99 // 52000 * (1 - 0.01) = 51480
            });
            expect(mockExchange.placeOrder).not.toHaveBeenCalled();
        });

        it('should close position when price hits trailing stop for BUY position', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 51480, // Trailing stop
                takeProfitPrice: 55000,
                trailingStopEnabled: true,
                trailingStopActivated: true,
                trailingStopActivationPercent: 2,
                trailingStopTrailPercent: 1,
                trailingStopHighPrice: 52000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 51400, timestamp: Date.now() }); // Hit trailing stop
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder1',
                price: 51400,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.placeOrder).toHaveBeenCalledWith({
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: 1
            });
            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                status: 'CLOSED',
                exitPrice: 51400,
                exitTimestamp: expect.any(Number),
                duration: expect.any(Number)
            });
        });

        it('should activate trailing stop for SELL position and trail as price decreases', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'SELL',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 52000,
                takeProfitPrice: 45000,
                trailingStopEnabled: true,
                trailingStopActivated: false,
                trailingStopActivationPercent: 2,
                trailingStopTrailPercent: 1,
                trailingStopLowPrice: 50000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 49000, timestamp: Date.now() }); // 2% profit

            await tradeManager.checkAndManagePositions();

            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                trailingStopActivated: true,
                trailingStopLowPrice: 49000,
                stopLossPrice: 49000 * 1.01 // 49000 * (1 + 0.01) = 49490
            });
            expect(mockExchange.placeOrder).not.toHaveBeenCalled();
        });

        it('should not activate trailing stop if profit is below threshold', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000,
                trailingStopEnabled: true,
                trailingStopActivated: false,
                trailingStopActivationPercent: 2,
                trailingStopTrailPercent: 1,
                trailingStopHighPrice: 50000
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50100, timestamp: Date.now() }); // Only 0.2% profit

            await tradeManager.checkAndManagePositions();

            expect(mockDb.updateTrade).not.toHaveBeenCalled();
            expect(mockExchange.placeOrder).not.toHaveBeenCalled();
        });

        it('should use static stop loss when trailing stop is disabled', async () => {
            const trade: Trade = {
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 50000,
                timestamp: Date.now(),
                status: 'OPEN',
                stopLossPrice: 48000,
                takeProfitPrice: 55000,
                trailingStopEnabled: false
            };

            mockDb.getOpenTrades.mockResolvedValue([trade]);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 47000, timestamp: Date.now() });
            mockExchange.placeOrder.mockResolvedValue({
                id: 'closeOrder1',
                price: 47000,
                timestamp: Date.now()
            });

            await tradeManager.checkAndManagePositions();

            expect(mockExchange.placeOrder).toHaveBeenCalledWith({
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: 1
            });
            expect(mockDb.updateTrade).toHaveBeenCalledWith('trade1', {
                status: 'CLOSED',
                exitPrice: 47000,
                exitTimestamp: expect.any(Number),
                duration: expect.any(Number)
            });
        });
    });
});
