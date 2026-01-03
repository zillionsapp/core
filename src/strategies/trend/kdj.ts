import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { kdjStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class KdjStrategy extends BaseLibraryStrategy {
    name = 'KDJ';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            rPeriod: config.rPeriod || defaults.rPeriod || 9,
            kPeriod: config.kPeriod || defaults.kPeriod || 3,
            dPeriod: config.dPeriod || defaults.dPeriod || 3
        };
    }

    protected getActions(asset: any): Action[] {
        return kdjStrategy(asset, this.config);
    }
}
