"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KdjStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class KdjStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'KDJ';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            rPeriod: config.rPeriod || defaults.rPeriod || 9,
            kPeriod: config.kPeriod || defaults.kPeriod || 3,
            dPeriod: config.dPeriod || defaults.dPeriod || 3
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.kdjStrategy)(asset, this.config);
    }
}
exports.KdjStrategy = KdjStrategy;
