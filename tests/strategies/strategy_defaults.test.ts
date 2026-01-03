
import { MacdStrategy } from '../../src/strategies/trend/macd';
import { ApoStrategy } from '../../src/strategies/trend/apo';
import { AroonStrategy } from '../../src/strategies/trend/aroon';
import { KdjStrategy } from '../../src/strategies/trend/kdj';
import { PsarStrategy } from '../../src/strategies/trend/psar';
import { VwmaStrategy } from '../../src/strategies/trend/vwma';
import { VortexStrategy } from '../../src/strategies/trend/vortex';

import { BbStrategy } from '../../src/strategies/volatility/bb';
import { AbStrategy } from '../../src/strategies/volatility/ab';
import { PoStrategy } from '../../src/strategies/volatility/po';

import { IchimokuCloudStrategy } from '../../src/strategies/momentum/ichimoku';
import { AoStrategy } from '../../src/strategies/momentum/ao';
import { WillRStrategy } from '../../src/strategies/momentum/willr';

import { CmfStrategy } from '../../src/strategies/volume/cmf';
import { EmvStrategy } from '../../src/strategies/volume/emv';
import { FiStrategy } from '../../src/strategies/volume/fi';
import { MfiStrategy } from '../../src/strategies/volume/mfi';
import { NviStrategy } from '../../src/strategies/volume/nvi';
import { VwapStrategy } from '../../src/strategies/volume/vwap';

import { config } from '../../src/config/env';

// Mock the config
jest.mock('../../src/config/env', () => ({
    config: {
        STRATEGY_INTERVAL: '1m' // Default start value
    }
}));

describe('Comprehensive Strategy Defaults', () => {

    // --- Trend Strategies ---
    describe('Trend Strategies', () => {
        it('MACD: should use scalping defaults for 1m', () => {
            (config as any).STRATEGY_INTERVAL = '1m';
            const strategy = new MacdStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.fast).toBe(8);
        });

        it('APO: should use scalping defaults for 5m', () => {
            (config as any).STRATEGY_INTERVAL = '5m';
            const strategy = new ApoStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.fast).toBe(3);
        });

        it('AROON: should use standard defaults for 1h', () => {
            (config as any).STRATEGY_INTERVAL = '1h';
            const strategy = new AroonStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(25);
        });

        it('KDJ: should use scalping defaults for 1m', () => {
            (config as any).STRATEGY_INTERVAL = '1m';
            const strategy = new KdjStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.rPeriod).toBe(9);
            expect(c.kPeriod).toBe(3);
        });

        it('PSAR: should use swing defaults for 4h', () => {
            (config as any).STRATEGY_INTERVAL = '4h';
            const strategy = new PsarStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.step).toBe(0.01);
        });

        it('VWMA: should use standard defaults for 1d', () => {
            (config as any).STRATEGY_INTERVAL = '1d';
            const strategy = new VwmaStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(20);
        });

        it('VORTEX: should use scalping defaults for 5m', () => {
            (config as any).STRATEGY_INTERVAL = '5m';
            const strategy = new VortexStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(10);
        });
    });

    // --- Volatility Strategies ---
    describe('Volatility Strategies', () => {
        it('BB: should use fast defaults for 1m', () => {
            (config as any).STRATEGY_INTERVAL = '1m';
            const strategy = new BbStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(10);
        });

        it('AB: should use swing defaults for 4h', () => {
            (config as any).STRATEGY_INTERVAL = '4h';
            const strategy = new AbStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(50);
        });

        it('PO: should use scalping defaults for 5m', () => {
            (config as any).STRATEGY_INTERVAL = '5m';
            const strategy = new PoStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(10);
        });
    });

    // --- Momentum Strategies ---
    describe('Momentum Strategies', () => {
        it('Ichimoku: should use crypto standard for all', () => {
            (config as any).STRATEGY_INTERVAL = '1d';
            const strategy = new IchimokuCloudStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.short).toBe(20);
        });

        it('AO: should use fast defaults for 1m', () => {
            (config as any).STRATEGY_INTERVAL = '1m';
            const strategy = new AoStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.fast).toBe(3);
            expect(c.slow).toBe(21);
        });

        it('WILLR: should use standard defaults for 1h', () => {
            (config as any).STRATEGY_INTERVAL = '1h';
            const strategy = new WillRStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(20);
        });
    });

    // --- Volume Strategies ---
    describe('Volume Strategies', () => {
        it('CMF: should use scalping defaults for 1m', () => {
            (config as any).STRATEGY_INTERVAL = '1m';
            const strategy = new CmfStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(10);
        });

        it('EMV: should use standard defaults (always 14)', () => {
            (config as any).STRATEGY_INTERVAL = '5m';
            const strategy = new EmvStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(14);
        });

        it('FI: should use fast defaults for 5m', () => {
            (config as any).STRATEGY_INTERVAL = '5m';
            const strategy = new FiStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(2);
        });

        it('MFI: should use standard defaults for 1h', () => {
            (config as any).STRATEGY_INTERVAL = '1h';
            const strategy = new MfiStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(14);
        });

        it('NVI: should use standard defaults (always 255)', () => {
            (config as any).STRATEGY_INTERVAL = '1d';
            const strategy = new NviStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(255);
        });

        it('VWAP: should use rolling defaults (always 14)', () => {
            (config as any).STRATEGY_INTERVAL = '15m';
            const strategy = new VwapStrategy();
            strategy.init({});
            const c = (strategy as any).config;
            expect(c.period).toBe(14);
        });
    });
});
