import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { bbStrategy, Action } from 'indicatorts';

export class BbStrategy extends BaseLibraryStrategy {
    name = 'BB';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 20
        };
    }

    protected getActions(asset: any): Action[] {
        return bbStrategy(asset, this.config);
    }
}
