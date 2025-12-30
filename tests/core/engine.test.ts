import { BotEngine } from '../../src/core/engine';
import { config } from '../../src/config/env';

// Mocking dependencies to control flow if needed, 
// strictly here we do a "Blackbox" integration test on the engine loop
// effectively running it for a short time.

describe('BotEngine Integration', () => {
    let engine: BotEngine;

    beforeEach(() => {
        engine = new BotEngine(config.STRATEGY_NAME);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should instantiate correctly', () => {
        expect(engine).toBeDefined();
    });

    // Since runLoop is infinite and involves delays, it's hard to unit test directly 
    // without mocking timers or refactoring the loop to be tick-based.
    // For integration, we trust the BacktestRunner logic more for "Full Flow".
    // Here we just check if it stops without error.

    it('should start and stop gracefully', async () => {
        // We mock the runLoop or start method to avoid infinite loop hanging the test
        const runLoopSpy = jest.spyOn(engine as any, 'runLoop').mockImplementation(async () => { });

        await engine.start('BTC/USDT', '1m');
        expect(runLoopSpy).toHaveBeenCalledWith('BTC/USDT', '1m');

        await engine.stop();
    });

    it('should execute a single tick successfully', async () => {
        // This test simulates the Serverless / Vercel invocation
        const tickSpy = jest.spyOn(engine, 'tick');

        await engine.tick('BTC/USDT', '1m');

        expect(tickSpy).toHaveBeenCalledWith('BTC/USDT', '1m');
    }, 30000);

    it('should trigger Stop Loss when price drops', async () => {
        // 1. Setup: Mock Strategy to return BUY
        const strategySpy = jest.spyOn(engine['strategy'], 'update').mockResolvedValue({
            action: 'BUY',
            symbol: 'BTC/USDT'
        });

        // 2. Setup: Spy on Exchange Data Provider methods (bypassing fetch)
        const getCandlesSpy = jest.spyOn(engine['exchange'], 'getCandles')
            .mockResolvedValueOnce([{
                symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: Date.now()
            }]) // Tick 1: Signal Generation
            .mockResolvedValueOnce([{
                symbol: 'BTC/USDT', interval: '1m', open: 90, high: 90, low: 90, close: 90, volume: 100, startTime: Date.now()
            }]); // Tick 2: Stop Loss Check (Price 90 < 95)

        const getTickerSpy = jest.spyOn(engine['exchange'], 'getTicker')
            .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 100, timestamp: Date.now() }) // Tick 1: Risk Check
            .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 100, timestamp: Date.now() }) // Tick 1: Execution
            .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 90, timestamp: Date.now() }); // Tick 2: Execution (Sell at 90)

        // Tick 1: BUY
        await engine.tick('BTC/USDT', '1m');
        expect(engine['activeTrade']).toBeDefined();
        expect(engine['activeTrade']?.stopLossPrice).toBe(95); // 100 * 0.95

        // Tick 2: STOP LOSS CHECK
        const placeOrderSpy = jest.spyOn(engine['exchange'], 'placeOrder');
        await engine.tick('BTC/USDT', '1m');

        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL'
        }));
        expect(engine['activeTrade']).toBeNull();
    });
});
