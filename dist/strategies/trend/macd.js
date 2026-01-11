"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacdStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class MacdStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'MACD';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            fast: config.fast || defaults.fast || 12,
            slow: config.slow || defaults.slow || 26,
            signal: config.signal || defaults.signal || 9
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.macdStrategy)(asset, this.config);
    }
}
exports.MacdStrategy = MacdStrategy;
