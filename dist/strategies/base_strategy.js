"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseCustomStrategy = exports.BaseLibraryStrategy = void 0;
const indicatorts_1 = require("indicatorts");
class BaseLibraryStrategy {
    constructor() {
        this.history = [];
        this.maxHistory = 500;
    }
    init(config) {
        if (config.maxHistory)
            this.maxHistory = config.maxHistory;
        this.onInit(config);
    }
    async update(candle, currentPrice) {
        this.history.push(candle);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        const asset = this.toAsset(this.history);
        const actions = this.getActions(asset);
        const lastAction = actions[actions.length - 1];
        let actionStr = 'HOLD';
        if (lastAction === indicatorts_1.Action.BUY)
            actionStr = 'BUY';
        if (lastAction === indicatorts_1.Action.SELL)
            actionStr = 'SELL';
        if (actionStr !== 'HOLD') {
            return {
                action: actionStr,
                symbol: candle.symbol,
                metadata: { strategy: this.name, price: candle.close }
            };
        }
        return null;
    }
    toAsset(history) {
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
exports.BaseLibraryStrategy = BaseLibraryStrategy;
/**
 * Example custom strategy demonstrating advanced ST/TP logic
 * This shows how developers can implement their own exit strategies
 */
class BaseCustomStrategy {
    constructor() {
        this.openPositions = new Map();
    }
    init(config) {
        // Initialize custom strategy
    }
    async update(candle, currentPrice) {
        // Implement your entry logic here
        // Return signals with custom SL/TP or use checkExit for dynamic exits
        return null;
    }
    /**
     * Example implementation of custom exit logic
     * This demonstrates various exit strategies developers can implement
     */
    async checkExit(trade, candle) {
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
    async onPositionOpened(trade) {
        this.openPositions.set(trade.id, trade);
        // Custom logic when position opens (e.g., set up tracking, alerts, etc.)
    }
    async onPositionClosed(trade) {
        this.openPositions.delete(trade.id);
        // Custom logic when position closes (e.g., performance analysis, logging, etc.)
    }
    // Helper methods for custom logic
    getRecentCandles(symbol, count) {
        // Implement logic to get recent candles for the symbol
        // This would need access to candle history
        return [];
    }
    calculateVolatility(symbol) {
        // Implement volatility calculation (e.g., ATR, standard deviation)
        // Return percentage
        return 1.5; // Example: 1.5% volatility
    }
}
exports.BaseCustomStrategy = BaseCustomStrategy;
