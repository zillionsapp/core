import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { bopStrategy, Action } from 'indicatorts';

export class BopStrategy extends BaseLibraryStrategy {
    name = 'BOP';

    protected onInit(config: StrategyConfig): void {
        // No specific config for bopStrategy in docs
    }

    protected getActions(asset: any): Action[] {
        return bopStrategy(asset);
    }
}
