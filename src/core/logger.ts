import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }), // Print stack trace on error
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            format: combine(colorize(), logFormat),
        }),
    ],
});

// Add file transports only if not in a serverless/Vercel environment
if (!process.env.VERCEL && !process.env.LAMBDA_TASK_ROOT) {
    logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}
