import { PaperExchange } from '../src/adapters/exchange/paper';
import { RiskManager } from '../src/core/risk.manager';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { config } from '../src/config/env';
import { OrderRequest } from '../src/core/types';
import { MockStore, MockTimeProvider } from './test_mocks';

describe('Margin Safety Checks', () => {
    let exchange: PaperExchange;
    let riskManager: RiskManager;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;
    let mockStore: MockStore;
    let mockTimeProvider: MockTimeProvider;

    beforeEach(async () => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn(),
            start: jest.fn(),
        } as any;

        // Reset to match production config
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        process.env.MAX_DAILY_DRAWDOWN_PERCENT = '5';

        mockStore = new MockStore();
        mockTimeProvider = new MockTimeProvider();

        exchange = new PaperExchange(mockDataProvider);
        riskManager = new RiskManager(exchange, mockStore, mockTimeProvider);

        // Mock initial balance
        jest.spyOn(exchange, 'getBalance').mockResolvedValue(10000);
        await riskManager.init();
    });

    test('should REJECT Short orders when in Drawdown', async () => {
        // 1. Simulate Drawdown
        // Balance drops to 9400 (6% loss, > 5% limit)
        jest.spyOn(exchange, 'getBalance').mockResolvedValue(9400);

        const shortOrder: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'SELL', // SHORT
            type: 'MARKET',
            quantity: 0.1
        };

        // This should return FALSE (unsafe)
        const isSafe = await riskManager.validateOrder(shortOrder);

        expect(isSafe).toBe(false);
    });

    test('should RESET daily drawdown at the start of a new day', async () => {
        const getBalanceSpy = jest.spyOn(exchange, 'getBalance');

        // 1. Simulate Drawdown
        // Balance drops to 9400 (6% loss, > 5% limit)
        getBalanceSpy.mockResolvedValue(9400);

        const order: OrderRequest = {
            symbol: 'BTC/USDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.1
        };

        // This should return FALSE (unsafe)
        let isSafe = await riskManager.validateOrder(order);
        expect(isSafe).toBe(false);

        // 3. Simulate Next Day (UTC)
        const currentDay = mockTimeProvider.getUTCDate();
        mockTimeProvider.setDay(currentDay + 1);

        // 4. Validate Order Again (Should Trigger Reset)
        // Balance is still 9400, but it becomes the NEW Start-of-Day Balance
        // So Drawdown is 0%
        isSafe = await riskManager.validateOrder(order);

        expect(isSafe).toBe(true);
    });
});
