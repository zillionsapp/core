import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { aoStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class AoStrategy extends BaseLibraryStrategy {
    name = 'AO';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            fast: config.fast || defaults.fast || 5,
            slow: config.slow || defaults.slow || 34
        };
    }

    protected getActions(asset: any): Action[] {
        return aoStrategy(asset, this.config);
    }
}
