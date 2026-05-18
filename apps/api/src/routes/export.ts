import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, gte, count, desc } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders, orderItems } from "../db/schema/orders.js";
import { products } from "../db/schema/products.js";
import { tenants } from "../db/schema/tenants.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const exportRoutes = new Hono<AppEnv>();

// All export routes require auth + tenant context.
exportRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const exportSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// --- Helpers ---

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- Routes ---

/**
 * GET /export/pdf — Generate a PDF sales report.
 *
 * Returns a PDF document with:
 *   - Store name and report period
 *   - Revenue summary (total, order count, average)
 *   - Top 10 products by revenue
 *   - Payment method breakdown
 */
exportRoutes.get("/pdf", zValidator("query", exportSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();
  const since = daysAgo(days);

  // Fetch data in parallel.
  const [tenant, revenueTotals, topProducts, paymentBreakdown] = await Promise.all([
    db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
        totalOrders: count(),
        avgOrder: sql<string>`COALESCE(AVG(${orders.totalUsd}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
        ),
      )
      .then((r) => r[0]),
    db
      .select({
        productName: orderItems.productName,
        revenue: sql<string>`COALESCE(SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}), 0)::text`,
        quantity: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
        ),
      )
      .groupBy(orderItems.productName)
      .orderBy(sql`SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}) DESC`)
      .limit(10),
    db
      .select({
        method: orders.paymentMethod,
        revenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
        orderCount: count(),
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
          sql`${orders.paymentMethod} IS NOT NULL`,
        ),
      )
      .groupBy(orders.paymentMethod),
  ]);

  const storeName = tenant?.name ?? "Tienda";
  const periodLabel = `Ultimos ${days} dias`;
  const now = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Generate PDF.
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfReady = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Header.
  doc.fontSize(20).text(storeName, { align: "center" });
  doc.fontSize(12).text(`Reporte de Ventas — ${periodLabel}`, { align: "center" });
  doc.fontSize(10).text(`Generado: ${now}`, { align: "center" });
  doc.moveDown(2);

  // Revenue summary.
  doc.fontSize(14).text("Resumen de Ingresos");
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(`Ingresos totales: $${parseFloat(revenueTotals?.totalRevenue ?? "0").toFixed(2)}`);
  doc.text(`Pedidos verificados: ${revenueTotals?.totalOrders ?? 0}`);
  doc.text(`Valor promedio por pedido: $${parseFloat(revenueTotals?.avgOrder ?? "0").toFixed(2)}`);
  doc.moveDown(1.5);

  // Top products.
  if (topProducts.length > 0) {
    doc.fontSize(14).text("Top Productos por Ingreso");
    doc.moveDown(0.5);
    for (const p of topProducts) {
      doc
        .fontSize(10)
        .text(`  ${p.productName} — $${parseFloat(p.revenue).toFixed(2)} (${p.quantity} unidades)`);
    }
    doc.moveDown(1.5);
  }

  // Payment methods.
  if (paymentBreakdown.length > 0) {
    const methodLabels: Record<string, string> = {
      pago_movil: "Pago Movil",
      zelle: "Zelle",
      cash_on_delivery: "Efectivo",
    };
    doc.fontSize(14).text("Metodos de Pago");
    doc.moveDown(0.5);
    for (const pm of paymentBreakdown) {
      const label = methodLabels[pm.method ?? ""] ?? pm.method ?? "Otro";
      doc
        .fontSize(10)
        .text(`  ${label}: $${parseFloat(pm.revenue).toFixed(2)} (${pm.orderCount} pedidos)`);
    }
  }

  doc.end();

  const pdfBuffer = await pdfReady;

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-ventas-${days}d.pdf"`,
    },
  });
});

/**
 * GET /export/excel — Generate an Excel (CSV) sales export.
 *
 * Returns a CSV file with all verified orders for the period.
 * CSV is used instead of XLSX to avoid heavy dependencies — the merchant
 * can open it in Excel, Google Sheets, or any spreadsheet app.
 */
exportRoutes.get("/excel", zValidator("query", exportSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();
  const since = daysAgo(days);

  const verifiedOrders = await db
    .select({
      orderNumber: orders.orderNumber,
      buyerName: orders.buyerName,
      buyerPhone: orders.buyerPhone,
      totalUsd: orders.totalUsd,
      totalBs: orders.totalBs,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      deliveryMethod: orders.deliveryMethod,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, since),
      ),
    )
    .orderBy(desc(orders.createdAt));

  // Build CSV.
  const headers = [
    "Numero",
    "Comprador",
    "Telefono",
    "Total USD",
    "Total Bs",
    "Metodo de Pago",
    "Estado",
    "Entrega",
    "Fecha",
  ];

  const methodLabels: Record<string, string> = {
    pago_movil: "Pago Movil",
    zelle: "Zelle",
    cash_on_delivery: "Efectivo",
  };

  const statusLabels: Record<string, string> = {
    verified: "Verificado",
    preparing: "Preparando",
    shipped: "Enviado",
    delivered: "Entregado",
  };

  const rows = verifiedOrders.map((o) => [
    o.orderNumber,
    `"${(o.buyerName ?? "").replace(/"/g, '""')}"`,
    o.buyerPhone ?? "",
    o.totalUsd,
    o.totalBs ?? "",
    methodLabels[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "",
    statusLabels[o.status] ?? o.status,
    o.deliveryMethod === "delivery" ? "Delivery" : "Retiro",
    o.createdAt ? new Date(o.createdAt).toLocaleDateString("es-VE") : "",
  ]);

  // BOM for Excel UTF-8 compatibility.
  const bom = "\uFEFF";
  const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${days}d.csv"`,
    },
  });
});
