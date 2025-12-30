import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { willRStrategy, Action } from 'indicatorts';

export class WillRStrategy extends BaseLibraryStrategy {
    name = 'WILLR';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return willRStrategy(asset, this.config);
    }
}
