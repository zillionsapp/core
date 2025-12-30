import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { vwmaStrategy, Action } from 'indicatorts';

export class VwmaStrategy extends BaseLibraryStrategy {
    name = 'VWMA';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 20
        };
    }

    protected getActions(asset: any): Action[] {
        return vwmaStrategy(asset, this.config);
    }
}
