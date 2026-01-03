import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { macdStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class MacdStrategy extends BaseLibraryStrategy {
    name = 'MACD';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            fast: config.fast || defaults.fast || 12,
            slow: config.slow || defaults.slow || 26,
            signal: config.signal || defaults.signal || 9
        };
    }

    protected getActions(asset: any): Action[] {
        return macdStrategy(asset, this.config);
    }
}
