import { PortfolioManager } from '../../src/core/portfolio.manager';
import { Trade } from '../../src/core/types';
import { PortfolioSnapshot } from '../../src/interfaces/repository.interface';

describe('PortfolioManager', () => {
    let portfolioManager: PortfolioManager;
    let mockExchange: any;
    let mockDb: any;

    beforeEach(() => {
        // Mock exchange
        mockExchange = {
            getTicker: jest.fn(),
            getBalance: jest.fn()
        };

        // Mock database
        mockDb = {
            getTrades: jest.fn(),
            savePortfolioSnapshot: jest.fn()
        };

        portfolioManager = new PortfolioManager(mockExchange, mockDb);
    });

    describe('generateSnapshot', () => {
        beforeEach(() => {
            mockExchange.getBalance.mockResolvedValue(10000); // USDT balance
        });

        it('should generate snapshot with no trades', async () => {
            mockDb.getTrades.mockResolvedValue([]);

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot).toMatchObject({
                totalValue: 10000,
                holdings: { USDT: 10000 },
                pnl: 0,
                winRate: 0,
                profitFactor: 0,
                openTrades: [],
                closedTrades: [],
                currentEquity: 10000,
                currentBalance: 10000
            });
            expect(snapshot.timestamp).toBeGreaterThan(0);
        });

        it('should calculate metrics for closed trades only', async () => {
            const closedTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 55000,
                    exitTimestamp: Date.now()
                },
                {
                    id: 'trade2',
                    orderId: 'order2',
                    symbol: 'ETH/USDT',
                    side: 'SELL',
                    quantity: 10,
                    price: 3000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 2500,
                    exitTimestamp: Date.now()
                },
                {
                    id: 'trade3',
                    orderId: 'order3',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 0.5,
                    price: 40000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 38000,
                    exitTimestamp: Date.now()
                }
            ];

            mockDb.getTrades.mockResolvedValue(closedTrades);

            const snapshot = await portfolioManager.generateSnapshot();

            // PnL calculations:
            // Trade1: BUY 1 BTC @ 50000, exit @ 55000 = +5000
            // Trade2: SELL 10 ETH @ 3000, exit @ 2500 = +(3000-2500)*10 = +5000
            // Trade3: BUY 0.5 BTC @ 40000, exit @ 38000 = -(40000-38000)*0.5 = -1000
            // Total PnL: 5000 + 5000 - 1000 = 9000
            expect(snapshot.pnl).toBe(9000);

            // Win rate: 2 winning trades out of 3 = 66.67%
            expect(snapshot.winRate).toBe(2/3);

            // Profit factor: gross profit / gross loss = (5000+5000) / 1000 = 10000/1000 = 10
            expect(snapshot.profitFactor).toBe(10);

            expect(snapshot.openTrades).toHaveLength(0);
            expect(snapshot.closedTrades).toHaveLength(3);
            expect(snapshot.currentEquity).toBe(10000); // 10000 balance + 0 unrealized (no open trades)
            expect(snapshot.currentBalance).toBe(10000);
        });

        it('should calculate metrics for open trades with current prices', async () => {
            const openTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                },
                {
                    id: 'trade2',
                    orderId: 'order2',
                    symbol: 'ETH/USDT',
                    side: 'SELL',
                    quantity: 10,
                    price: 3000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                }
            ];

            mockDb.getTrades.mockResolvedValue(openTrades);
            mockExchange.getTicker
                .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 52000, timestamp: Date.now() })
                .mockResolvedValueOnce({ symbol: 'ETH/USDT', price: 2800, timestamp: Date.now() });

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.pnl).toBe(0); // No closed trades
            expect(snapshot.winRate).toBe(0);
            expect(snapshot.profitFactor).toBe(0);
            expect(snapshot.openTrades).toHaveLength(2);
            expect(snapshot.closedTrades).toHaveLength(0);

            // Check open trades details
            const btcTrade = snapshot.openTrades.find(t => t.symbol === 'BTC/USDT');
            expect(btcTrade).toMatchObject({
                id: 'trade1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                entryPrice: 50000,
                currentPrice: 52000,
                unrealizedPnL: 2000 // (52000 - 50000) * 1
            });

            const ethTrade = snapshot.openTrades.find(t => t.symbol === 'ETH/USDT');
            expect(ethTrade).toMatchObject({
                id: 'trade2',
                symbol: 'ETH/USDT',
                side: 'SELL',
                quantity: 10,
                entryPrice: 3000,
                currentPrice: 2800,
                unrealizedPnL: 2000 // (3000 - 2800) * 10
            });

            expect(snapshot.currentEquity).toBe(14000); // 10000 balance + 4000 unrealized
        });

        it('should handle mixed open and closed trades', async () => {
            const trades: Trade[] = [
                // Closed winning trade
                {
                    id: 'closed1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 55000,
                    exitTimestamp: Date.now()
                },
                // Open trade
                {
                    id: 'open1',
                    orderId: 'order2',
                    symbol: 'ETH/USDT',
                    side: 'BUY',
                    quantity: 10,
                    price: 3000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                }
            ];

            mockDb.getTrades.mockResolvedValue(trades);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'ETH/USDT', price: 3200, timestamp: Date.now() });

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.pnl).toBe(5000); // Only from closed trade
            expect(snapshot.winRate).toBe(1); // 1 winning trade out of 1 closed
            expect(snapshot.profitFactor).toBe(Infinity); // Profit with no loss
            expect(snapshot.openTrades).toHaveLength(1);
            expect(snapshot.closedTrades).toHaveLength(1);

            // Check closed trade details
            expect(snapshot.closedTrades[0]).toMatchObject({
                id: 'closed1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                entryPrice: 50000,
                exitPrice: 55000,
                pnl: 5000
            });

            expect(snapshot.currentEquity).toBe(12000); // 10000 balance + 2000 unrealized
        });

        it('should handle profit factor with only losses', async () => {
            const closedTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 45000,
                    exitTimestamp: Date.now()
                }
            ];

            mockDb.getTrades.mockResolvedValue(closedTrades);

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.pnl).toBe(-5000);
            expect(snapshot.winRate).toBe(0);
            expect(snapshot.profitFactor).toBe(0); // No profits
        });

        it('should handle profit factor with no trades', async () => {
            mockDb.getTrades.mockResolvedValue([]);

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.profitFactor).toBe(0);
        });
    });

    describe('saveSnapshot', () => {
        it('should generate and save snapshot', async () => {
            mockDb.getTrades.mockResolvedValue([]);
            mockExchange.getBalance.mockResolvedValue(10000);
            mockDb.savePortfolioSnapshot.mockResolvedValue(undefined);

            await portfolioManager.saveSnapshot();

            expect(mockDb.savePortfolioSnapshot).toHaveBeenCalledWith(
                expect.objectContaining({
                    totalValue: 10000,
                    holdings: { USDT: 10000 },
                    pnl: 0,
                    winRate: 0,
                    profitFactor: 0,
                    openTrades: [],
                    closedTrades: [],
                    currentEquity: 10000,
                    currentBalance: 10000,
                    timestamp: expect.any(Number)
                })
            );
        });
    });

    describe('calculation methods', () => {
        describe('calculateTradePnL', () => {
            it('should calculate PnL for BUY trade', () => {
                const trade: Trade = {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 55000,
                    exitTimestamp: Date.now()
                };

                const pnl = (portfolioManager as any).calculateTradePnL(trade);
                expect(pnl).toBe(5000); // (55000 - 50000) * 1
            });

            it('should calculate PnL for SELL trade', () => {
                const trade: Trade = {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'SELL',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'CLOSED',
                    exitPrice: 45000,
                    exitTimestamp: Date.now()
                };

                const pnl = (portfolioManager as any).calculateTradePnL(trade);
                expect(pnl).toBe(5000); // (50000 - 45000) * 1
            });

            it('should return 0 for trade without exit price', () => {
                const trade: Trade = {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                };

                const pnl = (portfolioManager as any).calculateTradePnL(trade);
                expect(pnl).toBe(0);
            });
        });

        describe('calculateUnrealizedPnL', () => {
            it('should calculate unrealized PnL for BUY position', () => {
                const trade: Trade = {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                };

                const pnl = (portfolioManager as any).calculateUnrealizedPnL(trade, 52000);
                expect(pnl).toBe(2000); // (52000 - 50000) * 1
            });

            it('should calculate unrealized PnL for SELL position', () => {
                const trade: Trade = {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'SELL',
                    quantity: 1,
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                };

                const pnl = (portfolioManager as any).calculateUnrealizedPnL(trade, 48000);
                expect(pnl).toBe(2000); // (50000 - 48000) * 1
            });
        });

        describe('calculateWinRate', () => {
            it('should calculate win rate correctly', () => {
                const trades: Trade[] = [
                    {
                        id: 'trade1',
                        orderId: 'order1',
                        symbol: 'BTC/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 50000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 55000,
                        exitTimestamp: Date.now()
                    },
                    {
                        id: 'trade2',
                        orderId: 'order2',
                        symbol: 'ETH/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 3000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 2500,
                        exitTimestamp: Date.now()
                    },
                    {
                        id: 'trade3',
                        orderId: 'order3',
                        symbol: 'BTC/USDT',
                        side: 'SELL',
                        quantity: 1,
                        price: 40000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 35000,
                        exitTimestamp: Date.now()
                    }
                ];

                const winRate = (portfolioManager as any).calculateWinRate(trades);
                expect(winRate).toBe(2/3); // 2 winning trades out of 3
            });

            it('should return 0 for no trades', () => {
                const winRate = (portfolioManager as any).calculateWinRate([]);
                expect(winRate).toBe(0);
            });
        });

        describe('calculateProfitFactor', () => {
            it('should calculate profit factor correctly', () => {
                const trades: Trade[] = [
                    {
                        id: 'trade1',
                        orderId: 'order1',
                        symbol: 'BTC/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 50000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 55000,
                        exitTimestamp: Date.now()
                    },
                    {
                        id: 'trade2',
                        orderId: 'order2',
                        symbol: 'ETH/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 3000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 2500,
                        exitTimestamp: Date.now()
                    }
                ];

                const profitFactor = (portfolioManager as any).calculateProfitFactor(trades);
                expect(profitFactor).toBe(10); // 5000 profit / 500 loss = 10
            });

            it('should return Infinity for profits with no losses', () => {
                const trades: Trade[] = [
                    {
                        id: 'trade1',
                        orderId: 'order1',
                        symbol: 'BTC/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 50000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 55000,
                        exitTimestamp: Date.now()
                    }
                ];

                const profitFactor = (portfolioManager as any).calculateProfitFactor(trades);
                expect(profitFactor).toBe(Infinity);
            });

            it('should return 0 for losses with no profits', () => {
                const trades: Trade[] = [
                    {
                        id: 'trade1',
                        orderId: 'order1',
                        symbol: 'BTC/USDT',
                        side: 'BUY',
                        quantity: 1,
                        price: 50000,
                        timestamp: Date.now(),
                        status: 'CLOSED',
                        exitPrice: 45000,
                        exitTimestamp: Date.now()
                    }
                ];

                const profitFactor = (portfolioManager as any).calculateProfitFactor(trades);
                expect(profitFactor).toBe(0);
            });
        });
    });
});
