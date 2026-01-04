import { PaperExchange } from '../src/adapters/exchange/paper';
import { PortfolioManager } from '../src/core/portfolio.manager';
import { MockStore } from './test_mocks';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { RealTimeProvider } from '../src/core/time.provider';
import { config } from '../src/config/env';

describe('Audit Reproduction: Notional-Based Math', () => {
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

        (config as any).PAPER_INITIAL_BALANCE = 10000;
        (config as any).LEVERAGE_ENABLED = true;
        (config as any).LEVERAGE_VALUE = 5;
        (config as any).PAPER_BALANCE_ASSET = 'USDT';

        mockStore = new MockStore();
        exchange = new PaperExchange(mockDataProvider);
        portfolioManager = new PortfolioManager(exchange, mockStore, new RealTimeProvider());
    });

    test('should correctly implement Notional Deduction (User Math)', async () => {
        const symbol = 'BTC/USDT';
        const entryPrice = 90000;
        const quantity = 0.01; // Pos value = 900.

        mockDataProvider.getTicker.mockResolvedValue({
            symbol,
            price: entryPrice,
            timestamp: Date.now()
        });

        // 1. Initial State
        let snapshot = await portfolioManager.generateSnapshot();
        expect(snapshot.initialBalance).toBe(10000);
        expect(snapshot.currentBalance).toBe(10000);
        expect(snapshot.currentEquity).toBe(10000);

        // 2. Open 5 positions
        // Total Notional: 900 * 5 = 4500
        for (let i = 0; i < 5; i++) {
            const sym = `SYM${i}/USDT`;
            const order = await exchange.placeOrder({
                symbol: sym,
                side: 'BUY',
                type: 'MARKET',
                quantity: 0.01
            });

            mockDataProvider.getTicker.mockImplementation(async (s) => ({
                symbol: s,
                price: entryPrice,
                timestamp: Date.now()
            }));

            await mockStore.saveTrade({
                id: order.id,
                orderId: order.id,
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                price: order.price,
                timestamp: order.timestamp,
                status: 'OPEN',
                margin: order.price * 0.01 / 5,
                leverage: 5
            });
        }

        // Total Notional: 900 * 5 = 4500
        // Leverage 5x => Margin per pos = 900 / 5 = 180
        // Total Margin = 180 * 5 = 900
        // Available Balance = 10000 - 900 = 9100
        snapshot = await portfolioManager.generateSnapshot();
        expect(snapshot.currentBalance).toBe(9100);
        // Equity = Settled Cash (10000) + Unrealized (0) = 10000
        expect(snapshot.currentEquity).toBe(10000);

        // 3. Simulate Price Increase
        // Price goes to 100,000 (+10,000 profit per unit)
        // Unrealized per pos: 10,000 * 0.01 = 100
        // Total Unrealized: 500
        mockDataProvider.getTicker.mockImplementation(async (s) => ({
            symbol: s,
            price: 100000,
            timestamp: Date.now()
        }));

        snapshot = await portfolioManager.generateSnapshot();
        expect(snapshot.currentBalance).toBe(9100);
        // Equity = Settled Cash (10000) + Unrealized (500) = 10500
        expect(snapshot.currentEquity).toBe(10500);

        // 4. Close one position with profit
        const trades = await mockStore.getOpenTrades();
        const tradeToClose = trades[0];

        await mockStore.updateTrade(tradeToClose.id, {
            status: 'CLOSED',
            exitPrice: 100000,
            exitTimestamp: Date.now()
        });

        snapshot = await portfolioManager.generateSnapshot();

        // Realized PnL = (100000 - 90000) * 0.01 = 100
        // Settled Cash = 10100
        // Remaining Margin = 4 * 180 = 720
        // New Available Balance = 10100 - 720 = 9380
        // Remaining Unrealized = 4 * 0.01 * (100000 - 90000) = 400
        // New Equity = 10100 + 400 = 10500

        expect(snapshot.pnl).toBe(100);
        expect(snapshot.totalNotionalValue).toBe(3600);
        expect(snapshot.currentBalance).toBe(9380);
        expect(snapshot.currentEquity).toBe(10500);
    });
});
