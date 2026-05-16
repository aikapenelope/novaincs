<script setup lang="ts">
/**
 * Payment config — /settings/payments
 *
 * Merchant configures their Pago Movil bank details and Zelle email.
 * These are shown to buyers during checkout.
 */

useHead({ title: "Metodos de pago — Qyne" });

const { get, post, patch, del } = useApi();

interface PaymentConfig {
  id: string;
  method: string;
  label: string | null;
  details: Record<string, string>;
  isActive: boolean;
  sortOrder: number;
}

const { data: configs, refresh } = await useAsyncData("payment-configs", () =>
  get<PaymentConfig[]>("/payment-configs"),
);

const isSubmitting = ref(false);
const feedback = ref<{ type: "success" | "error"; message: string } | null>(null);

function clearFeedback() {
  setTimeout(() => (feedback.value = null), 3000);
}

// Pago Movil form
const pagoMovil = computed(() => (configs.value ?? []).find((c) => c.method === "pago_movil"));
const pmForm = reactive({
  phone: "",
  cedula: "",
  bank: "",
});

// Zelle form
const zelle = computed(() => (configs.value ?? []).find((c) => c.method === "zelle"));
const zelleForm = reactive({
  email: "",
  name: "",
});

// Cash on delivery
const cash = computed(() => (configs.value ?? []).find((c) => c.method === "cash_on_delivery"));

// Populate forms when data loads
watch(
  configs,
  (val) => {
    const pm = (val ?? []).find((c) => c.method === "pago_movil");
    if (pm) {
      pmForm.phone = pm.details.phone || "";
      pmForm.cedula = pm.details.cedula || "";
      pmForm.bank = pm.details.bank || "";
    }
    const z = (val ?? []).find((c) => c.method === "zelle");
    if (z) {
      zelleForm.email = z.details.email || "";
      zelleForm.name = z.details.name || "";
    }
  },
  { immediate: true },
);

async function savePagoMovil() {
  isSubmitting.value = true;
  feedback.value = null;
  try {
    const details = { phone: pmForm.phone, cedula: pmForm.cedula, bank: pmForm.bank };
    if (pagoMovil.value) {
      await patch(`/payment-configs/${pagoMovil.value.id}`, { details });
    } else {
      await post("/payment-configs", { method: "pago_movil", details });
    }
    feedback.value = { type: "success", message: "Pago Movil guardado" };
    await refresh();
  } catch (err: unknown) {
    feedback.value = { type: "error", message: err instanceof Error ? err.message : "Error" };
  } finally {
    isSubmitting.value = false;
    clearFeedback();
  }
}

async function saveZelle() {
  isSubmitting.value = true;
  feedback.value = null;
  try {
    const details = { email: zelleForm.email, name: zelleForm.name };
    if (zelle.value) {
      await patch(`/payment-configs/${zelle.value.id}`, { details });
    } else {
      await post("/payment-configs", { method: "zelle", details });
    }
    feedback.value = { type: "success", message: "Zelle guardado" };
    await refresh();
  } catch (err: unknown) {
    feedback.value = { type: "error", message: err instanceof Error ? err.message : "Error" };
  } finally {
    isSubmitting.value = false;
    clearFeedback();
  }
}

async function toggleCash() {
  isSubmitting.value = true;
  feedback.value = null;
  try {
    if (cash.value) {
      const newActive = !cash.value.isActive;
      await patch(`/payment-configs/${cash.value.id}`, { isActive: newActive });
    } else {
      await post("/payment-configs", { method: "cash_on_delivery", details: {} });
    }
    feedback.value = { type: "success", message: "Efectivo actualizado" };
    await refresh();
  } catch (err: unknown) {
    feedback.value = { type: "error", message: err instanceof Error ? err.message : "Error" };
  } finally {
    isSubmitting.value = false;
    clearFeedback();
  }
}
</script>

<template>
  <div class="settings-page">
    <NuxtLink to="/settings" class="back-link">&larr; Configuracion</NuxtLink>
    <h1>Metodos de pago</h1>
    <p class="subtitle">Configura los datos que veran tus compradores al pagar.</p>

    <div v-if="feedback" :class="['feedback', `feedback-${feedback.type}`]">
      {{ feedback.message }}
    </div>

    <!-- Pago Movil -->
    <section class="config-section">
      <h2>Pago Movil</h2>
      <div class="form-grid">
        <div class="form-group">
          <label for="pm-phone">Telefono</label>
          <input id="pm-phone" v-model="pmForm.phone" type="tel" placeholder="0414-1234567" />
        </div>
        <div class="form-group">
          <label for="pm-cedula">Cedula</label>
          <input id="pm-cedula" v-model="pmForm.cedula" type="text" placeholder="V-12345678" />
        </div>
        <div class="form-group">
          <label for="pm-bank">Banco</label>
          <input id="pm-bank" v-model="pmForm.bank" type="text" placeholder="Banesco" />
        </div>
      </div>
      <button class="btn-save" :disabled="isSubmitting" @click="savePagoMovil">
        {{ pagoMovil ? "Actualizar" : "Activar" }} Pago Movil
      </button>
    </section>

    <!-- Zelle -->
    <section class="config-section">
      <h2>Zelle</h2>
      <div class="form-grid">
        <div class="form-group">
          <label for="zelle-email">Email</label>
          <input
            id="zelle-email"
            v-model="zelleForm.email"
            type="email"
            placeholder="pagos@tutienda.com"
          />
        </div>
        <div class="form-group">
          <label for="zelle-name">Nombre del titular</label>
          <input id="zelle-name" v-model="zelleForm.name" type="text" placeholder="Tu nombre" />
        </div>
      </div>
      <button class="btn-save" :disabled="isSubmitting" @click="saveZelle">
        {{ zelle ? "Actualizar" : "Activar" }} Zelle
      </button>
    </section>

    <!-- Cash -->
    <section class="config-section">
      <h2>Efectivo al recibir</h2>
      <p class="cash-desc">Permite que los compradores paguen en efectivo al recibir su pedido.</p>
      <button class="btn-toggle" :disabled="isSubmitting" @click="toggleCash">
        {{ cash?.isActive ? "Desactivar" : "Activar" }} efectivo
      </button>
      <span v-if="cash?.isActive" class="active-badge">Activo</span>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 700px;
}
.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.subtitle {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}
.feedback {
  padding: 0.625rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.feedback-success {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.feedback-error {
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
}
.config-section {
  padding: 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  background: white;
}
.config-section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
.form-group label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #374151;
}
.form-group input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  box-sizing: border-box;
}
.form-group input:focus {
  outline: none;
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}
.btn-save {
  padding: 0.5rem 1.25rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.btn-save:hover:not(:disabled) {
  background: #1f2937;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cash-desc {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.75rem;
}
.btn-toggle {
  padding: 0.5rem 1.25rem;
  background: white;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-toggle:hover:not(:disabled) {
  background: #f9fafb;
}
.active-badge {
  display: inline-block;
  margin-left: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #d1fae5;
  color: #065f46;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}
</style>
