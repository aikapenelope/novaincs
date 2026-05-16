# Nova — Production Audit (May 2026)

> **Status**: Active  
> **Date**: May 16, 2026  
> **Scope**: Full audit of repository code, Pulumi stack state, and live VPS. Identifies critical issues, fragile patterns, and tracks what was fixed.

---

## 1. Audit Method

- Repository code analysis (`aikapenelope/novaincs`, branch `main`)
- Pulumi Cloud resource search (`qyne-infra/dev` stack, 10 resources)
- SSH into VPS (`204.168.169.254`) to verify live state
- Cross-referenced with docs 14, 15, and 16

---

## 2. Issues Found

### CRITICAL (fixed in PR #25)

| #   | Issue                                                              | Impact                                                                                                                                               | Fix                                                                                                                                                                            |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | **R2 storage adapter used raw `fetch()` without AWS Signature V4** | Image uploads to Cloudflare R2 would fail in production. The adapter was a placeholder that could never authenticate.                                | Replaced with `@aws-sdk/client-s3` using `PutObjectCommand`/`DeleteObjectCommand`.                                                                                             |
| A2  | **Health check returned static OK without verifying dependencies** | Traefik/Coolify thought the API was healthy even when PostgreSQL or Redis were down. No auto-restart on DB failure.                                  | `/health` now runs `SELECT 1` on PostgreSQL and `PING` on Redis. Returns 503 when DB is down, 200 with `degraded` when only Redis is down. Includes latency per check.         |
| A3  | **No worker to release expired stock reservations**                | Orders with `expiresAt` past due kept stock reserved forever. Merchants would see phantom "out of stock" for products that were never actually sold. | Added BullMQ repeatable job (`stock-cleanup`) that runs every 15 minutes. Finds expired unpaid orders, restores stock, records inventory movements, marks orders as `expired`. |

### CRITICAL (deferred — hardening phase)

| #   | Issue                                                               | Impact                                                                                                                                                                                   | When to Fix                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A4  | **SSH open to `0.0.0.0/0`**                                         | Any IP can attempt SSH. 810 failed attempts observed, 37 IPs banned by fail2ban. A zero-day in OpenSSH or compromised key = full server access.                                          | Before paid launch (Sprint 15). Restrict to Tailscale IPs in Pulumi firewall.                                                                                |
| A5  | **Backups only on the same server**                                 | `pg_dump` files stored at `/var/lib/nova/backups/` on the same disk. Server loss = data loss + backup loss.                                                                              | Before beta launch (Sprint 9). Copy to Cloudflare R2 or Hetzner Object Storage via `rclone`.                                                                 |
| A6  | **Rate limiter in memory (not Redis)**                              | Resets on server restart. Per-IP, not per-tenant. One attacker can exhaust the limit for all users. Multiple instances would each have independent counters.                             | Before beta launch (Sprint 9). Replace with Redis-backed rate limiter in Hono middleware.                                                                    |
| A7  | **RLS context with `set_config(..., true)` and connection pooling** | `set_config` with `true` = local to transaction. Non-transactional queries (GET routes) may execute on different pool connections without RLS context. Potential cross-tenant data leak. | Before beta launch (Sprint 9). Wrap all tenant-scoped queries in explicit transactions, or use `set_config(..., false)` with connection-per-request pattern. |

### HIGH (deferred — hardening phase)

| #   | Issue                                                       | Impact                                                                                                          | When to Fix                                                                                              |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A8  | **CI typecheck uses `continue-on-error: true`**             | Dashboard and Catalog typecheck errors are silenced. Real type errors pass CI undetected.                       | Before 100 merchants. Filter the specific vue-router/volar warning instead of ignoring all errors.       |
| A9  | **Coolify panel (`deploy.martes.app`) publicly accessible** | Full server control (deploy, logs, env vars, shell) behind only Coolify's login.                                | Access via Tailscale at `http://100.123.199.40:8000` instead. Consider Cloudflare Access for the domain. |
| A10 | **No staging environment**                                  | All deploys go directly to production. A bad migration = production downtime.                                   | Before paid launch (Sprint 15). Second Hetzner CX22 (~€4/mo) or local Docker Compose mirror.             |
| A11 | **`deploy.sh` uses `StrictHostKeyChecking=no`**             | Disables SSH host key verification, vulnerable to MITM attacks.                                                 | Before paid launch. Remove the flag and add the server's host key to known_hosts.                        |
| A12 | **No observability**                                        | No Sentry, no Prometheus/Grafana, no alerting, no structured logging. Debugging production issues requires SSH. | Before 100 merchants. See doc 16 items H1-H6.                                                            |

---

## 3. VPS State at Time of Audit

Verified via SSH on May 16, 2026:

```
Server:     nova-server-c292a99 (Hetzner CX43, Helsinki)
OS:         Ubuntu 24.04 LTS, kernel 6.8.0-111-generic
Memory:     2.0 GB used / 15 GB total (87% free)
Disk:       16 GB used / 150 GB total (89% free)
Tailscale:  100.123.199.40 (active)
fail2ban:   Active, 810 total failed SSH attempts, 37 IPs banned historically
```

**Containers running (13):**

