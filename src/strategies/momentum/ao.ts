import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { aoStrategy, Action } from 'indicatorts';

export class AoStrategy extends BaseLibraryStrategy {
    name = 'AO';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            fast: config.fast || 5,
            slow: config.slow || 34
        };
    }

    protected getActions(asset: any): Action[] {
        return aoStrategy(asset, this.config);
    }
}
