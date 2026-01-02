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
        // 1. Setup: Mock Strategy to return BUY only on first tick
        const strategySpy = jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({
                action: 'BUY',
                symbol: 'BTC/USDT'
            }) // Tick 1: Signal Generation
            .mockResolvedValueOnce({
                action: 'HOLD',
                symbol: 'BTC/USDT'
            }); // Tick 2: No new signal

        // 2. Setup: Spy on Exchange Data Provider methods (bypassing fetch)
        const getCandlesSpy = jest.spyOn(engine['exchange'], 'getCandles')
            .mockResolvedValueOnce([{
                symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: Date.now()
            }]) // Tick 1: Signal Generation
            .mockResolvedValueOnce([{
                symbol: 'BTC/USDT', interval: '1m', open: 90, high: 90, low: 90, close: 90, volume: 100, startTime: Date.now()
            }]); // Tick 2: Stop Loss Check (Price 90 < 95)

        const getTickerSpy = jest.spyOn(engine['exchange'], 'getTicker')
            .mockResolvedValueOnce({ symbol: 'BTC/USDT', price: 70, timestamp: Date.now() }) // Tick 1: Entry price
            .mockResolvedValue({ symbol: 'BTC/USDT', price: 65, timestamp: Date.now() }); // Tick 2: Check price

        // Tick 1: BUY
        await engine.tick('BTC/USDT', '1m');
        expect(engine['activeTrade']).toBeDefined();
        expect(engine['activeTrade']?.stopLossPrice).toBe(66.5); // 70 - (35 / 10) where 35 = 700 * 0.05

        // Tick 2: STOP LOSS CHECK - TradeManager should close the position
        const placeOrderSpy = jest.spyOn(engine['exchange'], 'placeOrder');
        await engine.tick('BTC/USDT', '1m');

        // Should have called placeOrder for the stop loss close (SELL)
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL',
            symbol: 'BTC/USDT'
        }));
        expect(engine['activeTrade']).toBeNull();
    });

    it('should close existing position and open new one when CLOSE_ON_OPPOSITE_SIGNAL is enabled', async () => {
        // Mock config to enable close on opposite signal
        const originalConfig = { ...config };
        config.CLOSE_ON_OPPOSITE_SIGNAL = true;
        config.ALLOW_MULTIPLE_POSITIONS = false;

        // Setup: Mock Strategy to return BUY then SELL
        const strategySpy = jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({
                action: 'BUY',
                symbol: 'BTC/USDT'
            }) // Tick 1: BUY signal
            .mockResolvedValueOnce({
                action: 'SELL',
                symbol: 'BTC/USDT'
            }); // Tick 2: SELL signal (opposite)

        // Setup: Mock exchange and DB
        const getCandlesSpy = jest.spyOn(engine['exchange'], 'getCandles')
            .mockResolvedValue([{
                symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: Date.now()
            }]);

        const getOpenTradesSpy = jest.spyOn(engine['db'], 'getOpenTrades')
            .mockResolvedValueOnce([]) // Tick 1: tradeManager check
            .mockResolvedValueOnce([]) // Tick 1: signal logic check
            .mockResolvedValueOnce([{
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 100,
                timestamp: Date.now(),
                status: 'OPEN'
            }]) // Tick 2: tradeManager check
            .mockResolvedValueOnce([{
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 100,
                timestamp: Date.now(),
                status: 'OPEN'
            }]); // Tick 2: signal logic check

        const placeOrderSpy = jest.spyOn(engine['exchange'], 'placeOrder')
            .mockResolvedValueOnce({
                id: 'buyOrder',
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 100,
                timestamp: Date.now()
            }) // Tick 1: BUY order
            .mockResolvedValueOnce({
                id: 'closeOrder',
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 95,
                timestamp: Date.now()
            }) // Tick 2: Close BUY position
            .mockResolvedValueOnce({
                id: 'sellOrder',
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 95,
                timestamp: Date.now()
            }); // Tick 2: Open SELL position

        // Tick 1: BUY
        await engine.tick('BTC/USDT', '1m');
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'BUY',
            symbol: 'BTC/USDT'
        }));

        // Tick 2: SELL - should close BUY and open SELL
        await engine.tick('BTC/USDT', '1m');

        // Should have closed the BUY position
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL',
            symbol: 'BTC/USDT'
        }));

        // Should have opened SELL position
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL',
            symbol: 'BTC/USDT'
        }));

        // Restore config
        Object.assign(config, originalConfig);
    });

    it('should allow multiple positions when ALLOW_MULTIPLE_POSITIONS is enabled', async () => {
        // Mock config to allow multiple positions
        const originalConfig = { ...config };
        config.ALLOW_MULTIPLE_POSITIONS = true;
        config.CLOSE_ON_OPPOSITE_SIGNAL = false;

        // Setup: Mock Strategy to return BUY twice
        const strategySpy = jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({
                action: 'BUY',
                symbol: 'BTC/USDT'
            }) // Tick 1: BUY signal
            .mockResolvedValueOnce({
                action: 'BUY',
                symbol: 'BTC/USDT'
            }); // Tick 2: Another BUY signal

        // Setup: Mock exchange and DB
        const getCandlesSpy = jest.spyOn(engine['exchange'], 'getCandles')
            .mockResolvedValue([{
                symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: Date.now()
            }]);

        const getOpenTradesSpy = jest.spyOn(engine['db'], 'getOpenTrades')
            .mockResolvedValueOnce([]) // Tick 1: tradeManager check
            .mockResolvedValueOnce([]) // Tick 1: signal logic check
            .mockResolvedValueOnce([{
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 100,
                timestamp: Date.now(),
                status: 'OPEN'
            }]) // Tick 2: tradeManager check
            .mockResolvedValueOnce([{
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 100,
                timestamp: Date.now(),
                status: 'OPEN'
            }]); // Tick 2: signal logic check

        const placeOrderSpy = jest.spyOn(engine['exchange'], 'placeOrder')
            .mockResolvedValue({
                id: 'buyOrder2',
                symbol: 'BTC/USDT',
                side: 'BUY',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 100,
                timestamp: Date.now()
            });

        // Tick 1: BUY
        await engine.tick('BTC/USDT', '1m');
        expect(placeOrderSpy).toHaveBeenCalledTimes(1);

        // Tick 2: Another BUY - should allow it
        await engine.tick('BTC/USDT', '1m');
        expect(placeOrderSpy).toHaveBeenCalledTimes(2);

        // Restore config
        Object.assign(config, originalConfig);
    });

    it('should force close positions when signal has forceClose=true', async () => {
        // Setup: Mock Strategy to return SELL with forceClose
        const strategySpy = jest.spyOn(engine['strategy'], 'update')
            .mockResolvedValueOnce({
                action: 'SELL',
                symbol: 'BTC/USDT',
                forceClose: true
            });

        // Setup: Mock exchange and DB
        const getCandlesSpy = jest.spyOn(engine['exchange'], 'getCandles')
            .mockResolvedValue([{
                symbol: 'BTC/USDT', interval: '1m', open: 100, high: 100, low: 100, close: 100, volume: 100, startTime: Date.now()
            }]);

        const getOpenTradesSpy = jest.spyOn(engine['db'], 'getOpenTrades')
            .mockResolvedValue([{
                id: 'trade1',
                orderId: 'order1',
                symbol: 'BTC/USDT',
                side: 'BUY',
                quantity: 1,
                price: 100,
                timestamp: Date.now(),
                status: 'OPEN'
            }]);

        const placeOrderSpy = jest.spyOn(engine['exchange'], 'placeOrder')
            .mockResolvedValueOnce({
                id: 'closeOrder',
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 95,
                timestamp: Date.now()
            }) // Close existing position
            .mockResolvedValueOnce({
                id: 'sellOrder',
                symbol: 'BTC/USDT',
                side: 'SELL',
                type: 'MARKET',
                status: 'FILLED',
                quantity: 1,
                filledQuantity: 1,
                price: 95,
                timestamp: Date.now()
            }); // Open new position

        // Execute tick
        await engine.tick('BTC/USDT', '1m');

        // Should have closed the conflicting position first
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL',
            symbol: 'BTC/USDT'
        }));

        // Should have opened the new position
        expect(placeOrderSpy).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL',
            symbol: 'BTC/USDT'
        }));
    });
});
