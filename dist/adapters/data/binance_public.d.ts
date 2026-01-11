import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Ticker } from '../../core/types';
export declare class BinancePublicData implements IMarketDataProvider {
    name: string;
    private baseUrl;
    getCandles(symbol: string, interval: string, limit?: number, endTime?: number): Promise<Candle[]>;
    getTicker(symbol: string): Promise<Ticker>;
}
