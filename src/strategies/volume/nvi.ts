import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { nviStrategy, Action } from 'indicatorts';

export class NviStrategy extends BaseLibraryStrategy {
    name = 'NVI';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            start: config.start || 1000,
            period: config.period || 255
        };
    }

    protected getActions(asset: any): Action[] {
        return nviStrategy(asset, this.config);
    }
}
