import { StrategyManager } from '../../src/core/strategy.manager';
import { IStrategy } from '../../src/interfaces/strategy.interface';

describe('StrategyManager', () => {
    it('should list available strategies', () => {
        const strategies = StrategyManager.getAvailableStrategies();
        expect(strategies).toContain('SMA_CROSSOVER');
    });

    it('should load a valid strategy', () => {
        const strategy = StrategyManager.getStrategy('SMA_CROSSOVER');
        expect(strategy).toBeDefined();
        expect(strategy.name).toBe('SMA_CROSSOVER');
    });

    it('should throw on invalid strategy', () => {
        expect(() => StrategyManager.getStrategy('INVALID_NAME')).toThrow();
    });
});
