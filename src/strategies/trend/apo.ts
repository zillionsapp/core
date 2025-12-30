import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { apoStrategy, Action } from 'indicatorts';

export class ApoStrategy extends BaseLibraryStrategy {
    name = 'APO';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            fast: config.fast || 14,
            slow: config.slow || 30
        };
    }

    protected getActions(asset: any): Action[] {
        return apoStrategy(asset, this.config);
    }
}
