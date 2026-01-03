import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { ichimokuCloudStrategy, Action } from 'indicatorts';
import { config as envConfig } from '../../config/env';
import { STRATEGY_DEFAULTS } from '../../config/strategy_defaults';

export class IchimokuCloudStrategy extends BaseLibraryStrategy {
    name = 'ICHIMOKU';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        const interval = envConfig.STRATEGY_INTERVAL;
        const defaults = STRATEGY_DEFAULTS[this.name]?.[interval] || {};

        this.config = {
            short: config.short || defaults.short || 9,
            medium: config.medium || defaults.medium || 26,
            long: config.long || defaults.long || 52,
            close: config.close || defaults.close || 26
        };
    }

    protected getActions(asset: any): Action[] {
        return ichimokuCloudStrategy(asset, this.config);
    }
}
