"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CfoStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
class CfoStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'CFO';
    }
    onInit(config) {
    }
    getActions(asset) {
        return (0, indicatorts_1.cfoStrategy)(asset);
    }
}
exports.CfoStrategy = CfoStrategy;
