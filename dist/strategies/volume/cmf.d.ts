import { BaseLibraryStrategy } from '../base_strategy';
import { StrategyConfig } from '../../interfaces/strategy.interface';
import { Action } from 'indicatorts';
export declare class CmfStrategy extends BaseLibraryStrategy {
    name: string;
    private config;
    protected onInit(config: StrategyConfig): void;
    protected getActions(asset: any): Action[];
}
