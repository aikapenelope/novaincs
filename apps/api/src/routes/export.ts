import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, gte, count, desc } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders, orderItems } from "../db/schema/orders.js";
import { tenants } from "../db/schema/tenants.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const exportRoutes = new Hono<AppEnv>();

exportRoutes.use("*", authMiddleware, tenantMiddleware);

const exportSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtCurrency(val: string | number): string {
  const num = typeof val === "string" ? Number.parseFloat(val) : val;
  return `$${num.toFixed(2)}`;
}

// --- PDF Helper: draw a KPI box ---
function drawKpiBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  value: string,
  label: string,
  subtitle?: string,
  subtitleColor?: string,
) {
  doc.save();
  doc.roundedRect(x, y, w, 70, 4).fill("#f9fafb").stroke("#e5e7eb");
  doc
    .fillColor("#111827")
    .fontSize(20)
    .font("Helvetica-Bold")
    .text(value, x + 12, y + 14, { width: w - 24 });
  doc
    .fillColor("#6b7280")
    .fontSize(8)
    .font("Helvetica")
    .text(label, x + 12, y + 40, { width: w - 24 });
  if (subtitle) {
    doc
      .fillColor(subtitleColor ?? "#6b7280")
      .fontSize(7)
      .text(subtitle, x + 12, y + 52, { width: w - 24 });
  }
  doc.restore();
}

// --- PDF Helper: draw a table ---
function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  headers: { text: string; width: number; align?: "left" | "right" }[],
  rows: string[][],
): number {
  const rowHeight = 20;
  const headerHeight = 22;

  // Header background
  const totalWidth = headers.reduce((sum, h) => sum + h.width, 0);
  doc.save();
  doc.rect(x, y, totalWidth, headerHeight).fill("#f3f4f6");

  // Header text
  let colX = x;
  for (const h of headers) {
    doc
      .fillColor("#6b7280")
      .fontSize(7)
      .font("Helvetica-Bold")
      .text(h.text.toUpperCase(), colX + 8, y + 7, {
        width: h.width - 16,
        align: h.align ?? "left",
      });
    colX += h.width;
  }

  // Rows
  let rowY = y + headerHeight;
  for (const row of rows) {
    // Alternate row background
    if (rows.indexOf(row) % 2 === 1) {
      doc.rect(x, rowY, totalWidth, rowHeight).fill("#fafafa");
    }

    colX = x;
    for (let i = 0; i < headers.length; i++) {
      doc
        .fillColor("#111827")
        .fontSize(8)
        .font("Helvetica")
        .text(row[i] ?? "", colX + 8, rowY + 6, {
          width: headers[i]!.width - 16,
          align: headers[i]!.align ?? "left",
        });
      colX += headers[i]!.width;
    }
    rowY += rowHeight;
  }

  // Bottom border
  doc
    .moveTo(x, rowY)
    .lineTo(x + totalWidth, rowY)
    .strokeColor("#e5e7eb")
    .lineWidth(0.5)
    .stroke();

  doc.restore();
  return rowY + 8;
}

/**
 * GET /export/pdf — Professional sales report.
 */
