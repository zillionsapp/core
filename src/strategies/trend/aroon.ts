import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { aroonStrategy, Action } from 'indicatorts';

export class AroonStrategy extends BaseLibraryStrategy {
    name = 'AROON';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 25
        };
    }

    protected getActions(asset: any): Action[] {
        return aroonStrategy(asset, this.config);
    }
}
