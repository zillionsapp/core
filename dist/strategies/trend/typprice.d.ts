import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { Action } from 'indicatorts';
export declare class TypPriceStrategy extends BaseLibraryStrategy {
    name: string;
    protected onInit(config: StrategyConfig): void;
    protected getActions(asset: any): Action[];
}
