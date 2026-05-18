<script setup lang="ts">
/**
 * Cash Flow Dashboard — /cashflow
 *
 * Shows cash flow (inflows vs outflows), net position, and 7/30-day projections.
 * Uses the /cashflow API endpoints. Requires Pro+ plan (financial_dashboard feature).
 *
 * All period-dependent queries use `watch: [days]` so changing the period
 * selector automatically refetches all data without manual refresh calls.
 */
useHead({ title: "Flujo de Caja — Qyne" });

const { get } = useApi();

// --- Types ---

interface CashFlowSummary {
  period: { days: number; start: string };
  current: {
    inflows: string;
    outflows: string;
    netCashFlow: string;
    inflowCount: number;
    outflowCount: number;
  };
  previous: {
    inflows: string;
    outflows: string;
    netCashFlow: string;
  };
  change: { netPercent: number };
  projections: {
    daily: { avgInflow: string; avgOutflow: string; avgNet: string };
    sevenDay: { projectedInflows: string; projectedOutflows: string; projectedNet: string };
    thirtyDay: { projectedInflows: string; projectedOutflows: string; projectedNet: string };
  };
}

interface DailyCashFlow {
  date: string;
  inflows: string;
  outflows: string;
  net: string;
}

interface WeeklyCashFlow {
  week: string;
  inflows: string;
  outflows: string;
  net: string;
}

interface CategoryBreakdown {
  category: string;
  total: string;
  count: number;
}

// --- Data fetching ---

const days = ref(30);
const planError = ref(false);

const { data: summaryData } = await useAsyncData(
  "cashflow-summary",
  async () => {
    try {
      return await get<CashFlowSummary>(`/cashflow/summary?days=${days.value}`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 403) {
        planError.value = true;
      }
      return null;
    }
  },
  { watch: [days] },
);

const { data: dailyData } = await useAsyncData(
  "cashflow-daily",
  async () => {
    try {
      return await get<DailyCashFlow[]>(`/cashflow/daily?days=${days.value}`);
    } catch {
      return null;
    }
  },
  { watch: [days] },
);

const { data: weeklyData } = await useAsyncData("cashflow-weekly", async () => {
  try {
    return await get<WeeklyCashFlow[]>("/cashflow/weekly");
  } catch {
    return null;
  }
});

const { data: categoriesData } = await useAsyncData(
  "cashflow-categories",
  async () => {
    try {
      return await get<CategoryBreakdown[]>(`/cashflow/categories?days=${days.value}`);
    } catch {
      return null;
    }
  },
  { watch: [days] },
);

// --- Computed ---

const summary = computed(() => summaryData.value as CashFlowSummary | null);
const daily = computed(() => (dailyData.value as DailyCashFlow[] | null) ?? []);
const weekly = computed(() => (weeklyData.value as WeeklyCashFlow[] | null) ?? []);
const categories = computed(() => (categoriesData.value as CategoryBreakdown[] | null) ?? []);

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

function netClass(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (num > 0) return "net-positive";
  if (num < 0) return "net-negative";
  return "net-neutral";
}

