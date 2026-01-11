import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { Candle, Signal, Trade } from '../core/types';
import { Action } from 'indicatorts';
export declare abstract class BaseLibraryStrategy implements IStrategy {
    abstract name: string;
    protected history: Candle[];
    protected maxHistory: number;
    init(config: StrategyConfig): void;
    protected abstract onInit(config: StrategyConfig): void;
    update(candle: Candle, currentPrice?: number): Promise<Signal | null>;
    protected abstract getActions(asset: any): Action[];
    protected toAsset(history: Candle[]): any;
}
/**
 * Example custom strategy demonstrating advanced ST/TP logic
 * This shows how developers can implement their own exit strategies
 */
export declare abstract class BaseCustomStrategy implements IStrategy {
    abstract name: string;
    protected openPositions: Map<string, Trade>;
    init(config: StrategyConfig): void;
    update(candle: Candle, currentPrice?: number): Promise<Signal | null>;
    /**
     * Example implementation of custom exit logic
     * This demonstrates various exit strategies developers can implement
     */
    checkExit(trade: Trade, candle: Candle): Promise<'HOLD' | 'CLOSE' | {
        action: 'UPDATE_SL' | 'UPDATE_TP' | 'PARTIAL_CLOSE';
        quantity?: number;
        newPrice?: number;
    }>;
    onPositionOpened(trade: Trade): Promise<void>;
    onPositionClosed(trade: Trade): Promise<void>;
    protected getRecentCandles(symbol: string, count: number): Candle[];
    protected calculateVolatility(symbol: string): number;
}
