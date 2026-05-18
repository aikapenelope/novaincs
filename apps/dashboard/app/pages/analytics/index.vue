<script setup lang="ts">
/**
 * Financial Dashboard — /analytics
 *
 * Shows revenue trends, top products, margins, and payment method breakdown.
 * Uses nuxt-charts (vue-chrts) for modern SVG charts.
 * Data comes from the /analytics API endpoints.
 */
useHead({ title: "Finanzas — Qyne" });

const { get } = useApi();

// --- Types ---

interface RevenueSummary {
  period: { days: number; start: string };
  revenue: { total: string; change: number };
  orders: { total: number; change: number };
  averageOrderValue: string;
}

interface DailyRevenue {
  date: string;
  revenue: string;
  orders: number;
}

interface WeeklyRevenue {
  week: string;
  revenue: string;
  orders: number;
}

interface RevenueData {
  period: { days: number; start: string };
  current: { totalRevenue: string; totalOrders: number };
  previous: { totalRevenue: string; totalOrders: number };
  changePercent: number;
  daily: DailyRevenue[];
  weekly: WeeklyRevenue[];
}

interface TopProduct {
  productId: string;
  productName: string;
  totalRevenue: string;
  totalQuantity: string;
}

interface PaymentMethod {
  method: string;
  label: string;
  revenue: string;
  orders: number;
}

interface MarginProduct {
  productId: string;
  productName: string;
  priceUsd: string | null;
  costUsd: string | null;
  totalRevenue: string;
  totalQuantity: string;
  totalCost: string;
  margin: string;
  marginPercent: number;
}

// --- Data fetching ---

const days = ref(30);

const { data: summaryData } = await useAsyncData("analytics-summary", () =>
  get<RevenueSummary>(`/analytics/summary?days=${days.value}`),
);

const { data: revenueData } = await useAsyncData("analytics-revenue", () =>
  get<RevenueData>(`/analytics/revenue?days=${days.value}`),
);

const { data: topProductsData } = await useAsyncData("analytics-top-products", () =>
  get<TopProduct[]>(`/analytics/products/top?days=${days.value}&limit=10`),
);

const { data: paymentData } = await useAsyncData("analytics-payments", () =>
  get<PaymentMethod[]>(`/analytics/payment-methods?days=${days.value}`),
);

const { data: marginsData } = await useAsyncData("analytics-margins", () =>
  get<MarginProduct[]>(`/analytics/margins?days=${days.value}&limit=10`),
);

// --- Computed ---

const summary = computed(() => summaryData.value as unknown as RevenueSummary | null);
const revenue = computed(() => revenueData.value as unknown as RevenueData | null);
const topProducts = computed(() => (topProductsData.value as unknown as TopProduct[]) ?? []);
const payments = computed(() => (paymentData.value as unknown as PaymentMethod[]) ?? []);
const margins = computed(() => (marginsData.value as unknown as MarginProduct[]) ?? []);

// Chart data for revenue trend (line chart).
const revenueChartData = computed(() => {
  if (!revenue.value?.daily) return [];
  return revenue.value.daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    revenue: parseFloat(d.revenue),
  }));
});

const revenueCategories = computed(() => ({
  revenue: { name: "Ingresos ($)", color: "#3b82f6" },
}));

// Chart data for weekly bars.
const weeklyChartData = computed(() => {
  if (!revenue.value?.weekly) return [];
  return revenue.value.weekly.map((w) => ({
    week: w.week.slice(5), // MM-DD
    revenue: parseFloat(w.revenue),
  }));
});

const weeklyCategories = computed(() => ({
  revenue: { name: "Ingresos ($)", color: "#10b981" },
}));

// Chart data for payment methods (donut).
const paymentChartData = computed(() => {
  return payments.value.map((p) => ({
    label: p.label,
    value: parseFloat(p.revenue),
  }));
});

// --- Helpers ---

function formatCurrency(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  return `$${num.toFixed(2)}`;
}

function changeClass(change: number): string {
  if (change > 0) return "change-positive";
  if (change < 0) return "change-negative";
  return "change-neutral";
}

function changeLabel(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}
</script>

