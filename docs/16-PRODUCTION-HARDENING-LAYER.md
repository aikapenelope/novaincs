# Nova — Production Hardening Layer

> **Status**: Deferred (post-MVP)  
> **Last Updated**: May 2026  
> **Scope**: Operational hardening items to implement after core product features are stable. These are not blockers for MVP or beta launch — they are the layer that turns a working product into a resilient production system.

---

## Priority Legend

- **CRITICAL**: Must be done before charging real money (before paid launch, ~Sprint 15)
- **HIGH**: Should be done before 100+ merchants
- **MEDIUM**: Should be done before 1,000 merchants
- **LOW**: Nice to have, do when capacity allows

---

## 1. Observability & Monitoring

| # | Item | Priority | Description |
|---|---|---|---|
| H1 | Centralized logging | CRITICAL | Aggregate logs from 8 containers into a single viewer. Options: Loki + Grafana (self-hosted, ~200MB RAM), or Dokploy's built-in log viewer for basic needs. Docker json-file driver with `max-size: 10m, max-file: 3` for rotation. |
| H2 | Application metrics | HIGH | Track API latency (P50/P95/P99), error rate, BullMQ queue depth, PostgreSQL active connections, Redis memory usage. Prometheus + Grafana or lightweight alternative (Netdata). |
| H3 | Alerting | CRITICAL | Alerts for: server down, disk > 80%, memory > 85%, API error rate > 5%, BullMQ dead letter queue > 0, PostgreSQL connections > 80, payment verification failures. UptimeRobot (free) for basic uptime + Grafana alerts for metrics. |
| H4 | Distributed tracing | MEDIUM | OpenTelemetry integration across nova-api, nova-agents, and Prefect. Agno has built-in OTel support. Needed to debug cross-service issues (e.g., "why did this agent call take 10 seconds?"). Jaeger or Grafana Tempo as backend. |
| H5 | Health check dashboard | HIGH | Beyond Docker health checks: a `/status` endpoint that reports the health of all dependencies (pg-nova, pg-agno, pg-prefect, Redis, Cloudflare R2, external APIs). Visible in Dokploy or a simple status page. |
| H6 | Error tracking | HIGH | Sentry (free tier: 5K events/month) or equivalent for structured error capture with stack traces, user context, and breadcrumbs. Critical for debugging production issues without SSH access. |

---

## 2. Disaster Recovery & Backup

| # | Item | Priority | Description |
|---|---|---|---|
| H7 | Offsite backups | CRITICAL | Copy daily pg_dump files to Cloudflare R2 or Hetzner Object Storage. The current setup stores backups on the same server — if the server dies, backups die too. Automate with a cron job + `rclone` or `aws s3 cp` (R2 is S3-compatible). |
| H8 | Backup restore testing | CRITICAL | Monthly test: restore pg-nova backup to a temporary PostgreSQL instance, verify data integrity, drop the instance. Document the procedure. If you haven't tested a restore, you don't have backups. |
| H9 | RTO/RPO definition | HIGH | Define Recovery Time Objective (how long can we be down?) and Recovery Point Objective (how much data can we lose?). Suggested starting point: RTO = 1 hour, RPO = 24 hours (daily backups). |
| H10 | Disaster recovery runbook | HIGH | Step-by-step document: "The server is gone. How do I get Nova running again?" Covers: provision new CX43, run setup.sh, restore backups, update DNS, verify services. Test it once. |
| H11 | pg-agno backup frequency | MEDIUM | Currently weekly. If agents accumulate valuable per-merchant memory, consider daily. Agent data is regenerable but losing 7 days of memory degrades agent quality. |

---

## 3. Security Hardening

