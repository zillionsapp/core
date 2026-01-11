import { IStrategy } from '../interfaces/strategy.interface';
export declare class StrategyManager {
    private static strategies;
    static getStrategy(name: string): IStrategy;
    static getAvailableStrategies(): string[];
}
