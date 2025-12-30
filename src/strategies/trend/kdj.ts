import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { kdjStrategy, Action } from 'indicatorts';

export class KdjStrategy extends BaseLibraryStrategy {
    name = 'KDJ';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            rPeriod: config.rPeriod || 9,
            kPeriod: config.kPeriod || 3,
            dPeriod: config.dPeriod || 3
        };
    }

    protected getActions(asset: any): Action[] {
        return kdjStrategy(asset, this.config);
    }
}
