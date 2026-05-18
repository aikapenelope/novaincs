import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { products } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import {
  isGoogleSheetsConfigured,
  getServiceAccountEmail,
  previewSpreadsheet,
  readSheetData,
  extractSpreadsheetId,
} from "../services/google-sheets.js";

export const importRoutes = new Hono<AppEnv>();

// All import routes require auth + tenant context.
importRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const previewSchema = z.object({
  url: z.string().min(10).max(500),
});

const readSheetSchema = z.object({
  spreadsheetId: z.string().min(10).max(200),
  sheetTitle: z.string().min(1).max(200),
});

const executeImportSchema = z.object({
  spreadsheetId: z.string().min(10).max(200),
  sheetTitle: z.string().min(1).max(200),
  mapping: z.array(
    z.object({
      sheetColumn: z.string().min(1).max(200),
      targetField: z.enum([
        "name",
        "description",
        "priceUsd",
        "priceBs",
        "costUsd",
        "sku",
        "stock",
        "category",
        "status",
      ]),
    }),
  ),
  maxRows: z.number().int().min(1).max(2000).default(500),
});

// --- Routes ---

/**
 * GET /import/google-sheets/config — Check if Google Sheets is configured
 * and return the service account email for the merchant to share with.
 */
importRoutes.get("/google-sheets/config", async (c) => {
  const configured = isGoogleSheetsConfigured();
  return c.json({
    data: {
      configured,
      serviceAccountEmail: configured ? getServiceAccountEmail() : null,
      instructions: configured
        ? [
            "1. Abre tu Google Sheet",
            `2. Haz clic en "Compartir" y agrega: ${getServiceAccountEmail()}`,
            '3. Dale permiso de "Lector"',
            "4. Copia la URL del Google Sheet y pegala aqui",
          ]
        : ["Google Sheets import is not configured. Contact support."],
    },
  });
});

/**
 * POST /import/google-sheets/preview — Preview a Google Sheet.
 * Returns the spreadsheet title and list of sheets with dimensions.
 * The merchant uses this to choose which sheet to import from.
 */