| # | Item | Priority | Description |
|---|---|---|---|
| H12 | Restrict SSH access | HIGH | Current firewall allows SSH from `0.0.0.0/0`. Restrict to known IPs (developer IPs, CI/CD runner IPs). Update Pulumi firewall resource. If IPs are dynamic, use a VPN or Tailscale. |
| H13 | Fail2ban | HIGH | Install fail2ban on the server to block IPs after 5 failed SSH attempts. Simple, effective, low overhead. |
| H14 | API rate limiting | CRITICAL | Hono middleware with Redis-backed rate limiter. Per-tenant limits (e.g., 100 req/min for Starter, 500 for Pro). Per-IP limits for unauthenticated endpoints (catalog, checkout). Prevents abuse and cost spikes. |
| H15 | Security headers | HIGH | Traefik or Hono middleware: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`. Standard web security headers. |
| H16 | Docker image scanning | MEDIUM | Scan Docker images for known vulnerabilities before deployment. Trivy (free, runs in CI) or Snyk. Catches outdated base images with CVEs. |
| H17 | Dependency scanning | MEDIUM | `npm audit` and `pip audit` in CI pipeline. Block deploys with critical vulnerabilities. |
| H18 | Secrets rotation plan | MEDIUM | Define rotation schedule for: PostgreSQL passwords (quarterly), API keys (annually or on compromise), Redis password (quarterly). Document the rotation procedure for each secret. Pulumi ESC supports versioning. |
| H19 | Unattended upgrades config | HIGH | Verify `unattended-upgrades` is configured for security updates only (not full upgrades). Check `/etc/apt/apt.conf.d/50unattended-upgrades`. |
| H20 | Database SSL | MEDIUM | Enable SSL for PostgreSQL connections. Currently containers communicate over Docker network (trusted), but SSL adds defense-in-depth. |

---

## 4. CI/CD & Deployment

| # | Item | Priority | Description |
|---|---|---|---|
| H21 | Staging environment | HIGH | A second Hetzner server (CX22, ~€4/mo) or local Docker Compose that mirrors production. All deploys go to staging first, then production after verification. |
| H22 | Deployment strategy | HIGH | Define: recreate (current, causes downtime) vs rolling (zero-downtime). With Dokploy + Docker Compose, rolling updates require `deploy.update_config` in Swarm mode. For MVP, recreate with a 30-second maintenance window is acceptable. |
| H23 | Rollback procedure | CRITICAL | Document: "The last deploy broke something. How do I go back?" Options: revert git commit + redeploy, or keep last 3 Docker images tagged and `docker compose` with previous tag. |
| H24 | Database migration strategy | HIGH | Define: who reviews migrations? How are they applied in production? Suggested: Drizzle Kit generates SQL, developer reviews, CI applies to staging, manual approval for production. Never auto-migrate in production. |
| H25 | Smoke tests post-deploy | HIGH | After every deploy: automated curl to `/health`, verify API responds, verify catalog loads, verify dashboard loads. Fail = auto-rollback or alert. |

---

## 5. Performance & Load Testing

| # | Item | Priority | Description |
|---|---|---|---|
| H26 | Performance baseline | HIGH | Run k6 load test against staging: measure requests/second, P95 latency, error rate under load. Establish baseline before beta launch. |
| H27 | PostgreSQL tuning validation | MEDIUM | Verify `shared_buffers`, `effective_cache_size`, `work_mem` are optimal for actual workload. Use `pg_stat_statements` to identify slow queries. |
| H28 | BullMQ capacity test | MEDIUM | Test: how many concurrent image processing jobs can run without degrading API latency? This determines if workers need their own container. |
| H29 | Connection pool limits | MEDIUM | Verify Drizzle connection pool size vs PostgreSQL `max_connections`. With nova-api + nova-agents both connecting to pg-nova, ensure total pool doesn't exceed max_connections. |
| H30 | Scaling trigger criteria | MEDIUM | Define concrete thresholds: "Upgrade to CX53 when CPU > 70% sustained for 1 hour OR P95 latency > 500ms OR disk > 70%." |

---

## 6. Compliance & Legal

| # | Item | Priority | Description |
|---|---|---|---|
| H31 | Privacy policy | CRITICAL | Required before beta launch. Covers: what data is collected, how it's used, who has access, data retention, right to deletion. Needs lawyer review. |
| H32 | Terms of service | CRITICAL | Required before charging. Covers: service availability, liability, payment terms, account termination. |
| H33 | Data retention policy | HIGH | Define: how long are behavioral events kept? Payment screenshots? Agent memories? Suggested: events 2 years, screenshots 1 year, agent memories indefinite (merchant's data). |
| H34 | Right to deletion | HIGH | Implement: merchant requests account deletion -> all their data (products, customers, orders, events, agent memories) is permanently deleted within 30 days. Required by most privacy laws. |
| H35 | Payment screenshot handling | MEDIUM | Screenshots contain bank account numbers and personal data. Define: encrypted at rest (R2 supports SSE), access restricted to merchant + system, auto-delete after verification + 90 days. |

---

## 7. Suggested Implementation Timeline

These items should be woven into the existing sprint roadmap at the appropriate points:

| When | Items | Rationale |
|---|---|---|
| **Sprint 5** (first production deploy) | H23 (rollback), H25 (smoke tests) | Can't deploy without knowing how to undo |
| **Sprint 9** (beta launch) | H3 (alerting), H7 (offsite backups), H14 (rate limiting), H31 (privacy policy) | Can't have real users without basic monitoring, backup safety, and legal coverage |
| **Sprint 12** (agents in production) | H4 (tracing), H6 (error tracking) | Agents add cross-service complexity that needs observability |
| **Sprint 15** (paid launch) | H8 (restore testing), H10 (runbook), H12 (SSH restrict), H24 (migration strategy), H32 (terms of service) | Can't charge money without recovery procedures and legal terms |
| **After 100 merchants** | H1 (centralized logging), H2 (metrics), H5 (health dashboard), H21 (staging), H26 (load baseline) | Operational maturity for growing user base |
| **After 500 merchants** | H16-H20 (security scanning, rotation, DB SSL), H27-H30 (performance tuning), H33-H35 (compliance) | Scale-appropriate hardening |

---

## 8. Cost Estimate for Hardening Layer

| Item | Tool | Monthly Cost |
|---|---|---|
| Monitoring (Grafana + Loki + Prometheus) | Self-hosted on same server | $0 (~300MB RAM) |
| Error tracking | Sentry free tier | $0 |
| Offsite backups | Cloudflare R2 (~5GB) | $0.08 |
| Staging server | Hetzner CX22 | ~€4 |
| Security scanning | Trivy (CI) | $0 |
| Uptime monitoring | UptimeRobot free | $0 |
| **Total** | | **~€4/month** |

The hardening layer adds minimal cost. The investment is engineering time, not infrastructure spend.
