import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { abStrategy, Action } from 'indicatorts';

export class AbStrategy extends BaseLibraryStrategy {
    name = 'AB';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 20,
            multiplier: config.multiplier || 4
        };
    }

    protected getActions(asset: any): Action[] {
        return abStrategy(asset, this.config);
    }
}
