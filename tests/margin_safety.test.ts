import { PaperExchange } from '../src/adapters/exchange/paper';
import { RiskManager } from '../src/core/risk.manager';
import { IMarketDataProvider } from '../src/interfaces/market_data.interface';
import { config } from '../src/config/env';
import { OrderRequest } from '../src/core/types';

describe('Margin Safety Checks', () => {
    let exchange: PaperExchange;
    let riskManager: RiskManager;
    let mockDataProvider: jest.Mocked<IMarketDataProvider>;

    beforeEach(async () => {
        mockDataProvider = {
            getCandles: jest.fn(),
            getTicker: jest.fn(),
            start: jest.fn(),
        } as any;

        // Reset to match production config
        (config as any).PAPER_INITIAL_BALANCE = 10000;
        process.env.MAX_DAILY_DRAWDOWN_PERCENT = '5';

        exchange = new PaperExchange(mockDataProvider);
        riskManager = new RiskManager(exchange);

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
});
