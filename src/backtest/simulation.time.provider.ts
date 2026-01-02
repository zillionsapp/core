import { ITimeProvider } from '../core/time.provider';

export class SimulationTimeProvider implements ITimeProvider {
    private currentTime: number = 0;

    setTime(timestamp: number) {
        this.currentTime = timestamp;
    }

    now(): number {
        return this.currentTime;
    }

    getUTCDate(): number {
        return new Date(this.currentTime).getUTCDate();
    }
}
