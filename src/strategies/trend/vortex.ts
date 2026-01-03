import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { vortexStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class VortexStrategy extends BaseLibraryStrategy {
    name = 'VORTEX';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            period: config.period || defaults.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return vortexStrategy(asset, this.config);
    }
}
