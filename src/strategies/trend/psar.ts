import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { psarStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class PsarStrategy extends BaseLibraryStrategy {
    name = 'PSAR';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            step: config.step || defaults.step || 0.02,
            max: config.max || defaults.max || 0.2
        };
    }

    protected getActions(asset: any): Action[] {
        return psarStrategy(asset, this.config);
    }
}
