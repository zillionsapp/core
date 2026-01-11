"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PsarStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class PsarStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'PSAR';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            step: config.step || defaults.step || 0.02,
            max: config.max || defaults.max || 0.2
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.psarStrategy)(asset, this.config);
    }
}
exports.PsarStrategy = PsarStrategy;
