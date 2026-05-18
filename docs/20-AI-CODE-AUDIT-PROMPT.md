# Prompt Maestro: Auditoría Exhaustiva de Código Generado por IA

> **Propósito**: Este documento contiene un prompt estructurado para ejecutar una auditoría de producción sobre cualquier codebase generado parcial o totalmente por IA. Está calibrado para los patrones de fallo más comunes documentados en investigaciones de 2025-2026.
> **Última actualización**: Mayo 2026
> **Basado en**: CodeRabbit State of AI Code Report (2025), Apiiro Security Research (2025), Sherlock Forensics AI Audit Checklist (2026), arXiv Survey of Bugs in AI-Generated Code (2024), Kusari AppSec Report (2026).

---

## El Prompt

```
Eres un auditor de seguridad y calidad de código senior. Vas a realizar una auditoría exhaustiva de este codebase que fue generado parcial o totalmente por IA (Claude, GPT, Cursor, Copilot).

Tu auditoría debe cubrir las 12 categorías de fallo más comunes en código generado por IA, documentadas en investigaciones de 2025-2026. Para cada categoría, debes:
1. Buscar activamente instancias del problema en el código
2. Clasificar la severidad (Crítica / Alta / Media / Baja)
3. Proporcionar la ubicación exacta (archivo:línea)
4. Explicar el impacto en producción
5. Proponer el fix concreto

---

## CATEGORÍA 1: Fallos Lógicos Silenciosos (60% de bugs en código IA)

Los modelos replican patrones estadísticos sin entender la lógica subyacente. Busca:

- [ ] Off-by-one errors en loops, slices, y paginación
- [ ] Condiciones de borde no manejadas: arrays vacíos, null, undefined, 0, NaN, strings vacíos
- [ ] Variables reasignadas incorrectamente (el modelo "olvida" el estado previo)
- [ ] Lógica invertida en condicionales (> vs >=, && vs ||)
- [ ] Funciones que retornan el tipo correcto pero el valor incorrecto
- [ ] Comparaciones de igualdad incorrectas (== vs ===, comparar objetos por referencia)
- [ ] Cálculos matemáticos con errores de precisión floating-point no manejados
- [ ] Regex incorrectos que matchean más o menos de lo esperado

**Test**: Para cada función crítica, verifica mentalmente: ¿qué pasa con input vacío? ¿Con un solo elemento? ¿Con el máximo posible? ¿Con caracteres especiales?

---

## CATEGORÍA 2: Seguridad — Inyección y Validación de Input (CWE-89, CWE-79, CWE-78)

La IA omite validación defensiva si no se le pide explícitamente. Busca:

- [ ] SQL construido con concatenación de strings (en vez de queries parametrizadas)
- [ ] Uso de `innerHTML`, `v-html`, `dangerouslySetInnerHTML` con datos de usuario
- [ ] Comandos shell construidos con input de usuario (`exec()`, `spawn()`, template literals)
- [ ] Paths de archivos construidos con input sin sanitizar (path traversal `../../`)
- [ ] Deserialización insegura de datos no confiables
- [ ] Inputs numéricos no validados usados en queries (limit, offset sin bounds)
- [ ] Headers HTTP inyectables (CRLF injection)
- [ ] Redirect URLs no validadas (open redirect)

---

## CATEGORÍA 3: Autenticación y Autorización (IDOR — el error #1 de IA)

La IA verifica autenticación pero NO autorización. El usuario A puede acceder a datos del usuario B. Busca:

- [ ] Endpoints que verifican "está logueado" pero no "es dueño de este recurso"
- [ ] IDs de recursos tomados de la URL sin verificar ownership (IDOR)
- [ ] Rutas admin protegidas solo por flags client-side
- [ ] Tokens sin expiración o con expiración excesiva (>24h para access tokens)
- [ ] Rate limiting ausente en login, password reset, OTP
- [ ] Session IDs que no rotan después de privilege escalation
- [ ] API keys con permisos excesivos (all-or-nothing en vez de scoped)
- [ ] Middleware de auth aplicado inconsistentemente (algunas rutas sin protección)

---

## CATEGORÍA 4: Manejo de Errores y Resiliencia

La IA genera el "happy path" y deja los errores sin manejar. Busca:

- [ ] `try/catch` vacíos o que solo hacen `console.log` (swallow errors)
- [ ] Errores de DB que se propagan como 500 genéricos sin información útil
- [ ] Stack traces expuestos en respuestas de producción
- [ ] Promesas sin `.catch()` o `await` sin try/catch
- [ ] Operaciones que fallan silenciosamente sin notificar al usuario
- [ ] Timeouts no configurados en HTTP requests, DB queries, Redis operations
- [ ] Falta de circuit breaker en llamadas a servicios externos
- [ ] Errores de autenticación que revelan si el usuario existe ("user not found" vs "wrong password")
- [ ] Operaciones parcialmente completadas sin rollback (transacciones incompletas)

---

## CATEGORÍA 5: Concurrencia y Race Conditions

La IA no piensa en concurrencia. Cada request se trata como si fuera el único. Busca:

- [ ] Read-then-write sin lock (leer stock, verificar, luego decrementar — otro request puede pasar entre medio)
- [ ] Operaciones no atómicas en datos compartidos (Redis INCR vs GET+SET)
- [ ] Upserts implementados como SELECT + INSERT (race entre ambos)
- [ ] Contadores incrementados sin atomicidad
- [ ] Cache invalidation sin considerar requests concurrentes (thundering herd)
- [ ] Cron jobs que pueden ejecutarse en paralelo sin idempotencia
- [ ] Webhooks procesados sin deduplicación (el mismo evento llega 2 veces)

---

## CATEGORÍA 6: Dependencias y Supply Chain

La IA hallucina paquetes que no existen (slopsquatting). Busca:

- [ ] Paquetes importados que no existen en npm/pypi (el modelo los inventó)
- [ ] Versiones de paquetes desactualizadas con CVEs conocidos
- [ ] Typosquatting: `lodahs` en vez de `lodash`, `axois` en vez de `axios`
- [ ] Dependencias con licencias incompatibles (GPL en proyecto MIT)
- [ ] Paquetes abandonados (sin commits en >2 años, sin maintainer)
- [ ] Dependencias transitivas no auditadas
- [ ] Lock files desincronizados con package.json

---

## CATEGORÍA 7: Secrets y Configuración

La IA embebe secrets de su training data. Busca:

- [ ] API keys hardcodeadas (patrones: `sk-`, `AKIA`, `ghp_`, `xoxb-`)
- [ ] Passwords en código fuente o config files commiteados
- [ ] `.env` files en git history (commiteados y luego removidos)
- [ ] Secrets en logs (request bodies logueados con passwords/tokens)
- [ ] Valores por defecto inseguros que nunca se cambian en producción
- [ ] Secrets compartidos entre ambientes (dev key usada en prod)
- [ ] JWTs con secrets débiles o predecibles

---

## CATEGORÍA 8: Performance y Escalabilidad

La IA genera código O(n²) que funciona con 10 items pero colapsa con 10,000. Busca:

- [ ] Queries N+1 (loop que hace una query por iteración)
- [ ] SELECT * sin límite en tablas que crecen
- [ ] String concatenation en loops (en vez de array.join)
- [ ] Nested loops donde un Map/Set resolvería en O(n)
- [ ] Falta de paginación en endpoints que retornan listas
- [ ] Falta de índices en columnas usadas en WHERE/JOIN
- [ ] Carga de datos completos cuando solo se necesita un campo
- [ ] Operaciones síncronas bloqueantes en el event loop (Node.js)
- [ ] Memory leaks: event listeners no removidos, closures que retienen referencias

---

## CATEGORÍA 9: Consistencia y Mantenibilidad

La IA genera código inconsistente porque cada prompt es independiente. Busca:

- [ ] Patrones diferentes para la misma operación en distintos archivos
- [ ] Naming inconsistente (camelCase en un archivo, snake_case en otro)
- [ ] Código duplicado que debería ser una función compartida
- [ ] Imports no utilizados
- [ ] Variables declaradas pero nunca leídas
- [ ] Comentarios que contradicen el código (el código cambió, el comentario no)
- [ ] TODO/FIXME/HACK sin tracking
- [ ] Archivos que exceden 500 líneas sin razón estructural

---

## CATEGORÍA 10: Testing y Cobertura

La IA genera tests que pasan pero no prueban nada útil. Busca:

- [ ] Tests que solo verifican el happy path (sin edge cases)
- [ ] Tests que mockean tanto que no prueban nada real
- [ ] Tests que dependen de orden de ejecución
- [ ] Tests que no limpian estado (afectan otros tests)
- [ ] Assertions débiles: `toBeDefined()` en vez de verificar el valor
- [ ] Tests de integración que no verifican side effects (DB, cache, queues)
- [ ] Rutas críticas sin ningún test (auth, payments, stock)
- [ ] Tests que pasan con datos hardcodeados pero fallarían con datos reales

---

## CATEGORÍA 11: Observabilidad y Debugging

La IA no piensa en "¿cómo debuggeo esto a las 3am?". Busca:

- [ ] Operaciones críticas sin logging (pagos, cambios de estado, auth failures)
- [ ] Logs sin contexto (no incluyen userId, tenantId, requestId)
- [ ] Falta de correlation IDs entre servicios
- [ ] Métricas no expuestas (latencia, error rate, queue depth)
- [ ] Health checks superficiales (retornan 200 sin verificar dependencias)
- [ ] Errores que se pierden en workers/cron jobs sin alerting
- [ ] Falta de audit trail para operaciones sensibles

---

## CATEGORÍA 12: Configuración de Infraestructura

La IA genera configs que funcionan en dev pero fallan en prod. Busca:

- [ ] CORS configurado como `*` (permite cualquier origen)
- [ ] TLS/SSL no enforced (HTTP permitido en producción)
- [ ] Cookies sin flags Secure/HttpOnly/SameSite
- [ ] Headers de seguridad ausentes (HSTS, X-Frame-Options, CSP)
- [ ] Puertos expuestos innecesariamente
- [ ] Containers corriendo como root
- [ ] Volúmenes sin permisos restrictivos
- [ ] Backups sin verificación de restore
- [ ] Secrets en environment variables visibles en `docker inspect`

---

## FORMATO DE REPORTE

Para cada hallazgo, usa este formato:

### [CATEGORÍA-#] Título descriptivo

| Campo | Valor |
|-------|-------|
| **Severidad** | Crítica / Alta / Media / Baja |
| **Archivo** | `path/to/file.ts:123` |
| **Impacto** | Qué pasa si se explota en producción |
| **Evidencia** | El código problemático (snippet) |
| **Fix** | El código corregido o la estrategia de remediación |
| **Categoría CWE** | Si aplica (ej: CWE-89 SQL Injection) |

---

## PRIORIZACIÓN

Al final del reporte, clasifica todos los hallazgos en:

1. **Bloquean lanzamiento** — Deben corregirse antes de exponer a usuarios reales
2. **Corregir antes de 100 usuarios** — Riesgo aceptable temporalmente
3. **Deuda técnica** — Corregir en los próximos 2-3 sprints
4. **Mejora continua** — Nice to have, no urgente

---

## CONTEXTO ESPECÍFICO PARA ESTE PROYECTO

Este es un SaaS multi-tenant (Qyne/Nova) para comerciantes venezolanos. Stack:
- Backend: Hono (TypeScript) + Drizzle ORM + PostgreSQL 16 con RLS
- Frontend: Nuxt 3 (Vue 3) — Dashboard + Catalog PWA
- Auth: Clerk JWT
- Cache/Queues: Redis 7 + BullMQ
- AI: Agno AgentOS + OpenRouter (GPT-4o-mini, GPT-5-mini)
- Storage: Cloudflare R2
- Deploy: Coolify + Traefik en Hetzner

Puntos críticos específicos a auditar:
- RLS (Row Level Security): ¿hay algún path donde un tenant puede ver datos de otro?
- Payment verification: ¿se puede manipular el monto o el estado de un pago?
- Stock reservation: ¿hay race conditions en el checkout concurrente?
- AI agents: ¿pueden los prompts del usuario inyectar instrucciones al agente?
- File uploads: ¿se valida tipo, tamaño, y contenido de las imágenes?
- Rate limiting: ¿hay endpoints públicos sin rate limit?
- Webhook/callback URLs: ¿se valida que sean HTTPS y no apunten a IPs internas?

Ejecuta la auditoría completa. Sé exhaustivo. No asumas que algo está bien porque "se ve correcto". Verifica cada claim del código contra la implementación real.
```

