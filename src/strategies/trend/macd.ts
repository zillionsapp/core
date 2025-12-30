import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { macdStrategy, Action } from 'indicatorts';

export class MacdStrategy extends BaseLibraryStrategy {
    name = 'MACD';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            fast: config.fast || 12,
            slow: config.slow || 26,
            signal: config.signal || 9
        };
    }

    protected getActions(asset: any): Action[] {
        return macdStrategy(asset, this.config);
    }
}
