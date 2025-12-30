import { IStrategy, StrategyConfig } from '../interfaces/strategy.interface';
import { Candle, Signal } from '../core/types';
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
