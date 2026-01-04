import { BotEngine } from '../../src/core/engine';
import { config } from '../../src/config/env';
import { MockStore, MockTimeProvider } from '../test_mocks';
import { PaperExchange } from '../../src/adapters/exchange/paper';
import { MemoryDataProvider } from '../../src/adapters/data/memory_data';
import { StrategyManager } from '../../src/core/strategy.manager';

describe('BotEngine Integration', () => {
    let mockStore: MockStore;
    let mockTime: MockTimeProvider;
    let mockExchange: PaperExchange;
    let originalConfig: any;

    beforeEach(() => {
        // Mock StrategyManager to allow any strategy name in tests
        jest.spyOn(StrategyManager, 'getStrategy').mockReturnValue({
            name: 'MOCK',
            init: jest.fn(),
            update: jest.fn().mockResolvedValue({ action: 'HOLD', symbol: 'BTC/USDT' }),
            onPositionOpened: jest.fn(),
            onPositionClosed: jest.fn()
        } as any);

        originalConfig = { ...config };
        mockStore = new MockStore();
        mockTime = new MockTimeProvider();
        mockExchange = new PaperExchange(new MemoryDataProvider([]), mockTime);
    });

    afterEach(() => {
        Object.assign(config, originalConfig);
        jest.restoreAllMocks();
    });

    const createEngine = (name: string = config.STRATEGY_NAME) => {
        const engine = new BotEngine(name, mockTime, mockExchange, mockStore);
        // Replace strategy instance on engine with its own mock for isolation
        engine['strategy'] = {
            name: name,
            init: jest.fn(),
            update: jest.fn().mockResolvedValue({ action: 'HOLD', symbol: 'BTC/USDT' }),
            onPositionOpened: jest.fn(),
            onPositionClosed: jest.fn()
        } as any;
        return engine;
    };

    it('should trigger Stop Loss when price drops', async () => {
        config.ALLOW_MULTIPLE_POSITIONS = false;
        const engine = createEngine();
        const stratUpdateSpy = jest.spyOn(engine['strategy'], 'update');
        stratUpdateSpy.mockResolvedValueOnce({ action: 'BUY', symbol: 'BTC/USDT' });
        stratUpdateSpy.mockResolvedValue({ action: 'HOLD', symbol: 'BTC/USDT' });

        const now = 1700000000000;
        mockTime.setNow(now);

        const buyCandle = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now };
        // Drop to 97 triggers SL (98)
        const slCandle = { symbol: 'BTC/USDT', interval: '1m', open: 97, high: 97, low: 97, close: 97, volume: 100, startTime: now + 60000 };

        const placeOrderSpy = jest.spyOn(mockExchange, 'placeOrder');

        // Tick 1: BUY
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([buyCandle]);
        await engine.tick('BTC/USDT', '1m');

        expect(engine['activeTrade']).toBeDefined();
        // Default SL is 2%. Entry 100 -> SL 98.
        expect(engine['activeTrade']?.stopLossPrice).toBe(98);

        // Tick 2: Price drops to 97 (below SL 98)
        mockTime.setNow(now + 60000);
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([buyCandle, slCandle]);
        await engine.tick('BTC/USDT', '1m');

        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({ side: 'SELL' }));
        expect(engine['activeTrade']).toBeNull();
    });

    it('should close existing position on opposite signal', async () => {
        config.CLOSE_ON_OPPOSITE_SIGNAL = true;
        config.ALLOW_MULTIPLE_POSITIONS = false;
        const engine = createEngine();

        jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({ action: 'BUY', symbol: 'BTC/USDT' })
            .mockResolvedValueOnce({ action: 'SELL', symbol: 'BTC/USDT' });

        const now = 1700000000000;
        mockTime.setNow(now);
        const candle1 = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now };
        const candle2 = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now + 60000 };

        const placeOrderSpy = jest.spyOn(mockExchange, 'placeOrder');

        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle1]);
        await engine.tick('BTC/USDT', '1m');

        mockTime.setNow(now + 60000);
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle1, candle2]);
        await engine.tick('BTC/USDT', '1m');

        expect(placeOrderSpy).toHaveBeenCalledTimes(3);
    });

    it('should allow multiple positions when enabled', async () => {
        config.ALLOW_MULTIPLE_POSITIONS = true;
        config.MAX_OPEN_TRADES = 5;
        const engine = createEngine();

        jest.spyOn(engine['strategy'], 'update').mockResolvedValue({ action: 'BUY', symbol: 'BTC/USDT' });

        const now = 1700000000000;
        mockTime.setNow(now);
        const candle1 = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now };
        const candle2 = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now + 60000 };

        const placeOrderSpy = jest.spyOn(mockExchange, 'placeOrder');

        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle1]);
        await engine.tick('BTC/USDT', '1m');

        mockTime.setNow(now + 60000);
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle1, candle2]);
        await engine.tick('BTC/USDT', '1m');

        expect(placeOrderSpy).toHaveBeenCalledTimes(2);
    });

    it('should force close positions when forceClose is true', async () => {
        config.ALLOW_MULTIPLE_POSITIONS = false;
        const engine = createEngine();
        jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({ action: 'SELL', symbol: 'BTC/USDT', forceClose: true });

        const now = 1700000000000;
        mockTime.setNow(now);

        const existingTrade: any = {
            id: 't1', symbol: 'BTC/USDT', side: 'BUY', quantity: 1, price: 100, status: 'OPEN', timestamp: now - 60000, strategyName: 'MOCK'
        };
        await mockStore.saveTrade(existingTrade);

        const placeOrderSpy = jest.spyOn(mockExchange, 'placeOrder');
        const candle = { symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: now };
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle]);

        await engine.tick('BTC/USDT', '1m');

        // Should close (SELL) and open (SELL)
        expect(placeOrderSpy).toHaveBeenCalledTimes(2);
    });
});
