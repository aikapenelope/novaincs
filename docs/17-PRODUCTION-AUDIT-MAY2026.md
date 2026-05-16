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

| # | Issue | Impact | Fix |
|---|---|---|---|
| A1 | **R2 storage adapter used raw `fetch()` without AWS Signature V4** | Image uploads to Cloudflare R2 would fail in production. The adapter was a placeholder that could never authenticate. | Replaced with `@aws-sdk/client-s3` using `PutObjectCommand`/`DeleteObjectCommand`. |
| A2 | **Health check returned static OK without verifying dependencies** | Traefik/Coolify thought the API was healthy even when PostgreSQL or Redis were down. No auto-restart on DB failure. | `/health` now runs `SELECT 1` on PostgreSQL and `PING` on Redis. Returns 503 when DB is down, 200 with `degraded` when only Redis is down. Includes latency per check. |
| A3 | **No worker to release expired stock reservations** | Orders with `expiresAt` past due kept stock reserved forever. Merchants would see phantom "out of stock" for products that were never actually sold. | Added BullMQ repeatable job (`stock-cleanup`) that runs every 15 minutes. Finds expired unpaid orders, restores stock, records inventory movements, marks orders as `expired`. |

### CRITICAL (deferred — hardening phase)

| # | Issue | Impact | When to Fix |
|---|---|---|---|
| A4 | **SSH open to `0.0.0.0/0`** | Any IP can attempt SSH. 810 failed attempts observed, 37 IPs banned by fail2ban. A zero-day in OpenSSH or compromised key = full server access. | Before paid launch (Sprint 15). Restrict to Tailscale IPs in Pulumi firewall. |
| A5 | **Backups only on the same server** | `pg_dump` files stored at `/var/lib/nova/backups/` on the same disk. Server loss = data loss + backup loss. | Before beta launch (Sprint 9). Copy to Cloudflare R2 or Hetzner Object Storage via `rclone`. |
| A6 | **Rate limiter in memory (not Redis)** | Resets on server restart. Per-IP, not per-tenant. One attacker can exhaust the limit for all users. Multiple instances would each have independent counters. | Before beta launch (Sprint 9). Replace with Redis-backed rate limiter in Hono middleware. |
| A7 | **RLS context with `set_config(..., true)` and connection pooling** | `set_config` with `true` = local to transaction. Non-transactional queries (GET routes) may execute on different pool connections without RLS context. Potential cross-tenant data leak. | Before beta launch (Sprint 9). Wrap all tenant-scoped queries in explicit transactions, or use `set_config(..., false)` with connection-per-request pattern. |

### HIGH (deferred — hardening phase)

| # | Issue | Impact | When to Fix |
|---|---|---|---|
| A8 | **CI typecheck uses `continue-on-error: true`** | Dashboard and Catalog typecheck errors are silenced. Real type errors pass CI undetected. | Before 100 merchants. Filter the specific vue-router/volar warning instead of ignoring all errors. |
| A9 | **Coolify panel (`deploy.martes.app`) publicly accessible** | Full server control (deploy, logs, env vars, shell) behind only Coolify's login. | Access via Tailscale at `http://100.123.199.40:8000` instead. Consider Cloudflare Access for the domain. |
| A10 | **No staging environment** | All deploys go directly to production. A bad migration = production downtime. | Before paid launch (Sprint 15). Second Hetzner CX22 (~€4/mo) or local Docker Compose mirror. |
| A11 | **`deploy.sh` uses `StrictHostKeyChecking=no`** | Disables SSH host key verification, vulnerable to MITM attacks. | Before paid launch. Remove the flag and add the server's host key to known_hosts. |
| A12 | **No observability** | No Sentry, no Prometheus/Grafana, no alerting, no structured logging. Debugging production issues requires SSH. | Before 100 merchants. See doc 16 items H1-H6. |

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

| Container | Status | Purpose |
|---|---|---|
| `re6fk4dx8qum7w9v7zh2qer5` | healthy | Qyne API (Hono) |
| `ncsviwrk3w036ged275diea1` | healthy | Qyne Dashboard (Nuxt 3) |
| `pg-nova` | healthy | Business database (PostgreSQL 16 + pgvector) |
| `pg-agno` | healthy | Agent database (PostgreSQL 16 + pgvector) |
| `pg-prefect` | healthy | Workflow database (PostgreSQL 16) |
| `nova-redis` | healthy | Cache + BullMQ queues |
| `nova-prefect` | healthy | Workflow engine (Prefect 3) |
| `coolify` | healthy | Deployment platform |
| `coolify-proxy` | healthy | Traefik reverse proxy |
| `coolify-db` | healthy | Coolify's internal PostgreSQL |
| `coolify-redis` | healthy | Coolify's internal Redis |
| `coolify-sentinel` | healthy | Coolify monitoring |
| `coolify-realtime` | healthy | Coolify WebSocket |

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

Current position: **Sprint 6 (partially done)** — Phase 1 (MVP).

Sprints 1-5 are complete. The immediate next work is finishing the MVP to reach beta launch:

| Sprint | Status | What Remains |
|---|---|---|
| **Sprint 6** | Partially done | BCV dual pricing (`ve.dolarapi.com` integration) |
| **Sprint 7** | Partially done | Cart frontend, WhatsApp deep links for checkout |
| **Sprint 8** | Not started | Orders dashboard UI, order status management |
| **Sprint 9** | Not started | Onboarding wizard, Excel/CSV import, polish |
| | | **→ BETA LAUNCH (10-20 merchants)** |

### Sprint 6 remaining: BCV Dual Pricing

- Integrate `ve.dolarapi.com` API to fetch BCV exchange rate
- Auto-convert USD prices to Bs on product display
- Store rate history in `exchange_rates` table (already exists in schema)
- BullMQ job to refresh rate every 15 minutes

### Sprint 7 remaining: Cart + Checkout Frontend

- Shopping cart component (localStorage + API sync, sticky bottom bar)
- WhatsApp deep link generation with structured order message (`wa.me/...?text=...`)
- Stock reservation already works in backend (POST `/checkout/:tenantSlug`)
- Stock cleanup worker now handles expired reservations (PR #25)

### Sprint 8: Orders Dashboard

- Order list page with status filters (payment_pending, verified, shipped, delivered)
- Order detail view (items, buyer info, payment screenshot)
- Mark as paid / shipped / delivered actions
- Daily sales total on home screen

### Sprint 9: Onboarding + Polish

- Onboarding wizard (create store, configure payment methods, add first product)
- Payment method configuration UI (Pago Movil/Zelle bank details)
- Excel/CSV import (SheetJS parsing, validation, preview)
- Catalog SEO (meta tags, Open Graph, JSON-LD)
- Bug fixes with 2-3 real merchants
- **→ BETA LAUNCH**

### Hardening items to weave in before beta (from this audit + doc 16)

| Item | Audit # | Doc 16 # | When |
|---|---|---|---|
| Offsite backups | A5 | H7 | Before Sprint 9 |
| Redis rate limiter | A6 | H14 | Before Sprint 9 |
| RLS context safety | A7 | — | Before Sprint 9 |
| Alerting (UptimeRobot) | A12 | H3 | Before Sprint 9 |
| Privacy policy | — | H31 | Before Sprint 9 |
| Restrict SSH | A4 | H12 | Before Sprint 15 |
| Staging environment | A10 | H21 | Before Sprint 15 |
| Rollback procedure | — | H23 | Before Sprint 15 |
| Terms of service | — | H32 | Before Sprint 15 |
