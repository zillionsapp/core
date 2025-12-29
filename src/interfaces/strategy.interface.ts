import { Candle, Signal } from '../core/types';

export interface StrategyConfig {
    [key: string]: any;
}

export interface IStrategy {
    name: string;

    /**
     * Initialize the strategy with configuration
     */
    init(config: StrategyConfig): void;

    /**
     * Called on every new candle update
     */
    update(candle: Candle): Promise<Signal | null>;
}
