import { PaperExchange } from '../src/adapters/exchange/paper';
import { PortfolioManager } from '../src/core/portfolio.manager';
import { MockStore } from './test_mocks';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { RealTimeProvider } from '../src/core/time.provider';
import { config } from '../src/config/env';

describe('Audit Reproduction: Balance vs Equity Discrepancy', () => {
    let exchange: PaperExchange;
    let portfolioManager: PortfolioManager;
    let mockStore: MockStore;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;

    beforeEach(async () => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn(),
            start: jest.fn(),
        } as any;

        // Force config to match the scenario
        // Initial Capital: 10,000
        // Leverage: 5x
        // Positions: 10 symbols, each ~$1,025 in value (approx 10% of balance)
        // Margin per position: ~205
        // Total Margin: ~2,050
        // Current Balance displayed in user screenshot was $9,878 (with $81 profit)
        // Let's reproduce the state where Balance < Initial despite Profit.

        (config as any).PAPER_INITIAL_BALANCE = 10000;
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 5;
        (config as any).PAPER_BALANCE_ASSET = 'USDT';

        mockStore = new MockStore();
        exchange = new PaperExchange(mockDataProvider);
        portfolioManager = new PortfolioManager(exchange, mockStore, new RealTimeProvider());
    });

    test('should correctly distinguish between walletBalance, currentBalance (available), and currentEquity', async () => {
        const symbol = 'BTC/USDT';
        const entryPrice = 90000;
        const quantity = 0.01; // Pos value = 900. Margin = 180.

        mockDataProvider.getTicker.mockResolvedValue({
            symbol,
            price: entryPrice,
            timestamp: Date.now()
        });

        // 1. Initial State
        let snapshot = await portfolioManager.generateSnapshot();
        expect(snapshot.walletBalance).toBe(10000);
        expect(snapshot.currentBalance).toBe(10000); // Available
        expect(snapshot.currentEquity).toBe(10000);

        // 2. Open 5 positions
        // Total Margin: 180 * 5 = 900
        for (let i = 0; i < 5; i++) {
            const order = await exchange.placeOrder({
                symbol: `SYM${i}/USDT`,
                side: 'BUY',
                type: 'MARKET',
                quantity: 0.01 // Fixed quantity for simplicity
            });
            // Mock ticker for these symbols too
            mockDataProvider.getTicker.mockResolvedValue({
                symbol: `SYM${i}/USDT`,
                price: entryPrice,
                timestamp: Date.now()
            });

            // Save trade to mock store so portfolio manager sees it
            await mockStore.saveTrade({
                id: order.id,
                orderId: order.id,
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                price: order.price,
                timestamp: order.timestamp,
                status: 'OPEN',
                margin: entryPrice * 0.01 / 5,
                leverage: 5
            });
        }

        snapshot = await portfolioManager.generateSnapshot();

        // Wallet Balance remains 10,000 (Initial + Realized 0)
        expect(snapshot.walletBalance).toBe(10000);

        // Margin Used: (900 * 0.01 / 5) * 5 = 180 * 5 = 900
        expect(snapshot.totalMarginUsed).toBe(900);

        // Available Balance: 10,000 - 900 = 9,100
        // This is what the user was seeing as "Current Balance" and got confused
        expect(snapshot.currentBalance).toBe(9100);

        // Equity should be 10,000 (Wallet Balance + Unrealized PnL 0)
        expect(snapshot.currentEquity).toBe(10000);

        // 3. Simulate Price Increase (Profit)
        // Price goes to 100,000 (+10,000 per BTC)
        // PnL per pos: 10,000 * 0.01 = 100
        // Total Unrealized: 500
        for (let i = 0; i < 5; i++) {
            mockDataProvider.getTicker.mockImplementation(async (s) => ({
                symbol: s,
                price: 100000,
                timestamp: Date.now()
            }));
        }

        snapshot = await portfolioManager.generateSnapshot();

        expect(snapshot.walletBalance).toBe(10000);
        expect(snapshot.totalMarginUsed).toBe(900);
        expect(snapshot.currentBalance).toBe(9100); // Available doesn't change with unrealized profit

        // Equity = Wallet (10k) + Unrealized (500) = 10,500
        expect(snapshot.currentEquity).toBe(10500);

        // 4. Close one position with profit
        // Profit: 100. Returning margin: 180.
        // Balance increases by 280.
        // New Wallet Balance: 10,100.
        // Remaining Margin: 180 * 4 = 720.
        // New Available: 10,100 - 720 = 9,380.

        const trades = await mockStore.getOpenTrades();
        const tradeToClose = trades[0];

        await exchange.placeOrder({
            symbol: tradeToClose.symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: tradeToClose.quantity
        });

        // Update trade status in mock store
        await mockStore.updateTrade(tradeToClose.id, {
            status: 'CLOSED',
            exitPrice: 100000,
            exitTimestamp: Date.now()
        });

        snapshot = await portfolioManager.generateSnapshot();

        expect(snapshot.walletBalance).toBe(10100); // 10k + 100 profit
        expect(snapshot.totalMarginUsed).toBe(720);
        expect(snapshot.currentBalance).toBe(9380); // 10100 - 720
        expect(snapshot.pnl).toBe(100);

        // Remaining Equity: 10,100 (Wallet) + 400 (Unrealized) = 10,500
        expect(snapshot.currentEquity).toBe(10500);
    });
});
