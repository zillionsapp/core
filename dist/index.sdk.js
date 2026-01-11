"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.config = exports.ExchangeFactory = exports.StrategyManager = exports.BotEngine = void 0;
// Core exports for SDK usage (without API server)
var engine_1 = require("./core/engine");
Object.defineProperty(exports, "BotEngine", { enumerable: true, get: function () { return engine_1.BotEngine; } });
var strategy_manager_1 = require("./core/strategy.manager");
Object.defineProperty(exports, "StrategyManager", { enumerable: true, get: function () { return strategy_manager_1.StrategyManager; } });
var factory_1 = require("./adapters/exchange/factory");
Object.defineProperty(exports, "ExchangeFactory", { enumerable: true, get: function () { return factory_1.ExchangeFactory; } });
var env_1 = require("./config/env");
Object.defineProperty(exports, "config", { enumerable: true, get: function () { return env_1.config; } });
var logger_1 = require("./core/logger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return logger_1.logger; } });
// Interfaces
__exportStar(require("./interfaces/strategy.interface"), exports);
__exportStar(require("./interfaces/exchange.interface"), exports);
__exportStar(require("./interfaces/repository.interface"), exports);
__exportStar(require("./core/types"), exports);
__exportStar(require("./core/time.provider"), exports);
