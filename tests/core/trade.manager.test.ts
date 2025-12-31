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
                exitTimestamp: expect.any(Number)
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
                exitTimestamp: expect.any(Number)
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
                exitTimestamp: expect.any(Number)
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
    });
});
