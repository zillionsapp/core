import { Candle, Ticker } from '../core/types';
export interface IMarketDataProvider {
    name: string;
    getCandles(symbol: string, interval: string, limit?: number, endTime?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
}
