// ============================================================
// GeoPulse — Shared API auth gate for sensitive endpoints
// Fail-closed bearer-token check, backed by the vendored
// resilience `requireAuth` primitive (src/lib/resilience).
// ============================================================

import { requireAuthResponse } from './resilience/auth';

/**
 * Guard a sensitive/destructive API route.
 *
 * Returns a `Response` (401/503/429) to send back when the caller is NOT
 * authorized, or `null` when the request may proceed. Fails CLOSED: if
 * `GEOPULSE_API_TOKEN` is unset the request is refused with 503 rather than
 * silently allowed.
 *
 * Callers send `Authorization: Bearer <token>`.
 */
export function guardSensitiveRoute(request: Request): Response | null {
  return requireAuthResponse(request, {
    token: process.env.GEOPULSE_API_TOKEN,
  });
}
