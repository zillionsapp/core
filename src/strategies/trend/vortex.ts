import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { vortexStrategy, Action } from 'indicatorts';

export class VortexStrategy extends BaseLibraryStrategy {
    name = 'VORTEX';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return vortexStrategy(asset, this.config);
    }
}
