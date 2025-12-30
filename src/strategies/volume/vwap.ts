import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { vwapStrategy, Action } from 'indicatorts';

export class VwapStrategy extends BaseLibraryStrategy {
    name = 'VWAP';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return vwapStrategy(asset, this.config);
    }
}
