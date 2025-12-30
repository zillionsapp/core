import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { emvStrategy, Action } from 'indicatorts';

export class EmvStrategy extends BaseLibraryStrategy {
    name = 'EMV';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return emvStrategy(asset, this.config);
    }
}
