# Nova — Standalone Infrastructure

> **Status**: Planning Phase  
> **Last Updated**: May 2026

---

## Principle

Nova is a standalone product with its own infrastructure. It does not share servers, databases, or deployment pipelines with any other project. Each service owns its data and can be managed independently.

---

## Infrastructure

Nova runs on a single Hetzner CX42 VPS (8 vCPU, 16 GB RAM, 160 GB NVMe) in Ashburn, Virginia. The catalog PWA runs on Cloudflare Workers at the edge. Images are stored on Cloudflare R2.

See **doc 12 (COMPLETE-STACK-EXPLAINED.md)** for the full production architecture: 8 containers, 3 PostgreSQL instances, docker-compose.yml, memory budget, and failure scenarios.

---

## Deployment

Dokploy manages deployment on the CX42. Git-based auto-deploy via Traefik for SSL/routing. The catalog deploys separately to Cloudflare Workers via `wrangler deploy`.

---

## Scaling Path

| Scale | Infrastructure | Cost |
|---|---|---|
| 0-3,000 merchants | 1x CX42 | ~$71/mo |
| 3,000-8,000 | 1x CX52 (16 vCPU, 32 GB) | ~$100/mo |
| 8,000-25,000 | 2 servers (app + databases) | ~$130/mo |
| 25,000-100,000 | 3 servers (app + DB primary + DB replica) | ~$200/mo |
| 100,000+ | Citus cluster or regional separation | ~$500/mo |

No architectural rewrites needed at any scale. Each upgrade is: more RAM, more CPU, or separate a service to its own server.
