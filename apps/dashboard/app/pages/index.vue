<script setup lang="ts">
/**
 * Dashboard home — merchant's daily overview.
 *
 * Shows today's stats, Smart Feed action cards, and recent orders.
 * Feed items are AI-generated insights from CRM, RFM, and inventory data.
 */
useHead({ title: "Inicio — Qyne" });

const { get, patch, post } = useApi();

// --- Types ---

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

interface FeedItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  isRead: boolean;
  isDismissed: boolean;
  data: Record<string, unknown>;
  createdAt: string;
}

interface FeedResponse {
  data: FeedItem[];
  total: number;
  unread: number;
}

// --- Data fetching ---

const { data: ordersData } = await useAsyncData("home-orders", () =>
  get<OrdersResponse>("/orders?limit=50&offset=0"),
);

const { data: feedData, refresh: refreshFeed } = await useAsyncData("home-feed", () =>
  get<FeedResponse>("/feed?limit=10"),
);

const orders = computed(() => (ordersData.value as unknown as OrdersResponse)?.data ?? []);
const feedItems = computed(() => (feedData.value as unknown as FeedResponse)?.data ?? []);
const feedUnread = computed(() => (feedData.value as unknown as FeedResponse)?.unread ?? 0);

// --- Order stats ---

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

// --- Feed actions ---

async function dismissFeedItem(id: string) {
  try {
    await patch(`/feed/${id}/dismiss`, {});
    await refreshFeed();
  } catch {
    // Silently fail — non-critical action.
  }
}

async function markFeedRead(id: string) {
  try {
    await patch(`/feed/${id}/read`, {});
    await refreshFeed();
  } catch {
    // Silently fail.
  }
}

// --- Labels ---

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

const feedTypeIcons: Record<string, string> = {
  at_risk_customer: "⚠",
  pending_payments: "💳",
  low_stock: "📦",
  new_customer: "👤",
  cart_abandoned: "🛒",
  daily_summary: "📊",
  milestone: "🎯",
};

const priorityColors: Record<string, string> = {
  critical: "#dc2626",
  high: "#f59e0b",
  medium: "#6b7280",
  low: "#9ca3af",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
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

    <!-- Smart Feed -->
    <div v-if="feedItems.length > 0" class="feed-section">
      <div class="section-header">
        <h2>
          Novedades
          <span v-if="feedUnread > 0" class="feed-badge">{{ feedUnread }}</span>
        </h2>
      </div>
      <div class="feed-list">
        <div
          v-for="item in feedItems"
          :key="item.id"
          class="feed-card"
          :class="{ unread: !item.isRead }"
          @click="markFeedRead(item.id)"
        >
          <div class="feed-card-left">
            <span
              class="feed-icon"
              :style="{ borderColor: priorityColors[item.priority] || '#6b7280' }"
            >
              {{ feedTypeIcons[item.type] || "📌" }}
            </span>
          </div>
          <div class="feed-card-content">
            <span class="feed-title">{{ item.title }}</span>
            <span v-if="item.body" class="feed-body">{{ item.body }}</span>
            <div class="feed-meta">
              <span class="feed-time">{{ formatRelativeTime(item.createdAt) }}</span>
              <NuxtLink v-if="item.actionUrl" :to="item.actionUrl" class="feed-action">
                {{ item.actionLabel || "Ver" }} &rarr;
              </NuxtLink>
            </div>
          </div>
          <button class="feed-dismiss" title="Descartar" @click.stop="dismissFeedItem(item.id)">
            &times;
          </button>
        </div>
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

/* --- Smart Feed --- */

.feed-section {
  margin-bottom: 2rem;
}

.feed-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  background: #dc2626;
  color: white;
  font-size: 0.6875rem;
  font-weight: 700;
  margin-left: 0.5rem;
  vertical-align: middle;
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.feed-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.feed-card:hover {
  background: #f9fafb;
}

.feed-card.unread {
  border-left: 3px solid #3b82f6;
}

.feed-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 2px solid #e5e7eb;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.feed-card-content {
  flex: 1;
  min-width: 0;
}

.feed-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
}

.feed-body {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
  line-height: 1.4;
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.375rem;
}

.feed-time {
  font-size: 0.6875rem;
  color: #9ca3af;
}

.feed-action {
  font-size: 0.6875rem;
  color: #3b82f6;
  text-decoration: none;
  font-weight: 500;
}

.feed-action:hover {
  text-decoration: underline;
}

.feed-dismiss {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 1.125rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  flex-shrink: 0;
}

.feed-dismiss:hover {
  color: #6b7280;
}

/* --- Recent orders --- */

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
