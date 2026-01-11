"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NviStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class NviStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'NVI';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            start: config.start || defaults.start || 1000,
            period: config.period || defaults.period || 255
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.nviStrategy)(asset, this.config);
    }
}
exports.NviStrategy = NviStrategy;