---

## Estadísticas de referencia (2025-2026)

Estas cifras justifican por qué esta auditoría es necesaria:

| Métrica | Valor | Fuente |
|---------|-------|--------|
| % de código IA con vulnerabilidades de seguridad | 29-45% | Diffray Research 2025, Kusari 2026 |
| Bugs por PR en código IA vs humano | 1.7x más | CodeRabbit State of AI Code 2025 |
| Issues críticos/mayores en código IA | 1.3-1.7x más | CodeRabbit 2025 |
| Errores de lógica y correctitud | 75% más en IA | CodeRabbit 2025 |
| Fallos lógicos silenciosos (pasan tests, fallan en edge cases) | 60% de todos los bugs IA | arXiv Survey 2024 |
| Paquetes recomendados que no existen (hallucinated) | 19.7% | Diffray 2025 |
| Vulnerabilidades XSS en código IA vs humano | 2.74x más | CodeRabbit 2025 |
| I/O excesivo en código IA vs humano | ~8x más | CodeRabbit 2025 |
| Errores de concurrencia en código IA | 2x más | CodeRabbit 2025 |
| Nuevos security findings por mes (repos con IA) | 10,000+ | Apiiro 2025 |
| Privilege escalation paths (incremento con IA) | +322% | Apiiro 2025 |
| Architectural design flaws (incremento con IA) | +153% | Apiiro 2025 |
| Issues de legibilidad en código IA vs humano | 3x más | CodeRabbit 2025 |

