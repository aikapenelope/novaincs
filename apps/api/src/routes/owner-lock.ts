import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenants } from "../db/schema/tenants.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const ownerLockRoutes = new Hono<AppEnv>();
ownerLockRoutes.use("*", authMiddleware, tenantMiddleware);

const BCRYPT_ROUNDS = 10;
const pinSchema = z
  .string()
  .length(4, "La clave debe ser de 4 digitos")
  .regex(/^\d{4}$/, "La clave debe ser de 4 digitos");

ownerLockRoutes.get("/status", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();
  const [tenant] = await db
    .select({ ownerPinHash: tenants.ownerPinHash })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return c.json({ data: { enabled: !!tenant?.ownerPinHash } });
});

ownerLockRoutes.post(
  "/setup",
  zValidator("json", z.object({ pin: pinSchema, currentPin: pinSchema.optional() })),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const { pin, currentPin } = c.req.valid("json");
    const db = getDb();

    const [tenant] = await db
      .select({ ownerPinHash: tenants.ownerPinHash })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant?.ownerPinHash) {
      if (!currentPin)
        return c.json(
          { error: { message: "Debes ingresar la clave actual para cambiarla", status: 400 } },
          400,
        );
      const isValid = await bcrypt.compare(currentPin, tenant.ownerPinHash);
      if (!isValid)
        return c.json({ error: { message: "Clave actual incorrecta", status: 403 } }, 403);
    }

    const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    await db.update(tenants).set({ ownerPinHash: hash }).where(eq(tenants.id, tenantId));
    return c.json({ data: { enabled: true } });
  },
);

ownerLockRoutes.post("/verify", zValidator("json", z.object({ pin: pinSchema })), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { pin } = c.req.valid("json");
  const db = getDb();

  const [tenant] = await db
    .select({ ownerPinHash: tenants.ownerPinHash })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.ownerPinHash) return c.json({ data: { valid: true } });
  const isValid = await bcrypt.compare(pin, tenant.ownerPinHash);
  return c.json({ data: { valid: isValid } });
});

ownerLockRoutes.delete("/setup", zValidator("json", z.object({ pin: pinSchema })), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { pin } = c.req.valid("json");
  const db = getDb();

  const [tenant] = await db
    .select({ ownerPinHash: tenants.ownerPinHash })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.ownerPinHash) return c.json({ data: { enabled: false } });
  const isValid = await bcrypt.compare(pin, tenant.ownerPinHash);
  if (!isValid) return c.json({ error: { message: "Clave incorrecta", status: 403 } }, 403);

  await db.update(tenants).set({ ownerPinHash: null }).where(eq(tenants.id, tenantId));
  return c.json({ data: { enabled: false } });
});
