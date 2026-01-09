import { IMarketDataProvider } from '../../interfaces/market_data.interface';
import { Candle, Ticker } from '../../core/types';
import { logger } from '../../core/logger';

export class BinancePublicData implements IMarketDataProvider {
    name = 'BINANCE_PUBLIC';
    private baseUrl = 'https://api.binance.com/api/v3';

    async getCandles(symbol: string, interval: string, limit: number = 100, endTime?: number): Promise<Candle[]> {
        try {
            // Binance requires symbols without '/', e.g. BTCUSDT
            const parsedSymbol = symbol.replace('/', '');
            const url = new URL(`${this.baseUrl}/klines`);
            url.searchParams.append('symbol', parsedSymbol);
            url.searchParams.append('interval', interval);
            url.searchParams.append('limit', limit.toString());
            if (endTime) {
                url.searchParams.append('endTime', endTime.toString());
            }

            const response = await fetch(url.toString());
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Binance API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const rawData = await response.json();

            // Map Binance format [time, open, high, low, close, volume, ...] to Candle
            return rawData.map((d: any) => ({
                symbol,
                interval,
                startTime: d[0],
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5])
            }));

        } catch (error) {
            logger.error('[BinancePublicData] Failed to fetch candles:', error);
            return [];
        }
    }

    async getTicker(symbol: string): Promise<Ticker> {
        if (!symbol || !symbol.trim()) {
            throw new Error('Symbol parameter cannot be empty');
        }

        try {
            const parsedSymbol = symbol.replace('/', '');
            const url = new URL(`${this.baseUrl}/ticker/price`);
            url.searchParams.append('symbol', parsedSymbol);

            const response = await fetch(url.toString());
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Binance API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            const price = parseFloat(data.price);
            if (isNaN(price)) {
                console.error(`[BinancePublicData] Price format error. Price raw: '${data.price}'`);
            }
            return {
                symbol,
                price: price,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error('[BinancePublicData] Failed to fetch ticker:', error);
            // Fallback or throw? For safety, throw so we don't trade on bad data.
            throw error;
        }
    }
}
