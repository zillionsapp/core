import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { vwmaStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class VwmaStrategy extends BaseLibraryStrategy {
    name = 'VWMA';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            period: config.period || defaults.period || 20
        };
    }

    protected getActions(asset: any): Action[] {
        return vwmaStrategy(asset, this.config);
    }
}
