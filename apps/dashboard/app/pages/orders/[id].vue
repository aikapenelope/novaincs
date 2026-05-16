<script setup lang="ts">
/**
 * Order detail — /orders/:id
 *
 * Shows order items, buyer info, payment screenshot, and action buttons
 * to update status (verify payment, mark as preparing/shipped/delivered, cancel).
 */

useHead({ title: "Detalle de pedido — Qyne" });

const route = useRoute();
const router = useRouter();
const { get, patch } = useApi();
const orderId = route.params.id as string;

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceUsd: string;
  unitPriceBs: string | null;
}

interface Payment {
  id: string;
  method: string;
  amount: string;
  currency: string;
  status: string;
  screenshotUrl: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

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
  deliveryAddress: string | null;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
  payments: Payment[];
}

const { data: order, refresh } = await useAsyncData(`order-${orderId}`, () =>
  get<Order>(`/orders/${orderId}`),
);

const isUpdating = ref(false);
const updateError = ref<string | null>(null);
const updateSuccess = ref<string | null>(null);

async function updateStatus(newStatus: string) {
  isUpdating.value = true;
  updateError.value = null;
  updateSuccess.value = null;

  try {
    await patch(`/orders/${orderId}/status`, { status: newStatus });
    updateSuccess.value = `Estado actualizado a "${statusLabels[newStatus] || newStatus}"`;
    await refresh();
    setTimeout(() => (updateSuccess.value = null), 3000);
  } catch (err: unknown) {
    updateError.value = err instanceof Error ? err.message : "Error al actualizar";
  } finally {
    isUpdating.value = false;
  }
}

