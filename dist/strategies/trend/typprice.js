"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypPriceStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
class TypPriceStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'TYPPRICE';
    }
    onInit(config) {
    }
    getActions(asset) {
        return (0, indicatorts_1.typpriceStrategy)(asset);
    }
}
exports.TypPriceStrategy = TypPriceStrategy;
