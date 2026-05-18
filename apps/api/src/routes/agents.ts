import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { requirePlanFeature } from "../middleware/plan-gate.js";

export const agentsRoutes = new Hono<AppEnv>();

agentsRoutes.use("*", authMiddleware, tenantMiddleware);
agentsRoutes.use("*", requirePlanFeature("ai_agents"));

const chatSchema = z.object({
  agentId: z.enum([
    "nova-finance-agent",
    "nova-sales-agent",
    "nova-content-agent",
    "nova-support-agent",
  ]),
  message: z.string().min(1).max(5000),
  context: z.record(z.unknown()).optional(),
});

/**
 * POST /agents/chat — Send a message to an AI agent.
 *
 * Proxies the request to the nova-agents container (Agno AgentOS).
 * The agent responds based on its role and the provided context.
 * Requires Pro or Business plan (ai_agents feature).
 */
agentsRoutes.post("/chat", zValidator("json", chatSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { agentId, message, context } = c.req.valid("json");

  const agentsUrl = process.env.NOVA_AGENTS_URL || "http://nova-agents:8100";

  try {
    const response = await fetch(`${agentsUrl}/v1/playground/agents/${agentId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        user_id: tenantId,
        session_id: `${tenantId}-${agentId}`,
        ...(context ? { additional_context: context } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[agents] Agent ${agentId} error: ${response.status} ${errorText}`);
      return c.json(
        {
          error: {
            message: "El agente no pudo procesar tu solicitud. Intenta de nuevo.",
            status: 502,
          },
        },
        502,
      );
    }

    const result = await response.json();
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[agents] Failed to reach agents service: ${msg}`);
    return c.json({ error: { message: "Servicio de agentes no disponible.", status: 503 } }, 503);
  }
});

/**
 * GET /agents/list — List available agents and their status.
 */
agentsRoutes.get("/list", async (c) => {
  const agentsUrl = process.env.NOVA_AGENTS_URL || "http://nova-agents:8100";

  try {
    const response = await fetch(`${agentsUrl}/agents`);
    if (!response.ok) {
      return c.json({ data: { agents: [], status: "unavailable" } });
    }
    const result = await response.json();
    return c.json({ data: result });
  } catch {
    return c.json({ data: { agents: [], status: "unavailable" } });
  }
});