async function verifyPayment(paymentId: string, status: "verified" | "rejected") {
  isUpdating.value = true;
  updateError.value = null;
  updateSuccess.value = null;

  try {
    await patch(`/payments/${paymentId}/verify`, { status });
    updateSuccess.value = status === "verified" ? "Pago verificado" : "Pago rechazado";
    await refresh();
    setTimeout(() => (updateSuccess.value = null), 3000);
  } catch (err: unknown) {
    updateError.value = err instanceof Error ? err.message : "Error al verificar pago";
  } finally {
    isUpdating.value = false;
  }
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

/**
 * Determine which actions are available based on current status.
 */
const availableActions = computed(() => {
  if (!order.value) return [];
  const s = order.value.status;
  const actions: { label: string; status: string; color: string }[] = [];

  if (s === "verified") {
    actions.push({ label: "Marcar como preparando", status: "preparing", color: "#7c3aed" });
  }
  if (s === "preparing") {
    actions.push({ label: "Marcar como enviado", status: "shipped", color: "#0891b2" });
  }
  if (s === "shipped") {
    actions.push({ label: "Marcar como entregado", status: "delivered", color: "#059669" });
  }
  if (!["cancelled", "expired", "delivered"].includes(s)) {
    actions.push({ label: "Cancelar pedido", status: "cancelled", color: "#ef4444" });
  }

  return actions;
});

/**
 * Find payments that need verification (screenshot uploaded but not yet verified).
 */
const pendingPayments = computed(() => {
  if (!order.value) return [];
  return order.value.payments.filter(
    (p) => p.status === "screenshot_uploaded" || p.status === "verifying",
  );
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whatsappUrl(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${clean}`;
}
</script>

<template>
  <div class="order-detail">
    <button class="back-link" @click="router.push('/orders')">&larr; Volver a pedidos</button>

    <div v-if="!order" class="loading">Cargando pedido...</div>

    <template v-else>
      <!-- Header -->
      <div class="detail-header">
        <div>
          <h1>{{ order.orderNumber }}</h1>
          <p class="detail-date">{{ formatDate(order.createdAt) }}</p>
        </div>
        <span class="status-badge" :style="{ background: statusColors[order.status] || '#6b7280' }">
          {{ statusLabels[order.status] || order.status }}
        </span>
      </div>

      <!-- Feedback messages -->
      <div v-if="updateSuccess" class="msg msg-success">{{ updateSuccess }}</div>
      <div v-if="updateError" class="msg msg-error">{{ updateError }}</div>

      <!-- Payment verification section -->
      <div v-if="pendingPayments.length > 0" class="section verify-section">
        <h2>Verificar pago</h2>
        <div v-for="payment in pendingPayments" :key="payment.id" class="payment-card">
          <div class="payment-info">
            <p>
              <strong>{{
                payment.method === "pago_movil"
                  ? "Pago Movil"
                  : payment.method === "zelle"
                    ? "Zelle"
                    : payment.method
              }}</strong>
              — {{ payment.currency }} {{ payment.amount }}
            </p>
            <p v-if="payment.notes" class="payment-notes">Nota: {{ payment.notes }}</p>
          </div>
          <div v-if="payment.screenshotUrl" class="screenshot-container">
            <a :href="payment.screenshotUrl" target="_blank" rel="noopener">
              <img :src="payment.screenshotUrl" alt="Capture de pago" class="screenshot-img" />
            </a>
          </div>
          <div class="verify-actions">
            <button
              class="btn btn-verify"
              :disabled="isUpdating"
              @click="verifyPayment(payment.id, 'verified')"
            >
              Verificar pago
            </button>
            <button
              class="btn btn-reject"
              :disabled="isUpdating"
              @click="verifyPayment(payment.id, 'rejected')"
            >
              Rechazar
            </button>
          </div>
        </div>
      </div>

      <!-- Buyer info -->
      <div class="section">
        <h2>Comprador</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Nombre</span>
            <span class="info-value">{{ order.buyerName }}</span>
          </div>
          <div v-if="order.buyerPhone" class="info-item">
            <span class="info-label">WhatsApp</span>
            <a :href="whatsappUrl(order.buyerPhone)" target="_blank" class="info-value info-link">
              {{ order.buyerPhone }}
            </a>
          </div>
          <div class="info-item">
            <span class="info-label">Entrega</span>
            <span class="info-value">{{
              order.deliveryMethod === "delivery" ? "Delivery" : "Retiro en tienda"
            }}</span>
          </div>
          <div v-if="order.deliveryAddress" class="info-item">
            <span class="info-label">Direccion</span>
            <span class="info-value">{{ order.deliveryAddress }}</span>
          </div>
          <div v-if="order.notes" class="info-item">
            <span class="info-label">Nota</span>
            <span class="info-value">{{ order.notes }}</span>
          </div>
        </div>
      </div>

      <!-- Order items -->
      <div class="section">
        <h2>Productos</h2>
        <div class="items-table">
          <div v-for="item in order.items" :key="item.id" class="item-row">
            <div class="item-name">
              {{ item.productName }}
              <span v-if="item.variantName" class="item-variant">{{ item.variantName }}</span>
            </div>
            <div class="item-qty">x{{ item.quantity }}</div>
            <div class="item-price">
              ${{ (Number(item.unitPriceUsd) * item.quantity).toFixed(2) }}
            </div>
          </div>
          <div class="item-row item-total">
            <div class="item-name">Total</div>
            <div class="item-qty"></div>
            <div class="item-price">${{ order.totalUsd }}</div>
          </div>
          <div v-if="order.totalBs" class="item-row item-bs">
            <div class="item-name">En bolivares</div>
            <div class="item-qty"></div>
            <div class="item-price">Bs {{ order.totalBs }}</div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="availableActions.length > 0" class="section">
        <h2>Acciones</h2>
        <div class="actions-grid">
          <button
            v-for="action in availableActions"
            :key="action.status"
            class="btn action-btn"
            :style="{ borderColor: action.color, color: action.color }"
            :disabled="isUpdating"
            @click="updateStatus(action.status)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.order-detail {
  max-width: 800px;
}
.back-link {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0;
  margin-bottom: 1rem;
  display: inline-block;
}
.back-link:hover {
  color: #111827;
}
.loading {
  color: #6b7280;
  padding: 2rem 0;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}
.detail-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
}
.detail-date {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 0.125rem;
}
.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
}

.msg {
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.msg-success {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.msg-error {
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.section {
  margin-bottom: 2rem;
}
.section h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #374151;
}

.verify-section {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 0.5rem;
  padding: 1rem;
}
.payment-card {
  margin-bottom: 1rem;
}
.payment-info p {
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}
.payment-notes {
  color: #6b7280;
  font-size: 0.8125rem;
}
.screenshot-container {
  margin: 0.75rem 0;
}
.screenshot-img {
  max-width: 300px;
  max-height: 400px;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
}
.verify-actions {
  display: flex;
  gap: 0.5rem;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
@media (max-width: 640px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}
.info-item {
  padding: 0.625rem 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}
.info-label {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.125rem;
}
.info-value {
  font-size: 0.875rem;
  font-weight: 500;
}
.info-link {
  color: #25d366;
  text-decoration: none;
}
.info-link:hover {
  text-decoration: underline;
}

.items-table {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
}
.item-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.875rem;
  align-items: center;
}
.item-row:last-child {
  border-bottom: none;
}
.item-variant {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
}
.item-qty {
  color: #6b7280;
  min-width: 2rem;
  text-align: center;
}
.item-price {
  font-weight: 600;
  text-align: right;
  min-width: 4rem;
}
.item-total {
  background: #f9fafb;
  font-weight: 700;
}
.item-bs {
  background: #f9fafb;
  color: #6b7280;
  font-size: 0.8125rem;
}

.actions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-verify {
  background: #059669;
  color: white;
  border: none;
}
.btn-verify:hover:not(:disabled) {
  background: #047857;
}
.btn-reject {
  background: white;
  color: #ef4444;
  border: 1px solid #ef4444;
}
.btn-reject:hover:not(:disabled) {
  background: #fef2f2;
}
.action-btn {
  background: white;
  border: 1px solid;
}
.action-btn:hover:not(:disabled) {
  background: #f9fafb;
}
</style>
