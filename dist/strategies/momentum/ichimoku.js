"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IchimokuCloudStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
const env_1 = require("../../config/env");
const strategy_defaults_1 = require("../../config/strategy_defaults");
class IchimokuCloudStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'ICHIMOKU';
        this.config = {};
    }
    onInit(config) {
        const interval = env_1.config.STRATEGY_INTERVAL;
        const defaults = strategy_defaults_1.STRATEGY_DEFAULTS[this.name]?.[interval] || {};
        this.config = {
            short: config.short || defaults.short || 9,
            medium: config.medium || defaults.medium || 26,
            long: config.long || defaults.long || 52,
            close: config.close || defaults.close || 26
        };
    }
    getActions(asset) {
        return (0, indicatorts_1.ichimokuCloudStrategy)(asset, this.config);
    }
}
exports.IchimokuCloudStrategy = IchimokuCloudStrategy;
