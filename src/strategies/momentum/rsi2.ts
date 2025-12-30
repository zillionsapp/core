import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { rsi2Strategy, Action } from 'indicatorts';

export class Rsi2Strategy extends BaseLibraryStrategy {
    name = 'RSI2';

    protected onInit(config: StrategyConfig): void {
    }

    protected getActions(asset: any): Action[] {
        return rsi2Strategy(asset);
    }
}
