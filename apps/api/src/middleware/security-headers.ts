import { createMiddleware } from "hono/factory";

/**
 * Security headers middleware.
 *
 * Sets standard HTTP security headers on every response to mitigate
 * common web vulnerabilities (clickjacking, MIME sniffing, XSS, etc.).
 *
 * These headers complement Cloudflare's built-in protections and ensure
 * defense-in-depth even if traffic bypasses the CDN.
 */
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();

  // Enforce HTTPS for 1 year, including subdomains.
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Prevent MIME type sniffing (e.g., treating a text file as JavaScript).
  c.header("X-Content-Type-Options", "nosniff");

  // Prevent the page from being embedded in iframes (clickjacking protection).
  c.header("X-Frame-Options", "DENY");

  // Control how much referrer information is sent with requests.
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable browser features the API doesn't need.
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});
