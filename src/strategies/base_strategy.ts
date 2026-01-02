import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { Candle, Signal, Trade } from '../core/types';
import { Action } from 'indicatorts';

export abstract class BaseLibraryStrategy implements IStrategy {
    abstract name: string;
    protected history: Candle[] = [];
    protected maxHistory: number = 500;

    init(config: StrategyConfig): void {
        if (config.maxHistory) this.maxHistory = config.maxHistory;
        this.onInit(config);
    }

    protected abstract onInit(config: StrategyConfig): void;

    async update(candle: Candle): Promise<Signal | null> {
        this.history.push(candle);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        const asset = this.toAsset(this.history);
        const actions = this.getActions(asset);
        const lastAction = actions[actions.length - 1];

        let actionStr: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        if (lastAction === Action.BUY) actionStr = 'BUY';
        if (lastAction === Action.SELL) actionStr = 'SELL';

        if (actionStr !== 'HOLD') {
            return {
                action: actionStr,
                symbol: candle.symbol,
                metadata: { strategy: this.name, price: candle.close }
            };
        }

        return null;
    }

    protected abstract getActions(asset: any): Action[];

    protected toAsset(history: Candle[]): any {
        return {
            dates: history.map(c => new Date(c.startTime)),
            openings: history.map(c => c.open),
            highs: history.map(c => c.high),
            lows: history.map(c => c.low),
            closings: history.map(c => c.close),
            volumes: history.map(c => c.volume)
        };
    }
}

/**
 * Example custom strategy demonstrating advanced ST/TP logic
 * This shows how developers can implement their own exit strategies
 */
export abstract class BaseCustomStrategy implements IStrategy {
    abstract name: string;
    protected openPositions: Map<string, Trade> = new Map();

    init(config: StrategyConfig): void {
        // Initialize custom strategy
    }

    async update(candle: Candle): Promise<Signal | null> {
        // Implement your entry logic here
        // Return signals with custom SL/TP or use checkExit for dynamic exits
        return null;
    }

    /**
     * Example implementation of custom exit logic
     * This demonstrates various exit strategies developers can implement
     */
    async checkExit(trade: Trade, candle: Candle): Promise<'HOLD' | 'CLOSE' | { action: 'UPDATE_SL' | 'UPDATE_TP' | 'PARTIAL_CLOSE', quantity?: number, newPrice?: number }> {
        const currentPrice = candle.close;
        const entryPrice = trade.price;
        const profitPercent = trade.side === 'BUY'
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;

        // Example 1: Exit after 3 consecutive red candles (for long positions)
        if (trade.side === 'BUY') {
            const recentCandles = this.getRecentCandles(trade.symbol, 3);
            const consecutiveReds = recentCandles.filter(c => c.close < c.open).length;

            if (consecutiveReds >= 3) {
                return 'CLOSE'; // Exit due to bearish momentum
            }
        }

        // Example 2: Dynamic trailing stop based on volatility
        const volatility = this.calculateVolatility(trade.symbol);
        if (profitPercent > 5) { // Only trail if we have profit
            const trailDistance = Math.max(2, volatility * 2); // At least 2%, or 2x volatility
            const newStopLoss = trade.side === 'BUY'
                ? currentPrice * (1 - trailDistance / 100)
                : currentPrice * (1 + trailDistance / 100);

            // Only update if the new SL is better than current
            if (trade.stopLossPrice &&
                ((trade.side === 'BUY' && newStopLoss > trade.stopLossPrice) ||
                 (trade.side === 'SELL' && newStopLoss < trade.stopLossPrice))) {
                return { action: 'UPDATE_SL', newPrice: newStopLoss };
            }
        }

        // Example 3: Time-based exit (exit after 24 hours)
        const positionAge = Date.now() - trade.timestamp;
        const maxHoldTime = 24 * 60 * 60 * 1000; // 24 hours
        if (positionAge > maxHoldTime) {
            return 'CLOSE'; // Exit due to time limit
        }

        // Example 4: Profit taking at multiple levels
        if (profitPercent >= 10) {
            return { action: 'PARTIAL_CLOSE', quantity: trade.quantity * 0.5 }; // Take half profits
        }

        return 'HOLD'; // Continue holding
    }

    async onPositionOpened(trade: Trade): Promise<void> {
        this.openPositions.set(trade.id, trade);
        // Custom logic when position opens (e.g., set up tracking, alerts, etc.)
    }

    async onPositionClosed(trade: Trade): Promise<void> {
        this.openPositions.delete(trade.id);
        // Custom logic when position closes (e.g., performance analysis, logging, etc.)
    }

    // Helper methods for custom logic
    protected getRecentCandles(symbol: string, count: number): Candle[] {
        // Implement logic to get recent candles for the symbol
        // This would need access to candle history
        return [];
    }

    protected calculateVolatility(symbol: string): number {
        // Implement volatility calculation (e.g., ATR, standard deviation)
        // Return percentage
        return 1.5; // Example: 1.5% volatility
    }
}
