import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { stochStrategy, Action } from 'indicatorts';

export class StochStrategy extends BaseLibraryStrategy {
    name = 'STOCH';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            kPeriod: config.kPeriod || 14,
            dPeriod: config.dPeriod || 3
        };
    }

    protected getActions(asset: any): Action[] {
        return stochStrategy(asset, this.config);
    }
}