<template>
  <div class="analytics-page">
    <div class="page-header">
      <h1>Finanzas</h1>
      <div class="export-buttons">
        <a :href="`${useApi().apiUrl}/export/pdf?days=${days}`" class="btn-export" target="_blank">
          Exportar PDF
        </a>
        <a
          :href="`${useApi().apiUrl}/export/excel?days=${days}`"
          class="btn-export"
          target="_blank"
        >
          Exportar CSV
        </a>
      </div>
    </div>

    <!-- KPI Cards -->
    <div v-if="summary" class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-label">Ingresos</span>
        <span class="kpi-value">{{ formatCurrency(summary.revenue.total) }}</span>
        <span class="kpi-change" :class="changeClass(summary.revenue.change)">
          {{ changeLabel(summary.revenue.change) }} vs periodo anterior
        </span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Pedidos</span>
        <span class="kpi-value">{{ summary.orders.total }}</span>
        <span class="kpi-change" :class="changeClass(summary.orders.change)">
          {{ changeLabel(summary.orders.change) }} vs periodo anterior
        </span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Valor promedio</span>
        <span class="kpi-value">{{ formatCurrency(summary.averageOrderValue) }}</span>
      </div>
    </div>

    <!-- Revenue Trend -->
    <div v-if="revenueChartData.length > 0" class="chart-section">
      <h2>Tendencia de Ingresos ({{ days }} dias)</h2>
      <AreaChart
        :data="revenueChartData"
        :categories="revenueCategories"
        :height="300"
        :x-formatter="(i: number) => revenueChartData[i]?.date ?? ''"
        x-label="Fecha"
        y-label="USD"
      />
    </div>

    <!-- Weekly Revenue -->
    <div v-if="weeklyChartData.length > 0" class="chart-section">
      <h2>Ingresos Semanales</h2>
      <BarChart
        :data="weeklyChartData"
        :categories="weeklyCategories"
        :height="250"
        :y-axis="['revenue']"
      />
    </div>

    <!-- Two-column: Top Products + Payment Methods -->
    <div class="two-col">
      <!-- Top Products -->
      <div v-if="topProducts.length > 0" class="chart-section">
        <h2>Top Productos</h2>
        <div class="product-table">
          <div class="table-header">
            <span>Producto</span>
            <span>Ingreso</span>
            <span>Unidades</span>
          </div>
          <div v-for="p in topProducts" :key="p.productId" class="table-row">
            <span class="product-name">{{ p.productName }}</span>
            <span class="product-revenue">{{ formatCurrency(p.totalRevenue) }}</span>
            <span class="product-qty">{{ p.totalQuantity }}</span>
          </div>
        </div>
      </div>

      <!-- Payment Methods -->
      <div v-if="payments.length > 0" class="chart-section">
        <h2>Metodos de Pago</h2>
        <div class="payment-list">
          <div v-for="pm in payments" :key="pm.method" class="payment-item">
            <span class="payment-label">{{ pm.label }}</span>
            <span class="payment-value">{{ formatCurrency(pm.revenue) }}</span>
            <span class="payment-orders">{{ pm.orders }} pedidos</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Margins -->
    <div v-if="margins.length > 0" class="chart-section">
      <h2>Margenes por Producto</h2>
      <div class="product-table">
        <div class="table-header margins-header">
          <span>Producto</span>
          <span>Ingreso</span>
          <span>Costo</span>
          <span>Margen</span>
          <span>%</span>
        </div>
        <div v-for="m in margins" :key="m.productId" class="table-row margins-row">
          <span class="product-name">{{ m.productName }}</span>
          <span>{{ formatCurrency(m.totalRevenue) }}</span>
          <span>{{ formatCurrency(m.totalCost ?? "0") }}</span>
          <span :class="parseFloat(m.margin) >= 0 ? 'margin-positive' : 'margin-negative'">
            {{ formatCurrency(m.margin) }}
          </span>
          <span :class="m.marginPercent >= 0 ? 'margin-positive' : 'margin-negative'">
            {{ m.marginPercent.toFixed(1) }}%
          </span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!summary || parseFloat(summary.revenue.total) === 0" class="empty-state">
      <p>Aun no hay datos financieros. Los graficos apareceran cuando tengas ventas verificadas.</p>
    </div>
  </div>
</template>

<style scoped>
.analytics-page h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.export-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-export {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  color: #374151;
  text-decoration: none;
  background: white;
}

.btn-export:hover {
  background: #f3f4f6;
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.kpi-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.kpi-label {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
}

.kpi-change {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.change-positive {
  color: #059669;
}
.change-negative {
  color: #dc2626;
}
.change-neutral {
  color: #6b7280;
}

/* Charts */
.chart-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.chart-section h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}

/* Tables */
.product-table {
  font-size: 0.8125rem;
}

.table-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #6b7280;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.margins-header {
  grid-template-columns: 2fr 1fr 1fr 1fr 0.5fr;
}

.table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid #f3f4f6;
  align-items: center;
}

.margins-row {
  grid-template-columns: 2fr 1fr 1fr 1fr 0.5fr;
}

.product-name {
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-revenue {
  font-weight: 600;
}

.product-qty {
  color: #6b7280;
}

.margin-positive {
  color: #059669;
  font-weight: 600;
}

.margin-negative {
  color: #dc2626;
  font-weight: 600;
}

/* Payment methods */
.payment-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.payment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.payment-label {
  font-weight: 500;
  font-size: 0.875rem;
}

.payment-value {
  font-weight: 700;
  font-size: 0.875rem;
}

.payment-orders {
  font-size: 0.75rem;
  color: #6b7280;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}
</style>
