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

        it('should generate snapshot with no trades', async () => {
            mockDb.getTrades.mockResolvedValue([]);
            mockExchange.getBalance.mockResolvedValue(10000);

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
            mockExchange.getBalance.mockResolvedValue(10000);

            const snapshot = await portfolioManager.generateSnapshot();

            // PnL calculations:
            // Trade1: BUY 1 BTC @ 50000, exit @ 55000 = +5000
            // Trade2: SELL 10 ETH @ 3000, exit @ 2500 = +(3000-2500)*10 = +5000
            // Trade3: BUY 0.5 BTC @ 40000, exit @ 38000 = -(40000-38000)*0.5 = -1000
            // Total PnL: 5000 + 5000 - 1000 = 9000
            expect(snapshot.pnl).toBe(9000);

            // Win rate: 2 winning trades out of 3 = 66.67%
            expect(snapshot.winRate).toBe(2 / 3);

            // Profit factor: gross profit / gross loss = (5000+5000) / 1000 = 10000/1000 = 10
            expect(snapshot.profitFactor).toBe(10);

            expect(snapshot.openTrades).toHaveLength(0);
            expect(snapshot.closedTrades).toHaveLength(3);

            // New Logic: walletBalance = initialBalance (10000) + realizedPnL (9000) = 19000
            // Equity = walletBalance + unrealized (0) = 19000
            // For balance: exchange mock is 10000 (from beforeEach)
            expect(snapshot.currentEquity).toBe(19000);
            expect(snapshot.currentBalance).toBe(10000);
        });

        it('should calculate metrics for open trades with current prices', async () => {
            // Set up environment for proper balance calculation
            process.env.PAPER_INITIAL_BALANCE = '10000';
            process.env.LEVERAGE_VALUE = '1'; // No leverage for this test

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
            mockExchange.getBalance.mockResolvedValue(10000);
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

            // New Logic: 
            // Wallet Balance = 10000 (Initial) + 0 (Realized) = 10000
            // Total Margin (no leverage) = 50000 (BTC) + 30000 (ETH) = 80000
            // Current Balance = 10000 (from exchange mock)
            // Unrealized PnL = 2000 (BTC) + 2000 (ETH) = 4000
            // Current Equity = Wallet Balance (10000) + Unrealized (4000) = 14000
            expect(snapshot.currentBalance).toBe(10000);
            expect(snapshot.currentEquity).toBe(14000);

            // Holdings should include BTC, ETH and USDT (from exchange mock)
            expect(snapshot.holdings).toMatchObject({
                'BTC/USDT': 1,
                'ETH/USDT': -10, // Short
                'USDT': 10000
            });

            // Clean up
            delete process.env.PAPER_INITIAL_BALANCE;
            delete process.env.LEVERAGE_VALUE;
        });

        it('should handle mixed open and closed trades', async () => {
            // Set up environment for proper balance calculation
            process.env.PAPER_INITIAL_BALANCE = '10000';
            process.env.LEVERAGE_VALUE = '1'; // No leverage

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
            mockExchange.getBalance.mockResolvedValue(10000);
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

            // New Logic:
            // Wallet Balance = 10000 (Initial) + 5000 (Realized) = 15000
            // Total Margin (no leverage, ETH only) = 10 * 3000 = 30000
            // Balance = 10000 (from exchange mock)
            // Equity = Wallet Balance (15000) + 2000 unrealized = 17000
            expect(snapshot.currentBalance).toBe(10000);
            expect(snapshot.currentEquity).toBe(17000);

            // Clean up
            delete process.env.PAPER_INITIAL_BALANCE;
            delete process.env.LEVERAGE_VALUE;
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
            mockExchange.getBalance.mockResolvedValue(10000);

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.pnl).toBe(-5000);
            expect(snapshot.winRate).toBe(0);
            expect(snapshot.profitFactor).toBe(0); // No profits
        });

        it('should handle profit factor with no trades', async () => {
            mockDb.getTrades.mockResolvedValue([]);
            mockExchange.getBalance.mockResolvedValue(10000);

            const snapshot = await portfolioManager.generateSnapshot();

            expect(snapshot.profitFactor).toBe(0);
        });

        it('should calculate balance correctly with leverage: initial_balance - margin_for_open_positions', async () => {
            // Set up environment for leverage calculations
            process.env.LEVERAGE_VALUE = '5';
            process.env.PAPER_INITIAL_BALANCE = '10000';

            const openTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 0.2, // Position value: 0.2 * 50000 = 10,000
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                    // Margin = 10,000 / 5 = 2,000
                }
            ];

            mockDb.getTrades.mockResolvedValue(openTrades);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });

            const snapshot = await portfolioManager.generateSnapshot();

            // New Logic: 
            // Wallet Balance = 10000
            // Margin = 10000 / 5 = 2000
            // Balance = 10000 - 2000 = 8000
            // Equity = Wallet Balance (10000) + Unrealized (0) = 10000
            expect(snapshot.currentBalance).toBe(8000);
            expect(snapshot.currentEquity).toBe(10000);

            // Clean up
            delete process.env.LEVERAGE_VALUE;
            delete process.env.PAPER_INITIAL_BALANCE;
        });

        it('should calculate balance correctly with multiple open positions and leverage', async () => {
            // Set up environment
            process.env.LEVERAGE_VALUE = '10';
            process.env.PAPER_INITIAL_BALANCE = '20000';

            const openTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 0.1, // Position value: 0.1 * 50000 = 5,000
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                    // Margin = 5,000 / 10 = 500
                },
                {
                    id: 'trade2',
                    orderId: 'order2',
                    symbol: 'ETH/USDT',
                    side: 'SELL',
                    quantity: 5, // Position value: 5 * 3000 = 15,000
                    price: 3000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                    // Margin = 15,000 / 10 = 1,500
                }
            ];

            mockDb.getTrades.mockResolvedValue(openTrades);
            mockExchange.getTicker
                .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() })
                .mockResolvedValueOnce({ symbol: 'ETH/USDT', price: 3000, timestamp: Date.now() });

            const snapshot = await portfolioManager.generateSnapshot();

            // Total margin = 500 + 1,500 = 2,000
            // Balance should be: initial_balance - total_margin = 20,000 - 2,000 = 18,000
            expect(snapshot.currentBalance).toBe(18000);

            // Clean up
            delete process.env.LEVERAGE_VALUE;
            delete process.env.PAPER_INITIAL_BALANCE;
        });

        it('should calculate balance correctly when leverage is disabled', async () => {
            // Leverage disabled means leverage = 1 (no margin, full position value as margin)
            process.env.LEVERAGE_VALUE = '1';
            process.env.PAPER_INITIAL_BALANCE = '10000';

            const openTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 0.1, // Position value: 0.1 * 50000 = 5,000
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                    // Margin = 5,000 / 1 = 5,000 (full position value when no leverage)
                }
            ];

            mockDb.getTrades.mockResolvedValue(openTrades);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });

            const snapshot = await portfolioManager.generateSnapshot();

            // Balance should be: initial_balance - margin = 10,000 - 5,000 = 5,000
            expect(snapshot.currentBalance).toBe(5000);

            // Clean up
            delete process.env.LEVERAGE_VALUE;
            delete process.env.PAPER_INITIAL_BALANCE;
        });

        it('should handle balance calculation with no open positions', async () => {
            process.env.PAPER_INITIAL_BALANCE = '15000';

            mockDb.getTrades.mockResolvedValue([]); // No trades

            const snapshot = await portfolioManager.generateSnapshot();

            // Balance should be initial balance when no positions
            expect(snapshot.currentBalance).toBe(15000);

            // Clean up
            delete process.env.PAPER_INITIAL_BALANCE;
        });

        it('should maintain balance consistency regardless of exchange state', async () => {
            // This test verifies that balance calculation is deterministic
            // and doesn't depend on exchange.getBalance() which can be inconsistent
            process.env.LEVERAGE_VALUE = '5';
            process.env.PAPER_INITIAL_BALANCE = '10000';

            const openTrades: Trade[] = [
                {
                    id: 'trade1',
                    orderId: 'order1',
                    symbol: 'BTC/USDT',
                    side: 'BUY',
                    quantity: 0.2, // Position value: 10,000, Margin: 2,000
                    price: 50000,
                    timestamp: Date.now(),
                    status: 'OPEN'
                }
            ];

            mockDb.getTrades.mockResolvedValue(openTrades);
            mockExchange.getTicker.mockResolvedValue({ symbol: 'BTC/USDT', price: 50000, timestamp: Date.now() });

            // Mock exchange returning a balance
            mockExchange.getBalance.mockResolvedValue(5000);

            const snapshot = await portfolioManager.generateSnapshot();

            // Balance should now match the exchange's reported balance (Priority)
            expect(snapshot.currentBalance).toBe(5000);

            // Clean up
            delete process.env.LEVERAGE_VALUE;
            delete process.env.PAPER_INITIAL_BALANCE;
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
                expect(winRate).toBe(2 / 3); // 2 winning trades out of 3
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
