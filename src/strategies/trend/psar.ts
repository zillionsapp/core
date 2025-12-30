import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { psarStrategy, Action } from 'indicatorts';

export class PsarStrategy extends BaseLibraryStrategy {
    name = 'PSAR';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            step: config.step || 0.02,
            max: config.max || 0.2
        };
    }

    protected getActions(asset: any): Action[] {
        return psarStrategy(asset, this.config);
    }
}
