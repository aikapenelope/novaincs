<script setup lang="ts">
/**
 * Plan management — /settings/plan
 *
 * Shows current plan, upgrade options, and payment history.
 * Follows the Aurora/DogFlow pattern: manual payment + admin verification.
 */
useHead({ title: "Plan — Qyne" });

const { get, post } = useApi();

interface PlanInfo {
  currentTier: string;
  expiresAt: string | null;
  aiImagesUsed: number;
  prices: Record<string, number>;
  payments: { id: string; requestedTier: string; status: string; createdAt: string }[];
}

const { data: planData, refresh } = await useAsyncData("plan-info", () =>
  get<PlanInfo>("/billing/plan"),
);

const plan = computed(() => planData.value as unknown as PlanInfo | null);

const showUpgradeModal = ref(false);
const selectedTier = ref("");
const paymentMethod = ref("pago_movil");
const reference = ref("");
const submitting = ref(false);
const submitSuccess = ref(false);

const tierLabels: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

const tierDescriptions: Record<string, string> = {
  starter: "Productos ilimitados, Smart Feed, 100 imagenes AI/mes",
  pro: "Todo en Starter + Reportes, Dashboard financiero, CRM completo, AI agents",
  business: "Todo en Pro + WhatsApp API, API publica, modo autonomo AI",
};

function openUpgrade(tier: string) {
  selectedTier.value = tier;
  showUpgradeModal.value = true;
  submitSuccess.value = false;
}

async function submitUpgrade() {
  submitting.value = true;
  try {
    await post("/billing/upgrade", {
      requestedTier: selectedTier.value,
      method: paymentMethod.value,
      reference: reference.value || undefined,
    });
    submitSuccess.value = true;
    reference.value = "";
    await refresh();
  } catch {
    // Error handled silently.
  } finally {
    submitting.value = false;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
</script>

<template>
  <div class="plan-page">
    <h1>Tu Plan</h1>

    <!-- Current plan -->
    <div v-if="plan" class="current-plan">
      <div class="plan-badge" :class="plan.currentTier">
        {{ tierLabels[plan.currentTier] || plan.currentTier }}
      </div>
      <p v-if="plan.expiresAt" class="plan-expires">Vence: {{ formatDate(plan.expiresAt) }}</p>
      <p v-else-if="plan.currentTier === 'free'" class="plan-expires">
        Plan gratuito (sin vencimiento)
      </p>
    </div>

    <!-- Upgrade options -->
    <div class="plans-grid">
      <div
        v-for="(price, tier) in plan?.prices ?? {}"
        :key="tier"
        class="plan-card"
        :class="{ current: plan?.currentTier === tier }"
      >
        <h3>{{ tierLabels[tier] || tier }}</h3>
        <div class="plan-price">
          <span v-if="price === 0">Gratis</span>
          <span v-else>${{ price }}/mes</span>
        </div>
        <p class="plan-desc">{{ tierDescriptions[tier] || "" }}</p>
        <button
          v-if="tier !== 'free' && plan?.currentTier !== tier"
          class="upgrade-btn"
          @click="openUpgrade(tier)"
        >
          {{
            plan?.currentTier === "free" || (plan?.prices?.[plan.currentTier] ?? 0) < price
              ? "Upgrade"
              : "Cambiar"
          }}
        </button>
        <span v-else-if="plan?.currentTier === tier" class="current-label">Plan actual</span>
      </div>
    </div>

    <!-- Payment history -->
    <div v-if="plan?.payments && plan.payments.length > 0" class="payment-history">
      <h2>Historial de pagos</h2>
      <div v-for="p in plan.payments" :key="p.id" class="payment-row">
        <span class="payment-tier">{{ tierLabels[p.requestedTier] || p.requestedTier }}</span>
        <span class="payment-status" :class="p.status">{{ p.status }}</span>
        <span class="payment-date">{{ formatDate(p.createdAt) }}</span>
      </div>
    </div>

    <!-- Upgrade modal -->
    <div v-if="showUpgradeModal" class="modal-overlay" @click.self="showUpgradeModal = false">
      <div class="modal">
        <h2>Upgrade a {{ tierLabels[selectedTier] }}</h2>

        <div v-if="submitSuccess" class="success-msg">
          Solicitud enviada. Te notificaremos cuando se verifique tu pago.
          <button class="close-btn" @click="showUpgradeModal = false">Cerrar</button>
        </div>

        <template v-else>
          <p class="modal-price">Precio: ${{ plan?.prices?.[selectedTier] ?? 0 }}/mes</p>

          <div class="payment-info">
            <h3>Datos de pago</h3>
            <p class="payment-note">
              Transfiere el monto y luego ingresa la referencia aqui. Un administrador verificara tu
              pago.
            </p>
          </div>

          <div class="form-group">
            <label>Metodo de pago</label>
            <select v-model="paymentMethod">
              <option value="pago_movil">Pago Movil</option>
              <option value="zelle">Zelle</option>
              <option value="binance">Binance</option>
            </select>
          </div>

          <div class="form-group">
            <label>Referencia (opcional)</label>
            <input v-model="reference" placeholder="Numero de referencia" />
          </div>

          <button class="submit-btn" :disabled="submitting" @click="submitUpgrade">
            {{ submitting ? "Enviando..." : "Enviar solicitud" }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-page h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.current-plan {
  margin-bottom: 2rem;
}

.plan-badge {
  display: inline-block;
  padding: 0.375rem 1rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 0.875rem;
  text-transform: uppercase;
}

.plan-badge.free {
  background: #f3f4f6;
  color: #6b7280;
}
.plan-badge.starter {
  background: #dbeafe;
  color: #1d4ed8;
}
.plan-badge.pro {
  background: #fef3c7;
  color: #92400e;
}
.plan-badge.business {
  background: #ede9fe;
  color: #5b21b6;
}

.plan-expires {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 0.5rem;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.plan-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.plan-card.current {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.plan-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.plan-price {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.plan-desc {
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.upgrade-btn {
  width: 100%;
  padding: 0.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 0.8125rem;
  cursor: pointer;
}

.upgrade-btn:hover {
  background: #2563eb;
}

.current-label {
  display: block;
  text-align: center;
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

.payment-history h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.payment-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.8125rem;
}

.payment-status {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
}

.payment-status.pending {
  background: #fef3c7;
  color: #92400e;
}
.payment-status.verified {
  background: #d1fae5;
  color: #065f46;
}
.payment-status.rejected {
  background: #fee2e2;
  color: #991b1b;
}

.payment-date {
  color: #9ca3af;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  width: 90%;
  max-width: 400px;
}

.modal h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.modal-price {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.payment-info {
  margin-bottom: 1rem;
}
.payment-info h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.payment-note {
  font-size: 0.75rem;
  color: #6b7280;
}

.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.25rem;
}
.form-group select,
.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.submit-btn {
  width: 100%;
  padding: 0.75rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.success-msg {
  text-align: center;
  color: #059669;
  font-weight: 500;
  padding: 1rem 0;
}

.close-btn {
  display: block;
  margin: 1rem auto 0;
  padding: 0.5rem 1.5rem;
  background: #f3f4f6;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
}
</style>