---

## Cómo usar este prompt

1. **Copia el prompt completo** (sección entre los triple backticks)
2. **Adjunta el codebase** o proporciona acceso al repositorio
3. **Ejecuta contra cada módulo** por separado si el codebase es grande (>50 archivos)
4. **Prioriza los hallazgos** usando la clasificación del final
5. **Crea issues/tickets** para cada hallazgo con severidad Alta o Crítica
6. **Re-audita después de fixes** para verificar que no se introdujeron regresiones

### Frecuencia recomendada

- **Antes de cada lanzamiento mayor** (nuevo sprint, nueva feature grande)
- **Después de sesiones largas de coding con IA** (>4 horas continuas)
- **Cuando se integra código de un nuevo contributor/agente**
- **Trimestralmente** como auditoría de mantenimiento

---

## Herramientas complementarias

| Herramienta | Qué detecta | Cómo integrar |
|-------------|-------------|---------------|
| `pyright` / `tsc --noEmit` | Type errors, property hallucinations | CI obligatorio |
| `eslint` / `ruff` | Patterns inseguros, imports no usados | CI obligatorio |
| `prettier` | Inconsistencias de formato | CI obligatorio |
| `npm audit` / `pnpm audit` | CVEs en dependencias | CI + Dependabot |
| `gitleaks` / `trufflehog` | Secrets en código/history | Pre-commit hook |
| `semgrep` | SAST (SQL injection, XSS, IDOR patterns) | CI recomendado |
| `SonarCloud` | Quality gate (bugs, code smells, duplication) | Ya integrado |
| `OWASP ZAP` | DAST (vulnerabilidades en runtime) | Pre-launch |

---

## Referencias

1. CodeRabbit. "State of AI vs. Human Code Generation Report." 2025. https://www.coderabbit.ai/blog/ai-vs-human-code
2. Apiiro. "AI-Generated Code Security Findings." September 2025.
3. Gao et al. "A Survey of Bugs in AI-Generated Code." arXiv:2512.05239. December 2024.
4. Kusari. "Application Security in Practice Report." 2026. https://www.kusari.dev/blog/ai-coding-assistants-in-2026
5. Sherlock Forensics. "The 2026 AI Code Audit Checklist." April 2026.
6. Diffray. "LLM Hallucinations in AI Code Review." December 2025.
7. Stack Overflow Blog. "Are bugs and incidents inevitable with AI coding agents?" January 2026.
8. Ranger. "Common Bugs in AI-Generated Code and Fixes." February 2026.
