"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationTimeProvider = void 0;
class SimulationTimeProvider {
    constructor() {
        this.currentTime = 0;
    }
    setTime(timestamp) {
        this.currentTime = timestamp;
    }
    now() {
        return this.currentTime;
    }
    getUTCDate() {
        return new Date(this.currentTime).getUTCDate();
    }
}
exports.SimulationTimeProvider = SimulationTimeProvider;