| Container                  | Status  | Purpose                                      |
| -------------------------- | ------- | -------------------------------------------- |
| `re6fk4dx8qum7w9v7zh2qer5` | healthy | Qyne API (Hono)                              |
| `ncsviwrk3w036ged275diea1` | healthy | Qyne Dashboard (Nuxt 3)                      |
| `pg-nova`                  | healthy | Business database (PostgreSQL 16 + pgvector) |
| `pg-agno`                  | healthy | Agent database (PostgreSQL 16 + pgvector)    |
| `pg-prefect`               | healthy | Workflow database (PostgreSQL 16)            |
| `nova-redis`               | healthy | Cache + BullMQ queues                        |
| `nova-prefect`             | healthy | Workflow engine (Prefect 3)                  |
| `coolify`                  | healthy | Deployment platform                          |
| `coolify-proxy`            | healthy | Traefik reverse proxy                        |
| `coolify-db`               | healthy | Coolify's internal PostgreSQL                |
| `coolify-redis`            | healthy | Coolify's internal Redis                     |
| `coolify-sentinel`         | healthy | Coolify monitoring                           |
| `coolify-realtime`         | healthy | Coolify WebSocket                            |

**Cron jobs:**

```
0 3 * * *   /opt/nova/backup.sh pg-nova   (daily at 3:00 AM)
30 3 * * 0  /opt/nova/backup.sh pg-agno   (weekly Sunday at 3:30 AM)
```

**Backup files (local only, no offsite):**

```
pg-agno-20260514_015434.sql.gz    454 B
pg-nova-20260514_015434.sql.gz    589 B
pg-nova-20260514_015445.sql.gz    592 B
pg-nova-20260514_030001.sql.gz    590 B
pg-nova-20260515_030001.sql.gz    4.0 KB
```

---

## 4. Post-Fix Verification

After PR #25 was merged and Coolify auto-deployed:

```json
// GET /health — now verifies dependencies
{
  "status": "ok",
  "service": "qyne-api",
  "timestamp": "2026-05-16T02:10:02.448Z",
  "checks": {
    "pg": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 1 }
  }
}
```

```
// Container logs confirm workers started
[image-worker] Worker started (concurrency: 2)
[stock-cleanup] Worker started (every 15 min)
Qyne API running on http://localhost:3000
```

---

## 5. What's Next (Roadmap Position)

Current position: **Sprint 9 complete — BETA LAUNCH READY** — Phase 1 (MVP) done.

```
DONE     Sprint 1:  Infrastructure (Hetzner, Pulumi, DBs, Redis, Prefect)
DONE     Sprint 2:  Monorepo scaffolding (pnpm + turborepo)
DONE     Sprint 3:  Schema + Auth + RLS (13 tables, Clerk middleware)
DONE     Sprint 4:  API core + Basic catalog + Dashboard products
DONE     Sprint 5:  CI/CD + Production deploy (Coolify + Traefik)
DONE     Audit:     R2 fix, health check, stock cleanup, doc 17
DONE     Sprint 6:  AI images (fal.ai) + BCV dual pricing
DONE     Sprint 7:  Cart + Checkout + WhatsApp deep link (catalog PWA)
DONE     Sprint 8:  Orders dashboard + Payment verification + Daily stats
DONE     Pre-9:     Clerk auth, payment config UI, tenant settings, zero placeholders
DONE     Sprint 9:  Onboarding wizard + Excel import + Full-text search + SEO

→ BETA LAUNCH (invite 10-20 merchants)

NEXT     Sprint 10: Basic CRM + Behavioral tracking
         Sprint 11: RFM scoring + Auto-segments
         Sprint 12: Agno agents (Finance Agent, OCR, briefing)
         Sprint 13: Smart feed + Notifications
         Sprint 14: Google Sheets import + Financial dashboard
         Sprint 15: Email reports + Plan tiers + Billing → PAID LAUNCH
```

### VPS verification (May 16, 2026)

All Sprint 9 code deployed and running:

| Component                   | Status                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| API container               | Healthy (pg 2ms, redis 1ms)                                       |
| Dashboard container         | Running (needs `NUXT_CLERK_SECRET_KEY` in Coolify)                |
| 3 BullMQ workers            | image-worker, stock-cleanup, exchange-rate-worker                 |
| Exchange rate               | 515.18 Bs/USD (auto-refreshing every 15 min)                      |
| `/products/import` endpoint | Returns 401 (correct — requires auth)                             |
| `/payment-configs` endpoint | Returns 401 (correct — requires auth)                             |
| DB                          | 0 tenants, 0 products, 0 orders (clean, ready for first merchant) |

**Action required**: Add `NUXT_CLERK_SECRET_KEY` to the dashboard app in Coolify. Without it, Clerk's server-side middleware returns 500 on every page load.

### What's needed for beta launch

1. Add `NUXT_CLERK_SECRET_KEY` in Coolify dashboard env vars
2. Verify Clerk sign-up flow works end-to-end
3. Invite 10-20 merchants to test
4. Monitor for bugs and iterate

### Hardening items (deferred to Phase 2)

| Item                   | Audit # | Doc 16 # | When                           |
| ---------------------- | ------- | -------- | ------------------------------ |
| Offsite backups        | A5      | H7       | Before paid launch (Sprint 15) |
| Redis rate limiter     | A6      | H14      | Before paid launch             |
| RLS context safety     | A7      | —        | Before paid launch             |
| Alerting (UptimeRobot) | A12     | H3       | Before 100 merchants           |
| Privacy policy         | —       | H31      | Before paid launch             |
| Restrict SSH           | A4      | H12      | Before paid launch             |
| Staging environment    | A10     | H21      | Before paid launch             |
| Terms of service       | —       | H32      | Before paid launch             |
