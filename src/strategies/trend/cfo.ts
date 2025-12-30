import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { cfoStrategy, Action } from 'indicatorts';

export class CfoStrategy extends BaseLibraryStrategy {
    name = 'CFO';

    protected onInit(config: StrategyConfig): void {
    }

    protected getActions(asset: any): Action[] {
        return cfoStrategy(asset);
    }
}