function changeLabel(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function changePeriod(newDays: number) {
  days.value = newDays;
}
</script>

<template>
  <div class="cashflow-page">
    <div class="page-header">
      <h1>Flujo de Caja</h1>
      <div class="period-selector">
        <button :class="['period-btn', { active: days === 7 }]" @click="changePeriod(7)">7d</button>
        <button :class="['period-btn', { active: days === 30 }]" @click="changePeriod(30)">
          30d
        </button>
        <button :class="['period-btn', { active: days === 90 }]" @click="changePeriod(90)">
          90d
        </button>
      </div>
    </div>

    <!-- Plan gate -->
    <div v-if="planError" class="plan-gate">
      <p>El dashboard de flujo de caja requiere el plan <strong>Pro</strong> o superior.</p>
      <NuxtLink to="/settings/plan" class="btn-upgrade">Ver planes</NuxtLink>
    </div>

    <template v-else-if="summary">
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-inflows">
          <span class="kpi-label">Ingresos</span>
          <span class="kpi-value">{{ formatCurrency(summary.current.inflows) }}</span>
          <span class="kpi-sub">{{ summary.current.inflowCount }} pagos verificados</span>
        </div>
        <div class="kpi-card kpi-outflows">
          <span class="kpi-label">Gastos</span>
          <span class="kpi-value">{{ formatCurrency(summary.current.outflows) }}</span>
          <span class="kpi-sub">{{ summary.current.outflowCount }} gastos registrados</span>
        </div>
        <div class="kpi-card kpi-net">
          <span class="kpi-label">Flujo Neto</span>
          <span class="kpi-value" :class="netClass(summary.current.netCashFlow)">
            {{ formatCurrency(summary.current.netCashFlow) }}
          </span>
          <span class="kpi-change" :class="changeClass(summary.change.netPercent)">
            {{ changeLabel(summary.change.netPercent) }} vs periodo anterior
          </span>
        </div>
      </div>

      <!-- Projections -->
      <div class="projections-section">
        <h2>Proyecciones</h2>
        <div class="projections-grid">
          <div class="projection-card">
            <span class="projection-label">Promedio diario</span>
            <div class="projection-row">
              <span class="proj-in"
                >+{{ formatCurrency(summary.projections.daily.avgInflow) }}</span
              >
              <span class="proj-out"
                >-{{ formatCurrency(summary.projections.daily.avgOutflow) }}</span
              >
              <span class="proj-net" :class="netClass(summary.projections.daily.avgNet)">
                = {{ formatCurrency(summary.projections.daily.avgNet) }}
              </span>
            </div>
          </div>
          <div class="projection-card">
            <span class="projection-label">Proximos 7 dias</span>
            <div class="projection-row">
              <span class="proj-in"
                >+{{ formatCurrency(summary.projections.sevenDay.projectedInflows) }}</span
              >
              <span class="proj-out"
                >-{{ formatCurrency(summary.projections.sevenDay.projectedOutflows) }}</span
              >
              <span class="proj-net" :class="netClass(summary.projections.sevenDay.projectedNet)">
                = {{ formatCurrency(summary.projections.sevenDay.projectedNet) }}
              </span>
            </div>
          </div>
          <div class="projection-card">
            <span class="projection-label">Proximos 30 dias</span>
            <div class="projection-row">
              <span class="proj-in"
                >+{{ formatCurrency(summary.projections.thirtyDay.projectedInflows) }}</span
              >
              <span class="proj-out"
                >-{{ formatCurrency(summary.projections.thirtyDay.projectedOutflows) }}</span
              >
              <span class="proj-net" :class="netClass(summary.projections.thirtyDay.projectedNet)">
                = {{ formatCurrency(summary.projections.thirtyDay.projectedNet) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Daily Cash Flow -->
      <div v-if="daily.length > 0" class="chart-section">
        <h2>Flujo Diario (ultimos {{ days }} dias)</h2>
        <div class="daily-chart">
          <div v-for="d in daily.slice(-14)" :key="d.date" class="daily-bar">
            <div class="bar-label">{{ d.date.slice(5) }}</div>
            <div class="bar-values">
              <span class="bar-in">+{{ formatCurrency(d.inflows) }}</span>
              <span class="bar-out">-{{ formatCurrency(d.outflows) }}</span>
              <span class="bar-net" :class="netClass(d.net)">{{ formatCurrency(d.net) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly Cash Flow -->
      <div v-if="weekly.length > 0" class="chart-section">
        <h2>Flujo Semanal (90 dias)</h2>
        <div class="weekly-table">
          <div class="table-header">
            <span>Semana</span>
            <span>Ingresos</span>
            <span>Gastos</span>
            <span>Neto</span>
          </div>
          <div v-for="w in weekly" :key="w.week" class="table-row">
            <span>{{ w.week.slice(5) }}</span>
            <span class="val-in">{{ formatCurrency(w.inflows) }}</span>
            <span class="val-out">{{ formatCurrency(w.outflows) }}</span>
            <span :class="netClass(w.net)">{{ formatCurrency(w.net) }}</span>
          </div>
        </div>
      </div>

      <!-- Expense Categories -->
      <div v-if="categories.length > 0" class="chart-section">
        <h2>Gastos por Categoria</h2>
        <div class="categories-list">
          <div v-for="cat in categories" :key="cat.category" class="category-item">
            <span class="cat-name">{{ cat.category }}</span>
            <span class="cat-total">{{ formatCurrency(cat.total) }}</span>
            <span class="cat-count">{{ cat.count }} registros</span>
          </div>
        </div>
      </div>

      <!-- Period comparison -->
      <div class="chart-section comparison-section">
        <h2>Comparacion con periodo anterior</h2>
        <div class="comparison-grid">
          <div class="comp-item">
            <span class="comp-label">Ingresos anterior</span>
            <span class="comp-value">{{ formatCurrency(summary.previous.inflows) }}</span>
          </div>
          <div class="comp-item">
            <span class="comp-label">Gastos anterior</span>
            <span class="comp-value">{{ formatCurrency(summary.previous.outflows) }}</span>
          </div>
          <div class="comp-item">
            <span class="comp-label">Neto anterior</span>
            <span class="comp-value" :class="netClass(summary.previous.netCashFlow)">
              {{ formatCurrency(summary.previous.netCashFlow) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else-if="!planError" class="empty-state">
      <p>
        Aun no hay datos de flujo de caja. Aparecera cuando tengas ventas verificadas y gastos
        registrados.
      </p>
    </div>
  </div>
</template>

<style scoped>
.cashflow-page h1 {
  font-size: 1.5rem;
  font-weight: 600;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.period-selector {
  display: flex;
  gap: 0.25rem;
  background: #f3f4f6;
  border-radius: 0.375rem;
  padding: 0.25rem;
}
.period-btn {
  padding: 0.375rem 0.75rem;
  border: none;
  background: transparent;
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
}
.period-btn.active {
  background: white;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.plan-gate {
  text-align: center;
  padding: 3rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}
.plan-gate p {
  margin-bottom: 1rem;
  color: #374151;
}
.btn-upgrade {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  background: #111827;
  color: white;
  border-radius: 0.375rem;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
}
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
.kpi-inflows {
  border-left: 3px solid #10b981;
}
.kpi-outflows {
  border-left: 3px solid #ef4444;
}
.kpi-net {
  border-left: 3px solid #3b82f6;
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
.kpi-sub {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
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
.net-positive {
  color: #059669;
}
.net-negative {
  color: #dc2626;
}
.net-neutral {
  color: #6b7280;
}
.projections-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.projections-section h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.projections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.projection-card {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}
.projection-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  display: block;
  margin-bottom: 0.5rem;
}
.projection-row {
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.proj-in {
  color: #059669;
}
.proj-out {
  color: #dc2626;
}
.proj-net {
  font-weight: 700;
}
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
.daily-chart {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.daily-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid #f3f4f6;
}
.bar-label {
  font-size: 0.75rem;
  color: #6b7280;
  min-width: 3.5rem;
}
.bar-values {
  display: flex;
  gap: 1rem;
  font-size: 0.8125rem;
}
.bar-in {
  color: #059669;
}
.bar-out {
  color: #dc2626;
}
.bar-net {
  font-weight: 600;
}
.weekly-table {
  font-size: 0.8125rem;
}
.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #6b7280;
  font-size: 0.75rem;
  text-transform: uppercase;
}
.table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.625rem 0;
  border-bottom: 1px solid #f3f4f6;
  align-items: center;
}
.val-in {
  color: #059669;
  font-weight: 500;
}
.val-out {
  color: #dc2626;
  font-weight: 500;
}
.categories-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}
.cat-name {
  font-weight: 500;
  font-size: 0.875rem;
  text-transform: capitalize;
}
.cat-total {
  font-weight: 700;
  font-size: 0.875rem;
}
.cat-count {
  font-size: 0.75rem;
  color: #6b7280;
}
.comparison-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
.comp-item {
  text-align: center;
}
.comp-label {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}
.comp-value {
  font-size: 1.125rem;
  font-weight: 600;
}
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}
@media (max-width: 768px) {
  .comparison-grid {
    grid-template-columns: 1fr;
  }
}
</style>