importRoutes.post("/google-sheets/preview", zValidator("json", previewSchema), async (c) => {
  if (!isGoogleSheetsConfigured()) {
    return c.json(
      { error: { message: "Google Sheets import is not configured", status: 503 } },
      503,
    );
  }

  const { url } = c.req.valid("json");

  try {
    const preview = await previewSpreadsheet(url);
    return c.json({ data: preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to access spreadsheet";

    // Distinguish between auth errors (not shared) and other errors.
    if (message.includes("403") || message.includes("permission")) {
      return c.json(
        {
          error: {
            message: `No tienes acceso a este Google Sheet. Asegurate de compartirlo con: ${getServiceAccountEmail()}`,
            status: 403,
          },
        },
        403,
      );
    }
    if (message.includes("404") || message.includes("not found")) {
      return c.json(
        { error: { message: "Google Sheet no encontrado. Verifica la URL.", status: 404 } },
        404,
      );
    }

    return c.json({ error: { message, status: 400 } }, 400);
  }
});

/**
 * POST /import/google-sheets/read — Read data from a specific sheet.
 * Returns headers and first 20 rows as preview for column mapping.
 */
importRoutes.post("/google-sheets/read", zValidator("json", readSheetSchema), async (c) => {
  if (!isGoogleSheetsConfigured()) {
    return c.json(
      { error: { message: "Google Sheets import is not configured", status: 503 } },
      503,
    );
  }

  const { spreadsheetId, sheetTitle } = c.req.valid("json");

  try {
    // Read only 20 rows for preview.
    const data = await readSheetData(spreadsheetId, sheetTitle, 20);
    return c.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read sheet";
    return c.json({ error: { message, status: 400 } }, 400);
  }
});

/**
 * POST /import/google-sheets/execute — Execute the import with column mapping.
 * Reads the full sheet, maps columns to product fields, validates, and inserts.
 * Returns a summary of imported, skipped, and failed rows.
 */
importRoutes.post("/google-sheets/execute", zValidator("json", executeImportSchema), async (c) => {
  if (!isGoogleSheetsConfigured()) {
    return c.json(
      { error: { message: "Google Sheets import is not configured", status: 503 } },
      503,
    );
  }

  const tenantId = c.get("tenantId")!;
  const { spreadsheetId, sheetTitle, mapping, maxRows } = c.req.valid("json");
  const db = getDb();

  // Read the full sheet data.
  const sheetData = await readSheetData(spreadsheetId, sheetTitle, maxRows);

  if (sheetData.rows.length === 0) {
    return c.json({ error: { message: "La hoja esta vacia", status: 400 } }, 400);
  }

  // Build a mapping lookup: targetField -> sheetColumn.
  const fieldMap = new Map<string, string>();
  for (const m of mapping) {
    fieldMap.set(m.targetField, m.sheetColumn);
  }

  // Require at least a name mapping.
  if (!fieldMap.has("name")) {
    return c.json(
      { error: { message: 'El campo "name" es obligatorio en el mapeo', status: 400 } },
      400,
    );
  }

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (let i = 0; i < sheetData.rows.length; i++) {
    const row = sheetData.rows[i]!;
    const rowNum = i + 2; // +2 because row 1 is headers, data starts at row 2.

    try {
      const name = row[fieldMap.get("name")!]?.trim();
      if (!name) {
        results.skipped++;
        continue;
      }

      // Generate slug from name.
      const slug =
        name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `product-${Date.now()}`;

      const uniqueSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      // Map optional fields.
      const desc = fieldMap.has("description") ? row[fieldMap.get("description")!] : undefined;

      let parsedPriceUsd: string | undefined;
      const priceUsdRaw = fieldMap.has("priceUsd") ? row[fieldMap.get("priceUsd")!] : undefined;
      if (priceUsdRaw) {
        const parsed = parseFloat(
          String(priceUsdRaw)
            .replace(/[^0-9.,-]/g, "")
            .replace(",", "."),
        );
        if (!isNaN(parsed) && parsed >= 0) parsedPriceUsd = parsed.toFixed(2);
      }

      let parsedPriceBs: string | undefined;
      const priceBsRaw = fieldMap.has("priceBs") ? row[fieldMap.get("priceBs")!] : undefined;
      if (priceBsRaw) {
        const parsed = parseFloat(
          String(priceBsRaw)
            .replace(/[^0-9.,-]/g, "")
            .replace(",", "."),
        );
        if (!isNaN(parsed) && parsed >= 0) parsedPriceBs = parsed.toFixed(2);
      }

      let parsedCostUsd: string | undefined;
      const costUsdRaw = fieldMap.has("costUsd") ? row[fieldMap.get("costUsd")!] : undefined;
      if (costUsdRaw) {
        const parsed = parseFloat(
          String(costUsdRaw)
            .replace(/[^0-9.,-]/g, "")
            .replace(",", "."),
        );
        if (!isNaN(parsed) && parsed >= 0) parsedCostUsd = parsed.toFixed(2);
      }

      const skuVal = fieldMap.has("sku") ? row[fieldMap.get("sku")!]?.trim() : undefined;

      let parsedStock: number | undefined;
      const stockRaw = fieldMap.has("stock") ? row[fieldMap.get("stock")!] : undefined;
      if (stockRaw) {
        const parsed = parseInt(String(stockRaw), 10);
        if (!isNaN(parsed) && parsed >= 0) parsedStock = parsed;
      }

      let parsedStatus: string | undefined;
      const statusRaw = fieldMap.has("status") ? row[fieldMap.get("status")!] : undefined;
      if (statusRaw) {
        const normalized = statusRaw.trim().toLowerCase();
        if (["active", "draft", "archived"].includes(normalized)) {
          parsedStatus = normalized;
        }
      }

      await db.insert(products).values({
        tenantId,
        name,
        slug: uniqueSlug,
        description: desc?.trim(),
        priceUsd: parsedPriceUsd,
        priceBs: parsedPriceBs,
        costUsd: parsedCostUsd,
        sku: skuVal || undefined,
        stock: parsedStock ?? 0,
        status: parsedStatus ?? "active",
      });
      results.imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Truncate long error messages.
      const short = message.length > 100 ? message.slice(0, 100) + "..." : message;
      results.errors.push(`Fila ${rowNum}: ${short}`);
      if (results.errors.length >= 20) {
        results.errors.push("... (mas errores omitidos)");
        break;
      }
    }
  }

  return c.json({
    data: {
      totalRows: sheetData.totalRows,
      imported: results.imported,
      skipped: results.skipped,
      failed: results.errors.length,
      errors: results.errors,
    },
  });
});
