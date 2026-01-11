"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryDataProvider = void 0;
class MemoryDataProvider {
    constructor(candles) {
        this.name = 'MEMORY';
        this.candles = [];
        this.tickers = new Map();
        this.candles = candles;
    }
    async getCandles(symbol, interval, limit = 100, endTime) {
        let filtered = this.candles.filter(c => c.symbol === symbol && c.interval === interval);
        if (endTime) {
            filtered = filtered.filter(c => (c.startTime || 0) <= endTime);
        }
        return filtered.slice(-limit);
    }
    async getTicker(symbol) {
        // Check explicit tickers first
        const mockTicker = this.tickers.get(symbol);
        if (mockTicker)
            return mockTicker;
        const symbolCandles = this.candles.filter(c => c.symbol === symbol);
        if (symbolCandles.length === 0) {
            throw new Error(`No candles found for symbol ${symbol} in memory`);
        }
        // Use the last candle as the "current" price if no endTime is provided
        // In replay, we should probably have a way to get ticker at current simulation time
        const lastCandle = symbolCandles[symbolCandles.length - 1];
        return {
            symbol,
            price: lastCandle.close,
            timestamp: lastCandle.startTime || Date.now()
        };
    }
    /**
     * Set the current view of the market by providing the candles up to now
     */
    setCandles(candles) {
        this.candles = candles;
    }
    setTicker(symbol, ticker) {
        this.tickers.set(symbol, ticker);
    }
}
exports.MemoryDataProvider = MemoryDataProvider;
