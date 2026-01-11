"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealTimeProvider = void 0;
class RealTimeProvider {
    now() {
        return Date.now();
    }
    getUTCDate() {
        return new Date().getUTCDate();
    }
}
exports.RealTimeProvider = RealTimeProvider;
