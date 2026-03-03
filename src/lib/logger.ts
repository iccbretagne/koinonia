import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // No transport — pino writes to stdout by default.
  // Pino transports use worker threads which are incompatible with Next.js bundling.
});
