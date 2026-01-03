import { BotEngine } from '../../src/core/engine';
import { MockStore, MockTimeProvider } from '../test_mocks';
import { PaperExchange } from '../../src/adapters/exchange/paper';
import { MemoryDataProvider } from '../../src/adapters/data/memory_data';
import { StrategyManager } from '../../src/core/strategy.manager';
import { IStrategy } from '../../src/interfaces/strategy.interface';
import { Candle, Signal } from '../../src/core/types';

describe('BotEngine SDK Injection', () => {
    let mockStore: MockStore;
    let mockTime: MockTimeProvider;
    let mockExchange: PaperExchange;

    beforeEach(() => {
        mockStore = new MockStore();
        mockTime = new MockTimeProvider();
        mockExchange = new PaperExchange(new MemoryDataProvider([]), mockTime);
    });

    it('should initialize with a string strategy name', () => {
        const spy = jest.spyOn(StrategyManager, 'getStrategy').mockReturnValue({
            name: 'MACD',
            init: jest.fn(),
            update: jest.fn()
        } as any);

        const engine = new BotEngine('MACD', mockTime, mockExchange, mockStore);

        expect(spy).toHaveBeenCalledWith('MACD');
        expect(engine['strategy'].name).toBe('MACD');

        spy.mockRestore();
    });

    it('should initialize with a strategy instance (SDK usage)', async () => {
        const customStrat: IStrategy = {
            name: 'CustomSDK',
            init: jest.fn(),
            update: jest.fn().mockResolvedValue({ action: 'HOLD', symbol: 'BTC/USDT' } as Signal)
        };

        const engine = new BotEngine(customStrat, mockTime, mockExchange, mockStore);

        expect(engine['strategy']).toBe(customStrat);
        expect(engine['strategy'].name).toBe('CustomSDK');

        const candle: Candle = {
            symbol: 'BTC/USDT', interval: '1m', open: 100, high: 101, low: 99, close: 100.5, volume: 10, startTime: 12345
        };
        const signal = await engine['strategy'].update(candle);
        expect(signal?.action).toBe('HOLD');
    });

    it('should correctly handle tick with injected strategy', async () => {
        const customStrat: IStrategy = {
            name: 'CustomSDK',
            init: jest.fn(),
            update: jest.fn().mockResolvedValue({ action: 'BUY', symbol: 'BTC/USDT' } as Signal)
        };

        const engine = new BotEngine(customStrat, mockTime, mockExchange, mockStore);
        const placeOrderSpy = jest.spyOn(mockExchange, 'placeOrder');

        const candle: Candle = {
            symbol: 'BTC/USDT', interval: '1m', open: 100, high: 101, low: 99, close: 100.5, volume: 10, startTime: 12345
        };
        (mockExchange['dataProvider'] as MemoryDataProvider).setCandles([candle]);

        await engine.tick('BTC/USDT', '1m');

        expect(customStrat.update).toHaveBeenCalled();
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({ side: 'BUY' }));
    });
});
