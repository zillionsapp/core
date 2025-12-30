import { StrategyManager } from '../../src/core/strategy.manager';
import { IStrategy } from '../../src/interfaces/strategy.interface';

describe('StrategyManager', () => {
    it('should list available strategies', () => {
        const strategies = StrategyManager.getAvailableStrategies();
        expect(strategies).toContain('MACD');
    });

    it('should load a valid strategy', () => {
        const strategy = StrategyManager.getStrategy('MACD');
        expect(strategy).toBeDefined();
        expect(strategy.name).toBe('MACD');
    });

    it('should throw on invalid strategy', () => {
        expect(() => StrategyManager.getStrategy('INVALID_NAME')).toThrow();
    });
});
