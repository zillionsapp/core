import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { Candle, Signal } from '../core/types';
import { sma } from 'indicatorts';

export class SmaCrossoverStrategy implements IStrategy {
    name = 'SMA_CROSSOVER';
    private shortPeriod: number = 9;
    private longPeriod: number = 21;
    private prices: number[] = [];

    init(config: StrategyConfig): void {
        if (config.shortPeriod) this.shortPeriod = config.shortPeriod;
        if (config.longPeriod) this.longPeriod = config.longPeriod;
        console.log(`[SmaCrossoverStrategy] Initialized with Short: ${this.shortPeriod}, Long: ${this.longPeriod}`);
    }

    async update(candle: Candle): Promise<Signal | null> {
        this.prices.push(candle.close);

        // Keep array size manageable
        if (this.prices.length > this.longPeriod + 100) {
            this.prices.shift();
        }

        if (this.prices.length < this.longPeriod) {
            return null;
        }

        const smaShort = sma(this.prices, { period: this.shortPeriod });
        const smaLong = sma(this.prices, { period: this.longPeriod });

        const lastShort = smaShort[smaShort.length - 1];
        const prevShort = smaShort[smaShort.length - 2];
        const lastLong = smaLong[smaLong.length - 1];
        const prevLong = smaLong[smaLong.length - 2];

        if (!lastShort || !prevShort || !lastLong || !prevLong) return null;

        // Golden Cross
        if (prevShort <= prevLong && lastShort > lastLong) {
            return {
                action: 'BUY',
                symbol: candle.symbol,
                metadata: { reason: 'Golden Cross', price: candle.close }
            };
        }

        // Death Cross
        if (prevShort >= prevLong && lastShort < lastLong) {
            return {
                action: 'SELL',
                symbol: candle.symbol,
                metadata: { reason: 'Death Cross', price: candle.close }
            };
        }

        return null;
    }
}
