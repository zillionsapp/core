export interface ITimeProvider {
    now(): number;
    getUTCDate(): number;
}
export declare class RealTimeProvider implements ITimeProvider {
    now(): number;
    getUTCDate(): number;
}
