<script setup lang="ts">
/**
 * Dashboard home — merchant's daily overview.
 *
 * Fetches real order data to show today's sales, pending orders,
 * and recent orders. No placeholders.
 */
useHead({ title: "Inicio — Qyne" });

const { get } = useApi();

interface Order {
  id: string;
  orderNumber: string;
  buyerName: string;
  totalUsd: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

interface OrdersResponse {
  data: Order[];
  total: number;
}

// Fetch recent orders (last 50) to compute stats.
const { data: ordersData } = await useAsyncData("home-orders", () =>
  get<OrdersResponse>("/orders?limit=50&offset=0"),
);

const orders = computed(() => (ordersData.value as unknown as OrdersResponse)?.data ?? []);

// Today's stats computed from real order data.
const todayStart = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

const todayOrders = computed(() =>
  orders.value.filter((o) => new Date(o.createdAt) >= todayStart.value),
);

const todaySales = computed(() =>
  todayOrders.value
    .filter((o) => o.paymentStatus === "verified")
    .reduce((sum, o) => sum + Number(o.totalUsd), 0),
);

const pendingVerification = computed(() =>
  orders.value.filter((o) => o.status === "screenshot_uploaded" || o.status === "verifying"),
);

const pendingTotal = computed(() =>
  pendingVerification.value.reduce((sum, o) => sum + Number(o.totalUsd), 0),
);

const recentOrders = computed(() => orders.value.slice(0, 5));

const statusLabels: Record<string, string> = {
  created: "Creado",
  payment_pending: "Pago pendiente",
  screenshot_uploaded: "Capture enviado",
  verifying: "Verificando",
  verified: "Verificado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  expired: "Expirado",
  rejected: "Rechazado",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="dashboard-home">
    <h1>Inicio</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">${{ todaySales.toFixed(2) }}</span>
        <span class="stat-label">Ventas hoy</span>
        <span class="stat-detail"
          >{{ todayOrders.length }} {{ todayOrders.length === 1 ? "pedido" : "pedidos" }}</span
        >
      </div>
      <div class="stat-card" :class="{ highlight: pendingVerification.length > 0 }">
        <span class="stat-value">{{ pendingVerification.length }}</span>
        <span class="stat-label">Pagos por verificar</span>
        <span v-if="pendingTotal > 0" class="stat-detail">${{ pendingTotal.toFixed(2) }}</span>
        <NuxtLink
          v-if="pendingVerification.length > 0"
          to="/orders?status=screenshot_uploaded"
          class="stat-action"
        >
          Verificar ahora &rarr;
        </NuxtLink>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ orders.length }}</span>
        <span class="stat-label">Pedidos totales</span>
      </div>
    </div>

    <!-- Recent orders -->
    <div v-if="recentOrders.length > 0" class="recent-section">
      <div class="section-header">
        <h2>Pedidos recientes</h2>
        <NuxtLink to="/orders" class="see-all">Ver todos &rarr;</NuxtLink>
      </div>
      <div class="recent-list">
        <NuxtLink
          v-for="order in recentOrders"
          :key="order.id"
          :to="`/orders/${order.id}`"
          class="recent-item"
        >
          <div class="recent-info">
            <span class="recent-number">{{ order.orderNumber }}</span>
            <span class="recent-buyer">{{ order.buyerName }}</span>
          </div>
          <div class="recent-right">
            <span class="recent-total">${{ order.totalUsd }}</span>
            <span class="recent-status">{{ statusLabels[order.status] || order.status }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <div v-else class="empty-home">
      <p>Aun no tienes pedidos. Comparte tu catalogo para empezar a vender.</p>
    </div>
  </div>
</template>

<style scoped>
.dashboard-home h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.stat-card.highlight {
  border-color: #f59e0b;
  background: #fffbeb;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.stat-detail {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.125rem;
}

.stat-action {
  font-size: 0.75rem;
  color: #d97706;
  text-decoration: none;
  font-weight: 500;
  margin-top: 0.5rem;
}

.stat-action:hover {
  text-decoration: underline;
}

.recent-section {
  margin-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
}

.section-header h2 {
  font-size: 1rem;
  font-weight: 600;
}

.see-all {
  font-size: 0.8125rem;
  color: #6b7280;
  text-decoration: none;
}

.see-all:hover {
  color: #111827;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  text-decoration: none;
  color: inherit;
}

.recent-item:hover {
  background: #f9fafb;
}

.recent-info {
  display: flex;
  flex-direction: column;
}

.recent-number {
  font-weight: 600;
  font-size: 0.8125rem;
}

.recent-buyer {
  font-size: 0.8125rem;
  color: #6b7280;
}

.recent-right {
  text-align: right;
}

.recent-total {
  display: block;
  font-weight: 700;
  font-size: 0.875rem;
}

.recent-status {
  font-size: 0.6875rem;
  color: #6b7280;
}

.empty-home {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}
</style>
