"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rsi2Strategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
class Rsi2Strategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'RSI2';
    }
    onInit(config) {
    }
    getActions(asset) {
        return (0, indicatorts_1.rsi2Strategy)(asset);
    }
}
exports.Rsi2Strategy = Rsi2Strategy;
