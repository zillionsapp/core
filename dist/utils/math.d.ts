/**
 * Utility functions for handling floating point precision and order standardization.
 */
export declare class PrecisionUtils {
    /**
     * Round a number down to a specific number of decimal places.
     * Essential for quantity calculations to avoid "Insufficient Balance" errors.
     */
    static roundDown(value: number, decimals: number): number;
    /**
     * Round a number to the nearest step size.
     * Example: roundToStep(123.456, 0.5) -> 123.5
     */
    static roundToStep(value: number, stepSize: number): number;
    /**
     * Round a price to standard exchange precision (usually 2 or 4 decimals).
     */
    static normalizePrice(price: number): number;
    /**
     * Round a quantity to standard exchange precision (usually 6 decimals for crypto).
     */
    static normalizeQuantity(quantity: number): number;
}
