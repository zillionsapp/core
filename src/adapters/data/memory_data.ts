import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Ticker } from '../../core/types';

export class MemoryDataProvider implements IMarketDataProvider {
    name = 'MEMORY';
    private candles: Candle[] = [];

    constructor(candles: Candle[]) {
        this.candles = candles;
    }

    async getCandles(symbol: string, interval: string, limit: number = 100, endTime?: number): Promise<Candle[]> {
        let filtered = this.candles.filter(c => c.symbol === symbol && c.interval === interval);

        if (endTime) {
            filtered = filtered.filter(c => (c.startTime || 0) <= endTime);
        }

        return filtered.slice(-limit);
    }

    async getTicker(symbol: string): Promise<Ticker> {
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
    setCandles(candles: Candle[]) {
        this.candles = candles;
    }
}
