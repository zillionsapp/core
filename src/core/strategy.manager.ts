import { IStrategy } from '../interfaces/strategy.interface';
import { SmaCrossoverStrategy } from '../strategies/sma_crossover';

export class StrategyManager {
    private static strategies: Map<string, any> = new Map([
        ['SMA_CROSSOVER', SmaCrossoverStrategy]
    ]);

    static getStrategy(name: string): IStrategy {
        const StrategyClass = this.strategies.get(name);
        if (!StrategyClass) {
            throw new Error(`Strategy not found: ${name}`);
        }
        return new StrategyClass();
    }

    static getAvailableStrategies(): string[] {
        return Array.from(this.strategies.keys());
    }
}
