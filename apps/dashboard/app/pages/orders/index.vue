<script setup lang="ts">
/**
 * Orders list — /orders
 *
 * Shows all orders for the current tenant with status filters.
 * Fetches from GET /orders with optional status query param.
 */

useHead({ title: "Pedidos — Qyne" });

const { get } = useApi();

const statusFilter = ref("all");
const currentPage = ref(0);
const pageSize = 20;

interface Order {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string | null;
  totalUsd: string;
  totalBs: string | null;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  deliveryMethod: string;
  createdAt: string;
}

interface OrdersResponse {
  data: Order[];
  total: number;
}

const {
  data: ordersData,
  refresh,
  status: fetchStatus,
} = await useAsyncData(
  "orders",
  async () => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(currentPage.value * pageSize));
    if (statusFilter.value !== "all") {
      params.set("status", statusFilter.value);
    }
    return get<OrdersResponse>(`/orders?${params.toString()}`);
  },
  { watch: [statusFilter, currentPage] },
);

const orders = computed(() => (ordersData.value as unknown as OrdersResponse)?.data ?? []);
const total = computed(() => (ordersData.value as unknown as OrdersResponse)?.total ?? 0);

function onFilterChange() {
  currentPage.value = 0;
  refresh();
}

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

const statusColors: Record<string, string> = {
  created: "#6b7280",
  payment_pending: "#d97706",
  screenshot_uploaded: "#2563eb",
  verifying: "#2563eb",
  verified: "#059669",
  preparing: "#7c3aed",
  shipped: "#0891b2",
  delivered: "#059669",
  cancelled: "#ef4444",
  expired: "#9ca3af",
  rejected: "#ef4444",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <div class="orders-page">
    <div class="page-header">
      <h1>Pedidos</h1>
      <span class="order-count">{{ total }} {{ total === 1 ? "pedido" : "pedidos" }}</span>
    </div>

    <div class="filters">
      <select v-model="statusFilter" class="filter-select" @change="onFilterChange">
        <option value="all">Todos</option>
        <option value="payment_pending">Pago pendiente</option>
        <option value="screenshot_uploaded">Capture enviado</option>
        <option value="verified">Verificado</option>
        <option value="preparing">Preparando</option>
        <option value="shipped">Enviado</option>
        <option value="delivered">Entregado</option>
        <option value="cancelled">Cancelado</option>
        <option value="expired">Expirado</option>
      </select>
    </div>

    <div v-if="fetchStatus === 'pending'" class="loading">Cargando pedidos...</div>

    <div v-else-if="orders.length === 0" class="empty-state">
      <p>No hay pedidos {{ statusFilter !== "all" ? "con este estado" : "aun" }}.</p>
    </div>

    <div v-else class="orders-list">
      <NuxtLink
        v-for="order in orders"
        :key="order.id"
        :to="`/orders/${order.id}`"
        class="order-card"
      >
        <div class="order-header">
          <span class="order-number">{{ order.orderNumber }}</span>
          <span class="order-date">{{ formatDate(order.createdAt) }}</span>
        </div>
        <div class="order-body">
          <span class="order-buyer">{{ order.buyerName }}</span>
          <span class="order-total">${{ order.totalUsd }}</span>
        </div>
        <div class="order-footer">
          <span class="order-status" :style="{ color: statusColors[order.status] || '#6b7280' }">
            {{ statusLabels[order.status] || order.status }}
          </span>
          <span v-if="order.paymentMethod" class="order-method">
            {{
              order.paymentMethod === "pago_movil"
                ? "Pago Movil"
                : order.paymentMethod === "zelle"
                  ? "Zelle"
                  : "Efectivo"
            }}
          </span>
        </div>
      </NuxtLink>
    </div>

    <div v-if="total > pageSize" class="pagination">
      <button :disabled="currentPage === 0" @click="currentPage--">Anterior</button>
      <span>Pagina {{ currentPage + 1 }} de {{ Math.ceil(total / pageSize) }}</span>
      <button :disabled="(currentPage + 1) * pageSize >= total" @click="currentPage++">
        Siguiente
      </button>
    </div>
  </div>
</template>

<style scoped>
.orders-page {
  max-width: 900px;
}
.page-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.page-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}
.order-count {
  font-size: 0.875rem;
  color: #6b7280;
}
.filters {
  margin-bottom: 1rem;
}
.filter-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
}
.loading {
  color: #6b7280;
  padding: 2rem 0;
}
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.order-card {
  display: block;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-decoration: none;
  color: inherit;
  background: white;
  transition: box-shadow 0.15s;
}
.order-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.order-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}
.order-number {
  font-weight: 600;
  font-size: 0.875rem;
}
.order-date {
  font-size: 0.75rem;
  color: #9ca3af;
}
.order-body {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}
.order-buyer {
  font-size: 0.875rem;
  color: #374151;
}
.order-total {
  font-weight: 700;
  font-size: 0.9375rem;
}
.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.order-status {
  font-size: 0.75rem;
  font-weight: 600;
}
.order-method {
  font-size: 0.75rem;
  color: #6b7280;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  font-size: 0.875rem;
}
.pagination button {
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}
.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
