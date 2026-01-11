import { Candle, Signal, Trade } from '../core/types';
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
     * @param candle The latest completed candle
     * @param currentPrice Optional current market price for real-time monitoring
     */
    update(candle: Candle, currentPrice?: number): Promise<Signal | null>;
    /**
     * Optional: Called for each open position managed by this strategy
     * Allows custom exit logic beyond static SL/TP
     */
    checkExit?(trade: Trade, candle: Candle): Promise<'HOLD' | 'CLOSE' | {
        action: 'UPDATE_SL' | 'UPDATE_TP' | 'PARTIAL_CLOSE';
        quantity?: number;
        newPrice?: number;
    }>;
    /**
     * Optional: Called when a position is opened for this strategy
     * Allows strategy to set up custom state or tracking
     */
    onPositionOpened?(trade: Trade): Promise<void>;
    /**
     * Optional: Called when a position is closed
     * Allows strategy to clean up state or analyze performance
     */
    onPositionClosed?(trade: Trade): Promise<void>;
}
