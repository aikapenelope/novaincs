# Coolify + Traefik Routing — Known Bug & Production Solution

> **Status**: Active  
> **Last Updated**: May 2026  
> **Applies to**: Coolify v4.0.0, Traefik v3.6

---

## 1. The Problem

Coolify v4.0.0 has a known bug where it generates incorrect Traefik Docker labels for application routing. When a domain like `https://api.martes.app` is configured in Coolify's UI, it produces:

```
traefik.http.routers.http-0-<id>.rule=Host(``) && PathPrefix(`api.martes.app`)
```

The correct label should be:

```
traefik.http.routers.http-0-<id>.rule=Host(`api.martes.app`)
```

The empty `Host(``)` causes Traefik to reject the router rule entirely, resulting in `503 Service Unavailable` or `no available server` errors.

### References

- [GitHub Issue #5813](https://github.com/coollabsio/coolify/issues/5813) — First report (May 2025, v4.0.0-beta.418)
- [GitHub Issue #7092](https://github.com/coollabsio/coolify/issues/7092) — Confirmed (Nov 2025, v4.0.0-beta.434)
- [GitHub Issue #8775](https://github.com/coollabsio/coolify/issues/8775) — Still present (Mar 2026, v4.0.0-beta.462)
- Bug persists in v4.0.0 stable (released April 27, 2026)

---

## 2. The Solution: Traefik File Provider

Traefik supports multiple configuration providers simultaneously. When Docker labels are broken, the **File provider** serves as the authoritative routing configuration. This is a documented, production-grade approach — not a workaround.

### Why File Provider

From the [Traefik File Provider documentation](https://doc.traefik.io/traefik/reference/install-configuration/providers/others/file/):

> "The file provider lets you define the configuration in a YAML or TOML file. [...] The file provider can be a good solution for reusing common elements from other providers."

Traefik's architecture is designed for multiple providers to coexist. The File provider and Docker provider run in parallel. When a File provider defines a router for a domain, it takes effect regardless of what the Docker provider generates. The broken Docker labels produce invalid routers that Traefik rejects (logged as errors), while the File provider's valid routers handle the actual traffic.

### How It Works in Our Setup

Coolify's Traefik is configured with both providers:

```yaml
# /data/coolify/proxy/traefik.yaml (managed by Coolify)
providers:
  docker:
    exposedbydefault: false
  file:
    directory: /traefik/dynamic/
    watch: true
```

Our routing configs live in `/data/coolify/proxy/dynamic/` (mounted as `/traefik/dynamic/` inside the Traefik container). Traefik watches this directory and reloads automatically when files change.

---

## 3. Configuration Files

### API Route (`/data/coolify/proxy/dynamic/qyne-api.yaml`)

```yaml
http:
  routers:
    qyne-api-http:
      rule: "Host(`api.martes.app`)"
      entryPoints:
        - http
      service: qyne-api
    qyne-api-https:
      rule: "Host(`api.martes.app`)"
      entryPoints:
        - https
      service: qyne-api
      tls:
        certResolver: letsencrypt
  services:
    qyne-api:
      loadBalancer:
        servers:
          - url: "http://re6fk4dx8qum7w9v7zh2qer5:3000"
```

### Dashboard Route (`/data/coolify/proxy/dynamic/qyne-dashboard.yaml`)

```yaml
http:
  routers:
    qyne-dashboard-http:
      rule: "Host(`app.martes.app`)"
      entryPoints:
        - http
      service: qyne-dashboard
    qyne-dashboard-https:
      rule: "Host(`app.martes.app`)"
      entryPoints:
        - https
      service: qyne-dashboard
      tls:
        certResolver: letsencrypt
  services:
    qyne-dashboard:
      loadBalancer:
        servers:
          - url: "http://ncsviwrk3w036ged275diea1:3001"
```

### Coolify Panel Route (`/data/coolify/proxy/dynamic/coolify-panel.yaml`)

```yaml
http:
  routers:
    coolify-panel-http:
      rule: "Host(`deploy.martes.app`)"
      entryPoints:
        - http
      service: coolify-panel
    coolify-panel-https:
      rule: "Host(`deploy.martes.app`)"
      entryPoints:
        - https
      service: coolify-panel
      tls:
        certResolver: letsencrypt
  services:
    coolify-panel:
      loadBalancer:
        servers:
          - url: "http://coolify:8080"
```

---

## 4. Why Container Names Are Stable

Coolify has a setting called **"Consistent Container Name"** (`is_consistent_container_name_enabled`) that removes the deployment timestamp from container names. With this enabled:

- **Without**: `re6fk4dx8qum7w9v7zh2qer5-225512790795` (changes every deploy)
- **With**: `re6fk4dx8qum7w9v7zh2qer5` (stable across deploys)

This is critical because the Traefik File provider configs reference containers by name. With consistent names, the configs never need updating between deploys.

This setting is enabled for both applications in the Coolify database:

```sql
SELECT application_id, is_consistent_container_name_enabled
FROM application_settings;
-- Both return true
```

---

## 5. Deploy Flow

1. Developer pushes to `main` on GitHub
2. GitHub sends webhook to `https://deploy.martes.app/webhooks/source/github/events`
3. Coolify receives the webhook, builds Docker images, and deploys new containers
4. New containers get the same names as before (consistent naming)
5. Traefik File provider configs already point to these names — no update needed
6. Traefik routes traffic to the new containers immediately
7. Coolify's broken Docker labels are ignored by Traefik (logged as errors, no impact)

---

## 6. Domain Configuration

All three domains use Cloudflare as DNS proxy (orange cloud):

| Domain | Points to | Service |
|---|---|---|
| `api.martes.app` | Cloudflare proxy -> VPS | Qyne API (Hono) |
| `app.martes.app` | Cloudflare proxy -> VPS | Qyne Dashboard (Nuxt 3) |
| `deploy.martes.app` | Cloudflare proxy -> VPS | Coolify Panel |

TLS is terminated at two levels:
- **Cloudflare**: Client -> Cloudflare (Cloudflare's certificate)
- **Traefik**: Cloudflare -> VPS (Let's Encrypt certificate via ACME)

---

## 7. When Coolify Fixes the Bug

When Coolify releases a version that fixes the Docker label generation:

1. The File provider configs will still work (no conflict)
2. Both Docker labels and File configs will produce valid routers
3. Traefik will use whichever has higher priority (File provider routers can be removed if desired)
4. To verify the fix: check that `docker inspect <container>` shows `Host(`domain`)` instead of `Host(``) && PathPrefix(`domain`)`

No action is needed when the fix lands — the current setup is forward-compatible.

---

## 8. Troubleshooting

### Domains return 503 after deploy

Check if containers are running and on the `coolify` network:

```bash
docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "re6fk4|ncsviwrk"
docker network inspect coolify --format "{{range .Containers}}{{.Name}} {{end}}"
```

### Traefik shows errors in logs

Expected errors from the broken Docker labels (safe to ignore):

```
ERR error="error while parsing rule Host(``) && PathPrefix(`api.martes.app`)"
```

These are from Coolify's broken labels. The File provider handles routing correctly.

### Container names changed

If `is_consistent_container_name_enabled` gets disabled, container names will include timestamps and the File provider configs will break. Verify:

```bash
docker exec coolify-db psql -U coolify -d coolify \
  -c "SELECT application_id, is_consistent_container_name_enabled FROM application_settings;"
```

Both should return `true`.
