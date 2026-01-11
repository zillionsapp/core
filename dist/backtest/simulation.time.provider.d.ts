import { ITimeProvider } from '../core/time.provider';
export declare class SimulationTimeProvider implements ITimeProvider {
    private currentTime;
    setTime(timestamp: number): void;
    now(): number;
    getUTCDate(): number;
}
