import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorHandler } from "hono";

/**
 * Global error handler. Returns structured JSON errors.
 * Never exposes stack traces in production.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const status: ContentfulStatusCode = "status" in err ? (err.status as ContentfulStatusCode) : 500;
  const message = status < 500 ? err.message : "Internal server error";

  if (status >= 500) {
    console.error(`[ERROR] ${err.message}`, err.stack);
  }

  return c.json({ error: { message, status } }, status);
};
