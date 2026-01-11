import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Ticker } from '../../core/types';
export declare class MemoryDataProvider implements IMarketDataProvider {
    name: string;
    private candles;
    private tickers;
    constructor(candles: Candle[]);
    getCandles(symbol: string, interval: string, limit?: number, endTime?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
    /**
     * Set the current view of the market by providing the candles up to now
     */
    setCandles(candles: Candle[]): void;
    setTicker(symbol: string, ticker: Ticker): void;
}
