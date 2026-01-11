"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VwmaStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class VwmaStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'VWMA';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            period: config.period || defaults.period || 20
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.vwmaStrategy)(asset, this.config);
    }
}
exports.VwmaStrategy = VwmaStrategy;
