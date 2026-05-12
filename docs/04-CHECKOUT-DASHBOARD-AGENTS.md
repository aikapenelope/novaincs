# Nova — Checkout Flow, Dashboard UX, Inventory-Catalog Sync & Agent Intelligence Data

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Optimal checkout and payment experience, WhatsApp location handling, responsive dashboard design, inventory-availability sync, sales tracking and monthly summaries, and the complete data surface available to AI agents.

---

## Table of Contents

1. [Checkout & Payment Flow: The Optimal Experience](#1-checkout--payment-flow-the-optimal-experience)
2. [WhatsApp Location Sharing: What's Feasible](#2-whatsapp-location-sharing-whats-feasible)
3. [Dashboard: Mobile-First, Desktop-Ready](#3-dashboard-mobile-first-desktop-ready)
4. [Inventory-Catalog Availability Sync](#4-inventory-catalog-availability-sync)
5. [Sales Tracking & Monthly Summaries](#5-sales-tracking--monthly-summaries)
6. [Agent Intelligence: Complete Data Surface](#6-agent-intelligence-complete-data-surface)
7. [Feature Tier Classification](#7-feature-tier-classification)

---

## 1. Checkout & Payment Flow: The Optimal Experience

### 1.1 Design Principles

The checkout must work on a mid-range Android phone with intermittent 3G/4G. Every extra field reduces conversion by 3-7% (Baymard Institute 2026). Mobile cart abandonment is 85%. The goal: **from "I want this" to "I paid" in under 90 seconds**.

Key constraints:
- No Stripe, no PayPal, no card processing in Venezuela
- Payment is Pago Movil (bank transfer) or Zelle (USD transfer) — both require the buyer to switch apps, pay, and come back with proof
- The checkout must survive the app-switch (buyer leaves PWA -> opens banking app -> returns)

### 1.2 The Flow: 5 Screens

#### Screen 1: Cart (Sticky Bottom Bar)

The buyer browses the catalog. Every product has an "Add to Cart" button in the thumb zone (bottom 40% of screen). A sticky bottom bar shows the running total:

```
┌─────────────────────────────────────────┐
│  [Product grid / list]                  │
│                                         │
│  Camisa Polo Azul         $15    [+ 🛒] │
│  Zapatos Nike Air         $45    [+ 🛒] │
│  Bolso Coach              $62    [+ 🛒] │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  🛒 3 productos          Total: $122    │
│  [Ver carrito →]                        │
└─────────────────────────────────────────┘
```

The sticky bar is always visible. Tapping "Ver carrito" opens the cart detail.

#### Screen 2: Cart Detail

```
┌─────────────────────────────────────────┐
│  Tu carrito                             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📷 Camisa Polo Azul    $15     │    │
│  │    [- 1 +]              $15     │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 📷 Zapatos Nike Air    $45     │    │
│  │    [- 1 +]              $45     │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 📷 Bolso Coach         $62     │    │
│  │    [- 1 +]              $62     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Subtotal:                    $122.00   │
│  Delivery:                      $5.00   │
│  ─────────────────────────────────      │
│  TOTAL:                      $127.00    │
│  (Bs 5,080.00 a tasa BCV)              │
│                                         │
├─────────────────────────────────────────┤
│  [Continuar al pago →]                  │
└─────────────────────────────────────────┘
```

Key details:
- Quantity adjustable with +/- buttons (44px minimum touch target)
- Shows both USD and Bs equivalent (auto-calculated from BCV rate)
- Delivery cost shown if merchant has delivery zones configured; otherwise hidden
- Total always visible in sticky bottom bar

#### Screen 3: Buyer Info (Minimal)

```
┌─────────────────────────────────────────┐
│  ¿A quien enviamos?                     │
│                                         │
│  Nombre *                               │
│  ┌─────────────────────────────────┐    │
│  │ Maria Rodriguez                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  WhatsApp *                             │
│  ┌──────┬──────────────────────────┐    │
│  │ +58  │ 4141234567               │    │
│  └──────┴──────────────────────────┘    │
│  (numeric keyboard auto-triggered)      │
│                                         │
│  ¿Como quieres recibir tu pedido?       │
│  ┌─────────────────────────────────┐    │
│  │ ○ Delivery (+ $5)              │    │
│  │ ○ Retiro en tienda (gratis)    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [If delivery selected:]               │
│  Zona / Direccion                       │
│  ┌─────────────────────────────────┐    │
│  │ Chacao, Caracas                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Nota para el vendedor (opcional)       │
│  ┌─────────────────────────────────┐    │
│  │ Talla M por favor               │    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  Total: $127.00                         │
│  [Elegir metodo de pago →]              │
└─────────────────────────────────────────┘
```

**Only 2 required fields**: Name and WhatsApp number. Everything else is optional or conditional. The phone number field triggers the numeric keyboard automatically (`inputmode="tel"`). The +58 country code is pre-filled.

If the buyer has purchased before (cookie match), name and phone are pre-filled from the previous order. One-tap checkout for returning customers.

#### Screen 4: Payment Method Selection

```
┌─────────────────────────────────────────┐
│  ¿Como quieres pagar?                   │
│                                         │
│  Total: $127.00 (Bs 5,080.00)          │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🏦 Pago Movil                   │    │
│  │    Paga desde tu app bancaria   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 💵 Zelle                        │    │
│  │    Transferencia en USD         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 💰 Efectivo                     │    │
│  │    Pago al recibir              │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

When the buyer selects **Pago Movil**:

```
┌─────────────────────────────────────────┐
│  Pago Movil                             │
│                                         │
│  Monto: Bs 5,080.00                    │
│                                         │
│  Datos para pagar:                      │
│  ┌─────────────────────────────────┐    │
│  │ Telefono: 0414-1234567         │    │
│  │ Cedula:   V-12345678           │    │
│  │ Banco:    Banesco              │    │
│  │                    [Copiar todo 📋]│  │
│  └─────────────────────────────────┘    │
│                                         │
│  1. Copia los datos arriba             │
│  2. Abre tu app bancaria              │
│  3. Realiza el Pago Movil             │
│  4. Vuelve aqui y sube el capture     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │    📷 Subir capture de pago     │    │
│  │    (foto o screenshot)          │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Referencia (opcional):                 │
│  ┌─────────────────────────────────┐    │
│  │ 4 ultimos digitos               │    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  [Confirmar pago →]                     │
└─────────────────────────────────────────┘
```

The **"Copiar todo"** button copies all payment data to clipboard in one tap:
```
Pago Movil
Telefono: 04141234567
Cedula: V-12345678
Banco: Banesco
Monto: Bs 5,080.00
```

This is the critical UX innovation. The buyer copies, switches to their banking app, pastes, pays, takes a screenshot, switches back to Nova, uploads the screenshot. The PWA survives the app-switch because it's a web page — it stays in the browser tab.

When the buyer selects **Zelle**:

```
┌─────────────────────────────────────────┐
│  Zelle                                  │
│                                         │
│  Monto: $127.00                         │
│                                         │
│  Datos para pagar:                      │
│  ┌─────────────────────────────────┐    │
│  │ Email: pagos@tienda.com        │    │
│  │              [Copiar email 📋]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Referencia Zelle:                      │
│  ┌─────────────────────────────────┐    │
│  │ Numero de confirmacion          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  📷 Subir capture (opcional)            │
│                                         │
├─────────────────────────────────────────┤
│  [Confirmar pago →]                     │
└─────────────────────────────────────────┘
```

#### Screen 5: Confirmation + WhatsApp

```
┌─────────────────────────────────────────┐
│  ✅ Pedido enviado                       │
│                                         │
│  Pedido #0047                           │
│  Total: $127.00                         │
│  Estado: Pago en verificacion           │
│                                         │
│  El vendedor revisara tu pago y te      │
│  confirmara por WhatsApp.               │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 💬 Enviar pedido por WhatsApp   │    │
│  │    (abre chat con el vendedor)  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📍 Compartir mi ubicacion       │    │
│  │    (para delivery)              │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

The **"Enviar pedido por WhatsApp"** button generates a deep link:

```
https://wa.me/584141234567?text=Hola!%20Acabo%20de%20hacer%20el%20pedido%20%230047%20en%20tu%20tienda.%0A%0A🛒%20Mi%20pedido:%0A-%20Camisa%20Polo%20Azul%20x1%20($15)%0A-%20Zapatos%20Nike%20Air%20x1%20($45)%0A-%20Bolso%20Coach%20x1%20($62)%0A%0A💰%20Total:%20$127.00%0A💳%20Pago:%20Pago%20Movil%20(capture%20enviado)%0A%0ALink%20del%20pedido:%20nova.app/order/abc123
```

Which opens WhatsApp with a pre-filled message:

```
Hola! Acabo de hacer el pedido #0047 en tu tienda.

🛒 Mi pedido:
- Camisa Polo Azul x1 ($15)
- Zapatos Nike Air x1 ($45)
- Bolso Coach x1 ($62)

💰 Total: $127.00
💳 Pago: Pago Movil (capture enviado)

Link del pedido: nova.app/order/abc123
```

The buyer just taps send. The merchant receives a clean, structured order in WhatsApp.

---

## 2. WhatsApp Location Sharing: What's Feasible

### The Limitation

WhatsApp deep links (`wa.me/...?text=...`) can only pre-fill text messages. They **cannot** trigger location sharing, media attachment, or any other WhatsApp feature programmatically. This is a WhatsApp platform restriction — no workaround exists.

### The Solution: Two-Step Approach

**Step 1** (in the confirmation screen): A separate "Compartir mi ubicacion" button that uses the browser's Geolocation API to capture the buyer's coordinates, then stores them in the order record:

```javascript
// When buyer taps "Compartir mi ubicacion"
navigator.geolocation.getCurrentPosition((pos) => {
  // Save to order record
  await fetch('/api/orders/abc123/location', {
    method: 'POST',
    body: JSON.stringify({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    })
  });
  // Show confirmation
  showToast("Ubicacion guardada. El vendedor la vera en su panel.");
});
```

**Step 2** (in the WhatsApp pre-filled message): Add a text line suggesting the buyer share their location:

```
📍 Para delivery, comparteme tu ubicacion en este chat
   (toca el clip 📎 → Ubicacion)
```

This is a gentle prompt, not an automated action. The buyer can share their live location in WhatsApp if they want, or the coordinates captured in Step 1 are already saved in the order.

**Step 3** (in the merchant's dashboard): The order detail shows a mini-map with the buyer's location (if captured via browser) or a note "Ubicacion no compartida — pedir por WhatsApp."

### Why This Works

- The browser geolocation captures coordinates before the buyer leaves the PWA (no dependency on WhatsApp)
- The WhatsApp message includes a friendly prompt for location sharing (social convention, not technical requirement)
- The merchant always has at least the text address from the checkout form
- If the buyer shared browser location, the merchant sees it on a map in their dashboard

---

## 3. Dashboard: Mobile-First, Desktop-Ready

### Design Philosophy

The merchant's PWA is designed as a **mobile-first dashboard** that also works on desktop. Not a desktop dashboard crammed into mobile. The layout adapts:

| Screen Size | Layout | Navigation |
|---|---|---|
| **Mobile** (< 768px) | Single column, bottom tab bar, swipe gestures | Bottom tabs: Home, Catalog, Orders, Clients, More |
| **Tablet** (768-1024px) | Two-column, sidebar + content | Left sidebar collapsed, expandable |
| **Desktop** (> 1024px) | Full dashboard with sidebar, main content, right panel | Left sidebar always visible, right panel for details |

### Mobile Layout (Primary)

```
┌─────────────────────────────────────────┐
│  Buenos dias, Carlos          [🔔] [⚙️] │
├─────────────────────────────────────────┤
│                                         │
│  HOY: $127 vendidos (8 ordenes)         │
│  ████████████░░░░ 63% de tu meta diaria │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🔴 3 pagos por verificar ($89) │    │
│  │ [Verificar ahora →]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 💡 Maria Rodriguez (VIP) vio   │    │
│  │ tus zapatos 4 veces hoy.       │    │
│  │ [Enviar mensaje] [Ignorar]     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ ⚠️ Camisa Polo: quedan 2 uds   │    │
│  │ (se venden 3/semana)           │    │
│  │ [Reabastecer] [Ignorar]        │    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│  🏠    📦    🛒    👥    ⋯             │
│ Home  Catalog Orders Clients More       │
└─────────────────────────────────────────┘
```

### Desktop Layout (Extended)

```
┌──────────┬──────────────────────────────┬──────────────┐
│ SIDEBAR  │  MAIN CONTENT               │ DETAIL PANEL │
│          │                              │              │
│ 🏠 Home  │  [Same as mobile home feed]  │ [Selected    │
│ 📦 Catalog│                              │  item detail]│
│ 🛒 Orders │                              │              │
│ 👥 Clients│                              │ Order #0047  │
│ 💰 Finance│                              │ Maria R.     │
│ 📊 Reports│                              │ $127.00      │
│ ⚙️ Config │                              │ Pago Movil   │
│          │                              │ [Verificar]  │
│          │                              │ [Ver capture]│
│          │                              │              │
└──────────┴──────────────────────────────┴──────────────┘
```

The desktop version shows the same data as mobile but with a three-column layout. The right panel shows details of whatever is selected in the main content area. This is the standard SaaS dashboard pattern (Gmail, HubSpot, Notion).

### Implementation

Nuxt 3 with Tailwind CSS handles responsive layouts natively. The same Vue components render differently based on screen size using Tailwind breakpoints (`sm:`, `md:`, `lg:`). No separate codebase for mobile vs desktop.

```vue
<!-- Example: Bottom tabs on mobile, sidebar on desktop -->
<nav class="fixed bottom-0 w-full md:hidden">
  <!-- Mobile bottom tabs -->
</nav>
<aside class="hidden md:block md:w-64 md:fixed md:left-0">
  <!-- Desktop sidebar -->
</aside>
```

---

## 4. Inventory-Catalog Availability Sync

### How It Works

The catalog PWA (buyer-facing) and the inventory system (merchant-facing) are connected in real-time:

```
Merchant updates stock (PWA dashboard)
  → PostgreSQL: products.stock = new_value
  → Redis: invalidate cache for this product
  → Catalog PWA: next page load shows updated availability
```

### What the Buyer Sees

| Stock Level | Display | Behavior |
|---|---|---|
| stock > 5 | Nothing special (product shown normally) | Add to cart works |
| stock 1-5 | "Quedan pocas unidades" badge | Add to cart works, creates urgency |
| stock = 0 | "Agotado" badge, grayed out | Add to cart disabled, "Notificarme" button appears |
| product inactive | Not shown in catalog | Hidden entirely |

### Real-Time vs Near-Real-Time

The catalog doesn't need WebSocket real-time updates (that would be expensive for thousands of concurrent visitors). Instead:

- Product pages are **server-rendered (SSR)** with a 60-second cache. When a buyer loads a product page, they see stock data that's at most 60 seconds old.
- When stock hits 0, a **Redis pub/sub event** immediately invalidates the cache for that product. The next page load shows "Agotado" with no delay.
- The "Add to Cart" action does a **real-time stock check** before confirming. If stock dropped to 0 between page load and cart addition, the buyer sees "Lo sentimos, este producto se acaba de agotar."

This means: browsing is cached (fast, cheap), but purchasing is real-time (accurate, prevents overselling).

### Inventory Adjustment When Order is Placed

```
Buyer completes checkout
  → Order created (status: pending_payment)
  → Stock RESERVED (not decremented yet)
  → If payment verified within 24h: stock DECREMENTED
  → If payment not verified in 24h: reservation RELEASED, stock restored
```

This prevents the scenario where a buyer "buys" but never pays, and the product shows as unavailable for other buyers.

---

## 5. Sales Tracking & Monthly Summaries

### How Sales Are Recorded

When the merchant marks an order as "paid" (either manually or via OCR auto-verification), the system records:

```sql
-- Simplified: what happens when merchant taps "Marcar como pagado"
BEGIN;
  UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $order_id;
  UPDATE products SET stock = stock - quantity WHERE id = $product_id;  -- for each item
  INSERT INTO payments (order_id, amount, method, verified_at, ...) VALUES (...);
  -- Materialized views auto-refresh via trigger
COMMIT;
```

### What the Merchant Sees: Sales Summary

**Daily view** (in the Home feed):

```
HOY: $127.00 (8 ordenes)
Ayer: $95.00 (6 ordenes)
Esta semana: $487.00 (32 ordenes)
```

**Weekly view** (in Finance tab):

```
┌─────────────────────────────────────────┐
│  Semana del 5-11 Mayo                   │
│                                         │
│  Ventas totales:        $487.00         │
│  Ordenes:               32              │
│  Ticket promedio:       $15.22          │
│  Productos vendidos:    47 unidades     │
│                                         │
│  Top productos:                         │
│  1. Camisa Polo Azul    12 uds  $180    │
│  2. Zapatos Nike Air     4 uds  $180    │
│  3. Bolso Coach          2 uds  $124    │
│                                         │
│  Top clientes:                          │
│  1. Maria Rodriguez     5 ordenes $203  │
│  2. Juan Perez          3 ordenes $108  │
│                                         │
│  Metodos de pago:                       │
│  Pago Movil: 78%  |  Zelle: 15%        │
│  Efectivo: 7%                           │
│                                         │
│  Cuentas por cobrar: $89 (3 pendientes) │
└─────────────────────────────────────────┘
```

**Monthly summary** (auto-generated on the 1st of each month):

```
┌─────────────────────────────────────────┐
│  📊 RESUMEN DE ABRIL 2026               │
│                                         │
│  VENTAS                                 │
│  Total vendido:         $1,847.00       │
│  Ordenes completadas:   124             │
│  Ticket promedio:       $14.90          │
│  Dia mas fuerte:        Sabado ($312)   │
│  Dia mas flojo:         Lunes ($89)     │
│                                         │
│  CLIENTES                               │
│  Clientes activos:      47              │
│  Clientes nuevos:       12              │
│  Clientes recurrentes:  35 (74%)        │
│  Tasa de recompra:      2.6 ordenes/mes │
│                                         │
│  INVENTARIO                             │
│  Productos activos:     83              │
│  Productos agotados:    4               │
│  Productos sin venta:   12              │
│  Valor del inventario:  $2,340          │
│                                         │
│  FINANZAS                               │
│  Ingresos:              $1,847.00       │
│  Cuentas por cobrar:    $134.00         │
│  Margen estimado:       42%             │
│  (si el comerciante registra costos)    │
│                                         │
│  COMPARATIVA                            │
│  vs Marzo: +12% ventas, +8% clientes   │
│                                         │
│  [Descargar PDF] [Compartir por WA]     │
└─────────────────────────────────────────┘
```

The monthly summary is generated by the Finance Agent on the 1st of each month at 8am (or whenever the merchant usually opens the app). It's delivered as a card in the Home feed and can be downloaded as PDF or shared via WhatsApp (useful for sending to their accountant).

---

## 6. Agent Intelligence: Complete Data Surface

This is the complete inventory of data that the AI agents have access to for each merchant. This is what enables them to provide exceptional, personalized service.

### 6.1 Customer Data (per customer)

| Data Point | Source | Agent Use |
|---|---|---|
| Name | Checkout form / WhatsApp | Personalize messages |
| Phone / BSUID | Checkout / WhatsApp webhook | Contact, identity matching |
| Total lifetime value ($) | Computed from orders | Prioritize high-value customers |
| Total orders | Computed | Frequency analysis |
| Average order value | Computed | Upsell/cross-sell targeting |
| Days since last purchase | Computed | Churn risk detection |
| Purchase frequency (avg days between orders) | Computed | Predict next purchase window |
| RFM score (1-5, 1-5, 1-5) | Computed hourly | Segment assignment |
| Segment (VIP, At Risk, etc.) | Computed from RFM | Action prioritization |
| Favorite categories | Computed from order history | Product recommendations |
| Favorite products | Computed from order history | Restock suggestions |
| Catalog visit count (last 30d) | Behavioral tracking (beacon) | Interest level detection |
| Products viewed (last 30d) | Behavioral tracking | "Maria is looking at shoes" |
| Cart abandonment count | Behavioral tracking | Recovery campaigns |
| Last catalog visit timestamp | Behavioral tracking | Recency of interest |
| Preferred payment method | Computed from orders | Checkout optimization |
| Delivery zone | Checkout form | Delivery logistics |
| Merchant notes | Manual entry | Context for personalization |
| Custom tags | Manual entry | Custom segmentation |
| First seen source | Auto-detected | Acquisition channel analysis |
| Referral source (if shared link) | URL parameter tracking | "Came from Maria's shared link" |

### 6.2 Product Data (per product)

| Data Point | Source | Agent Use |
|---|---|---|
| Name, description, SKU | Merchant input | Content generation, search |
| Price (USD and Bs) | Merchant input + rate calc | Pricing intelligence |
| Cost (if entered) | Merchant input | Margin calculation |
| Margin % | Computed (price - cost) / price | Profitability alerts |
| Current stock | Inventory system | Availability, restock alerts |
| Sales velocity (units/week) | Computed from orders | Demand forecasting |
| Days of stock remaining | stock / velocity | Urgency of restock |
| Total units sold (all time) | Computed | Product ranking |
| Total revenue generated | Computed | Product profitability |
| View count (last 30d) | Behavioral tracking | Interest vs conversion gap |
| View-to-purchase ratio | views / purchases | Conversion optimization |
| Cart addition count | Behavioral tracking | Intent signal |
| Cart abandonment rate | cart adds / completions | Price sensitivity indicator |
| Last sold date | Order history | Staleness detection |
| Days since last sale | Computed | Dead stock detection |
| Category | Merchant input | Category-level analytics |
| Image quality score | AI assessment | "This photo could be improved" |
| Semantic embedding | pgvector | Similar product search |

### 6.3 Financial Data (aggregate)

| Data Point | Source | Agent Use |
|---|---|---|
| Today's revenue | Orders marked as paid | Daily briefing |
| This week's revenue | Aggregated | Weekly trend |
| This month's revenue | Aggregated | Monthly summary |
| Revenue by day of week | Historical pattern | "Saturdays are your best day" |
| Revenue by hour of day | Historical pattern | "Most sales happen 2-6pm" |
| Average daily revenue | Historical | Anomaly detection |
| Revenue trend (up/down/flat) | 7-day moving average | "Sales are trending up 12%" |
| Accounts receivable total | Unpaid orders | Cash flow awareness |
| Accounts receivable aging | Days since order | "3 payments overdue > 5 days" |
| Payment method distribution | Order history | "78% pay with Pago Movil" |
| Average time to payment | Order to payment timestamp | "Customers pay in avg 2.3 hours" |
| Estimated monthly margin | Revenue * avg margin % | Profitability tracking |
| Exchange rate (current + history) | External API | Price update suggestions |
| Exchange rate impact on margin | Computed | "Rate change reduced margin by 3%" |

### 6.4 Operational Data

| Data Point | Source | Agent Use |
|---|---|---|
| Catalog total products | Product count | Completeness assessment |
| Products with images | Product count with images | "12 products have no photo" |
| Products with AI-enhanced images | Image processing log | "Improve 8 more photos?" |
| Catalog visit count (today/week/month) | Behavioral tracking | Traffic trends |
| Unique visitors (today/week/month) | Visitor deduplication | Reach measurement |
| Top traffic sources | Referral tracking | "60% from Instagram, 30% WhatsApp" |
| Conversion rate | Orders / unique visitors | Funnel health |
| Average session duration | Behavioral tracking | Engagement quality |
| Bounce rate | Single-page visits / total | Catalog quality indicator |
| Onboarding completion % | Onboarding step tracking | "You haven't set up payments yet" |
| Feature usage | App analytics | Progressive feature disclosure |
| Last app open timestamp | Session tracking | Engagement/churn risk |

### 6.5 What Agents Do With This Data

Each agent combines multiple data points to generate specific, actionable intelligence:

**Sales Agent examples**:
- Combines `customer.days_since_last_purchase` + `customer.purchase_frequency` + `customer.products_viewed` to detect: "Maria normally buys every 12 days. It's been 18 days. She viewed shoes 4 times yesterday. High probability she wants to buy but hasn't decided. Suggest: send 5% coupon on shoes."
- Combines `product.view_to_purchase_ratio` + `product.cart_abandonment_rate` to detect: "Nike Air shoes have 45 views but only 2 purchases. Cart abandonment is 80%. Likely price objection. Suggest: temporary 10% discount."

**Finance Agent examples**:
- Combines `daily_revenue` + `average_daily_revenue` + `day_of_week_pattern` to detect: "Today's revenue ($45) is 60% below your Tuesday average ($112). Unusual. Check if something is wrong with the catalog or if there's a connectivity issue."
- Combines `accounts_receivable_aging` + `customer.segment` to prioritize: "Juan owes $45 for 5 days (At Risk customer). Maria owes $89 for 1 day (VIP customer). Suggest: remind Juan first (higher churn risk), Maria will likely pay on her own."

**Content Agent examples**:
- Combines `product.stock` + `product.margin` + `product.days_since_last_sale` to detect: "Bolso Coach: 8 in stock, 52% margin, no sale in 14 days. High-margin dead stock. Suggest: generate promotional image and share on catalog."
- Combines `catalog.top_traffic_sources` + `product.view_count` to suggest: "Your most viewed products come from Instagram traffic. Generate Instagram-optimized images for your top 5 products?"

**Support Agent examples**:
- Combines `merchant.onboarding_step` + `merchant.feature_usage` + `merchant.last_app_open` to detect: "Merchant hasn't opened the app in 3 days. They completed onboarding but never set up payment methods. Suggest: send push notification with payment setup guide."

---

## 7. Feature Tier Classification

### Core (All Plans)
- Catalog with product management
- Checkout flow (Pago Movil, Zelle, Efectivo)
- Payment screenshot upload + manual verification
- Basic inventory (stock tracking)
- Order management (mark as paid, track status)
- Customer list (auto-populated from orders)
- Daily sales total
- WhatsApp deep link checkout
- Image enhancement (limited: 10/month on free plan)

### Premium (Paid Plans)
- Full Micro-CRM with RFM scoring and segments
- AI daily briefing and smart feed
- OCR auto-verification of payment screenshots
- Financial dashboard with weekly/monthly summaries
- Inventory alerts (low stock, dead stock)
- Broadcast messages by segment (via WhatsApp API)
- Unlimited image enhancement
- Google Sheets import/export
- Exchange rate auto-update
- PDF export of monthly summary

### Future / Premium+
- QR codes per product (physical-digital bridge)
- "Modo Vitrina" Instagram image generator
- Wakit WhatsApp integration (full conversation access)
- AI autonomous mode (agents act without approval)
- Voice commands
- Delivery zone management with map
- Cross-merchant recommendations
- Price benchmarking (network feature)
- Embedded finance (capital advances, insurance)
- Public API access
- Accountant export format
