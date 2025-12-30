import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { mfiStrategy, Action } from 'indicatorts';

export class MfiStrategy extends BaseLibraryStrategy {
    name = 'MFI';
    private config: any = {};

    protected onInit(config: StrategyConfig): void {
        this.config = {
            period: config.period || 14
        };
    }

    protected getActions(asset: any): Action[] {
        return mfiStrategy(asset, this.config);
    }
}