exportRoutes.get("/pdf", zValidator("query", exportSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();
  const since = daysAgo(days);
  const prevSince = daysAgo(days * 2);

  const [tenant, currentTotals, prevTotals, topProducts, paymentBreakdown] = await Promise.all([
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
      .select({ totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text` })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, prevSince),
          sql`${orders.createdAt} < ${since}`,
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

  const storeName = tenant?.name ?? "Mi Tienda";
  const revenue = Number.parseFloat(currentTotals?.totalRevenue ?? "0");
  const prevRevenue = Number.parseFloat(prevTotals?.totalRevenue ?? "0");
  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const orderCount = currentTotals?.totalOrders ?? 0;
  const avgTicket = Number.parseFloat(currentTotals?.avgOrder ?? "0");
  const now = new Date().toLocaleDateString("es-VE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const methodLabels: Record<string, string> = {
    pago_movil: "Pago Movil",
    zelle: "Zelle",
    cash_on_delivery: "Efectivo",
    binance: "Binance",
  };

  // --- Generate PDF ---
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const pdfReady = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Header
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .text(storeName.toUpperCase(), 40, 40);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#374151")
    .text(`Reporte de Ventas — Ultimos ${days} dias`, 40, 60);
  doc.fontSize(8).fillColor("#9ca3af").text(`Generado: ${now}`, 40, 74);

  // Separator line
  doc.moveTo(40, 92).lineTo(572, 92).strokeColor("#e5e7eb").lineWidth(1).stroke();

  // KPI Boxes (3 across)
  const boxW = 170;
  const boxGap = 11;
  const boxY = 104;

  const changeText =
    revenueChange !== 0
      ? `${revenueChange > 0 ? "+" : ""}${revenueChange.toFixed(1)}% vs anterior`
      : "";
  const changeColor = revenueChange >= 0 ? "#059669" : "#dc2626";

  drawKpiBox(
    doc,
    40,
    boxY,
    boxW,
    fmtCurrency(revenue),
    "Ingresos totales",
    changeText,
    changeColor,
  );
  drawKpiBox(doc, 40 + boxW + boxGap, boxY, boxW, String(orderCount), "Pedidos verificados");
  drawKpiBox(doc, 40 + (boxW + boxGap) * 2, boxY, boxW, fmtCurrency(avgTicket), "Ticket promedio");

  let cursorY = boxY + 90;

  // Top Products
  if (topProducts.length > 0) {
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("Top Productos", 40, cursorY);
    cursorY += 18;

    const productRows = topProducts.map((p) => [p.productName, fmtCurrency(p.revenue), p.quantity]);

    cursorY = drawTable(
      doc,
      40,
      cursorY,
      [
        { text: "Producto", width: 280 },
        { text: "Ingreso", width: 120, align: "right" },
        { text: "Unidades", width: 132, align: "right" },
      ],
      productRows,
    );

    cursorY += 16;
  }

  // Payment Methods
  if (paymentBreakdown.length > 0) {
    const totalPmRevenue = paymentBreakdown.reduce((s, p) => s + Number.parseFloat(p.revenue), 0);

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#111827")
      .text("Metodos de Pago", 40, cursorY);
    cursorY += 18;

    const pmRows = paymentBreakdown.map((pm) => {
      const rev = Number.parseFloat(pm.revenue);
      const pct = totalPmRevenue > 0 ? ((rev / totalPmRevenue) * 100).toFixed(0) : "0";
      return [
        methodLabels[pm.method ?? ""] ?? pm.method ?? "Otro",
        fmtCurrency(rev),
        `${pct}%`,
        String(pm.orderCount),
      ];
    });

    cursorY = drawTable(
      doc,
      40,
      cursorY,
      [
        { text: "Metodo", width: 200 },
        { text: "Ingreso", width: 120, align: "right" },
        { text: "%", width: 80, align: "right" },
        { text: "Pedidos", width: 132, align: "right" },
      ],
      pmRows,
    );
  }

  // Footer
  doc
    .fontSize(7)
    .font("Helvetica")
    .fillColor("#9ca3af")
    .text("Solo incluye pedidos con pago verificado.", 40, 720, { align: "center", width: 532 });

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
 * GET /export/excel — CSV sales export.
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

  const headers = [
    "Numero",
    "Comprador",
    "Telefono",
    "Total USD",
    "Total Bs",
    "Metodo",
    "Estado",
    "Entrega",
    "Fecha",
  ];

  const methodLabels: Record<string, string> = {
    pago_movil: "Pago Movil",
    zelle: "Zelle",
    cash_on_delivery: "Efectivo",
    binance: "Binance",
  };

  const rows = verifiedOrders.map((o) => [
    o.orderNumber,
    `"${(o.buyerName ?? "").replace(/"/g, '""')}"`,
    o.buyerPhone ?? "",
    o.totalUsd,
    o.totalBs ?? "",
    methodLabels[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "",
    o.status,
    o.deliveryMethod === "delivery" ? "Delivery" : "Retiro",
    o.createdAt ? new Date(o.createdAt).toLocaleDateString("es-VE") : "",
  ]);

  const bom = "\uFEFF";
  const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${days}d.csv"`,
    },
  });
});
