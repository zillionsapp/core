import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { stochStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class StochStrategy extends BaseLibraryStrategy {
    name = 'STOCH';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            kPeriod: config.kPeriod || defaults.kPeriod || 14,
            dPeriod: config.dPeriod || defaults.dPeriod || 3
        };
    }

    protected getActions(asset: any): Action[] {
        return stochStrategy(asset, this.config);
    }
}
