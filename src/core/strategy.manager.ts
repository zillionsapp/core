import { IStrategy } from '../interfaces/strategy.interface';

// Trend
import { MacdStrategy } from '../strategies/trend/macd';
import { ApoStrategy } from '../strategies/trend/apo';
import { AroonStrategy } from '../strategies/trend/aroon';
import { BopStrategy } from '../strategies/trend/bop';
import { CfoStrategy } from '../strategies/trend/cfo';
import { KdjStrategy } from '../strategies/trend/kdj';
import { PsarStrategy } from '../strategies/trend/psar';
import { TypPriceStrategy } from '../strategies/trend/typprice';
import { VwmaStrategy } from '../strategies/trend/vwma';
import { VortexStrategy } from '../strategies/trend/vortex';

// Momentum
import { AoStrategy } from '../strategies/momentum/ao';
import { IchimokuCloudStrategy } from '../strategies/momentum/ichimoku';
import { Rsi2Strategy } from '../strategies/momentum/rsi2';
import { StochStrategy } from '../strategies/momentum/stoch';
import { WillRStrategy } from '../strategies/momentum/willr';

// Volatility
import { BbStrategy } from '../strategies/volatility/bb';
import { AbStrategy } from '../strategies/volatility/ab';
import { PoStrategy } from '../strategies/volatility/po';

// Volume
import { CmfStrategy } from '../strategies/volume/cmf';
import { EmvStrategy } from '../strategies/volume/emv';
import { FiStrategy } from '../strategies/volume/fi';
import { MfiStrategy } from '../strategies/volume/mfi';
import { NviStrategy } from '../strategies/volume/nvi';
import { VwapStrategy } from '../strategies/volume/vwap';

export class StrategyManager {
    private static strategies = new Map<string, new () => IStrategy>([

        // Trend
        ['MACD', MacdStrategy],
        ['APO', ApoStrategy],
        ['AROON', AroonStrategy],
        ['BOP', BopStrategy],
        ['CFO', CfoStrategy],
        ['KDJ', KdjStrategy],
        ['PSAR', PsarStrategy],
        ['TYPPRICE', TypPriceStrategy],
        ['VWMA', VwmaStrategy],
        ['VORTEX', VortexStrategy],

        // Momentum
        ['AO', AoStrategy],
        ['ICHIMOKU', IchimokuCloudStrategy],
        ['RSI2', Rsi2Strategy],
        ['STOCH', StochStrategy],
        ['WILLR', WillRStrategy],

        // Volatility
        ['BB', BbStrategy],
        ['AB', AbStrategy],
        ['PO', PoStrategy],

        // Volume
        ['CMF', CmfStrategy],
        ['EMV', EmvStrategy],
        ['FI', FiStrategy],
        ['MFI', MfiStrategy],
        ['NVI', NviStrategy],
        ['VWAP', VwapStrategy],
    ]);

    static getStrategy(name: string): IStrategy {
        const StrategyClass = this.strategies.get(name);
        if (!StrategyClass) {
            throw new Error(`Strategy not found: ${name}`);
        }
        return new StrategyClass();
    }

    static getAvailableStrategies(): string[] {
        return Array.from(this.strategies.keys());
    }
}
