"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BopStrategy = void 0;
const base_strategy_1 = require("../base_strategy");
const indicatorts_1 = require("indicatorts");
class BopStrategy extends base_strategy_1.BaseLibraryStrategy {
    constructor() {
        super(...arguments);
        this.name = 'BOP';
    }
    onInit(config) {
        // No specific config for bopStrategy in docs
    }
    getActions(asset) {
        return (0, indicatorts_1.bopStrategy)(asset);
    }
}
exports.BopStrategy = BopStrategy;
