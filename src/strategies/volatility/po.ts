import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { poStrategy, Action } from 'indicatorts';

export class PoStrategy extends BaseLibraryStrategy {
    name = 'PO';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14,
            smooth: config.smooth || 3
        };
    }

    protected getActions(asset: any): Action[] {
        return poStrategy(asset, this.config);
    }
}
