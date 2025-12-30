import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { cmfStrategy, Action } from 'indicatorts';

export class CmfStrategy extends BaseLibraryStrategy {
    name = 'CMF';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 20
        };
    }

    protected getActions(asset: any): Action[] {
        return cmfStrategy(asset, this.config);
    }
}
