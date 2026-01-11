"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyManager = void 0;
// Trend
const macd_1 = require("../strategies/trend/macd");
const apo_1 = require("../strategies/trend/apo");
const aroon_1 = require("../strategies/trend/aroon");
const bop_1 = require("../strategies/trend/bop");
const cfo_1 = require("../strategies/trend/cfo");
const kdj_1 = require("../strategies/trend/kdj");
const psar_1 = require("../strategies/trend/psar");
const typprice_1 = require("../strategies/trend/typprice");
const vwma_1 = require("../strategies/trend/vwma");
const vortex_1 = require("../strategies/trend/vortex");
// Momentum
const ao_1 = require("../strategies/momentum/ao");
const ichimoku_1 = require("../strategies/momentum/ichimoku");
const rsi2_1 = require("../strategies/momentum/rsi2");
const stoch_1 = require("../strategies/momentum/stoch");
const willr_1 = require("../strategies/momentum/willr");
// Volatility
const bb_1 = require("../strategies/volatility/bb");
const ab_1 = require("../strategies/volatility/ab");
const po_1 = require("../strategies/volatility/po");
// Volume
const cmf_1 = require("../strategies/volume/cmf");
const emv_1 = require("../strategies/volume/emv");
const fi_1 = require("../strategies/volume/fi");
const mfi_1 = require("../strategies/volume/mfi");
const nvi_1 = require("../strategies/volume/nvi");
const vwap_1 = require("../strategies/volume/vwap");
class StrategyManager {
    static getStrategy(name) {
        const StrategyClass = this.strategies.get(name);
        if (!StrategyClass) {
            throw new Error(`Strategy not found: ${name}`);
        }
        return new StrategyClass();
    }
    static getAvailableStrategies() {
        return Array.from(this.strategies.keys());
    }
}
exports.StrategyManager = StrategyManager;
StrategyManager.strategies = new Map([
    // Trend
    ['MACD', macd_1.MacdStrategy],
    ['APO', apo_1.ApoStrategy],
    ['AROON', aroon_1.AroonStrategy],
    ['BOP', bop_1.BopStrategy],
    ['CFO', cfo_1.CfoStrategy],
    ['KDJ', kdj_1.KdjStrategy],
    ['PSAR', psar_1.PsarStrategy],
    ['TYPPRICE', typprice_1.TypPriceStrategy],
    ['VWMA', vwma_1.VwmaStrategy],
    ['VORTEX', vortex_1.VortexStrategy],
    // Momentum
    ['AO', ao_1.AoStrategy],
    ['ICHIMOKU', ichimoku_1.IchimokuCloudStrategy],
    ['RSI2', rsi2_1.Rsi2Strategy],
    ['STOCH', stoch_1.StochStrategy],
    ['WILLR', willr_1.WillRStrategy],
    // Volatility
    ['BB', bb_1.BbStrategy],
    ['AB', ab_1.AbStrategy],
    ['PO', po_1.PoStrategy],
    // Volume
    ['CMF', cmf_1.CmfStrategy],
    ['EMV', emv_1.EmvStrategy],
    ['FI', fi_1.FiStrategy],
    ['MFI', mfi_1.MfiStrategy],
    ['NVI', nvi_1.NviStrategy],
    ['VWAP', vwap_1.VwapStrategy],
]);
