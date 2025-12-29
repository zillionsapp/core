import { Candle, Ticker } from '../core/types';

export interface IMarketDataProvider {
    name: string;
    getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
}
