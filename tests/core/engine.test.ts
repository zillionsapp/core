import { BotEngine } from '../../src/core/engine';
import { PaperExchange } from '../../src/adapters/exchange/paper';

// Mocking dependencies to control flow if needed, 
// strictly here we do a "Blackbox" integration test on the engine loop
// effectively running it for a short time.

describe('BotEngine Integration', () => {
    let engine: BotEngine;

    beforeEach(() => {
        engine = new BotEngine('SMA_CROSSOVER');
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
});
