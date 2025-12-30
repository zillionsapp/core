import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { ichimokuCloudStrategy, Action } from 'indicatorts';

export class IchimokuCloudStrategy extends BaseLibraryStrategy {
    name = 'ICHIMOKU';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            short: config.short || 9,
            medium: config.medium || 26,
            long: config.long || 52,
            close: config.close || 26
        };
    }

    protected getActions(asset: any): Action[] {
        return ichimokuCloudStrategy(asset, this.config);
    }
}
