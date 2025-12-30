import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { typpriceStrategy, Action } from 'indicatorts';

export class TypPriceStrategy extends BaseLibraryStrategy {
    name = 'TYPPRICE';

    protected onInit(config: StrategyConfig): void {
    }

    protected getActions(asset: any): Action[] {
        return typpriceStrategy(asset);
    }
}
