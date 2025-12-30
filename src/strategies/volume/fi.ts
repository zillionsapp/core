import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { fiStrategy, Action } from 'indicatorts';

export class FiStrategy extends BaseLibraryStrategy {
    name = 'FI';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 13
        };
    }

    protected getActions(asset: any): Action[] {
        return fiStrategy(asset, this.config);
    }
}
