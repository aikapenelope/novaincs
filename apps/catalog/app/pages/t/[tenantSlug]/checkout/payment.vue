<script setup lang="ts">
/**
 * Payment method — /t/:tenantSlug/checkout/payment
 *
 * Fetches real payment config from the API. Creates real orders.
 * No placeholders.
 */

const { slug: tenantSlug, store, fetchStore } = useTenant();
const { items, totalUsd, totalBs, clear } = useCart(tenantSlug.value);
const { get, apiUrl } = useApi();
const { getVisitorId } = useBeacon();
const router = useRouter();

await fetchStore();

const buyerName = useState("checkout-name", () => "");
const buyerPhone = useState("checkout-phone", () => "");
const deliveryMethod = useState<"pickup" | "delivery">("checkout-delivery", () => "pickup");
const deliveryAddress = useState("checkout-address", () => "");
const notes = useState("checkout-notes", () => "");

if (import.meta.client && !buyerName.value) {
  router.replace(`/t/${tenantSlug.value}/checkout`);
}

// Fetch real payment methods from API.
interface PaymentConfig {
  method: string;
  label: string | null;
  details: Record<string, string>;
}

const { data: paymentMethods } = await useAsyncData(`payment-methods-${tenantSlug.value}`, () =>
  get<PaymentConfig[]>(`/catalog/${tenantSlug.value}/payment-methods`),
);

const pagoMovil = computed(() =>
  (paymentMethods.value ?? []).find((m) => m.method === "pago_movil"),
);
const zelle = computed(() => (paymentMethods.value ?? []).find((m) => m.method === "zelle"));
const hasCash = computed(() =>
  (paymentMethods.value ?? []).some((m) => m.method === "cash_on_delivery"),
);

// If no payment methods configured, show all as available (fallback).
const showAllMethods = computed(() => !paymentMethods.value || paymentMethods.value.length === 0);

const selectedMethod = ref<"pago_movil" | "zelle" | "cash_on_delivery" | null>(null);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const copied = ref(false);

const pagoMovilText = computed(() => {
  const details = pagoMovil.value?.details ?? {};
  const bs = totalBs.value;
  return [
    "Pago Movil",
    details.phone ? `Telefono: ${details.phone}` : "",
    details.cedula ? `Cedula: ${details.cedula}` : "",
    details.bank ? `Banco: ${details.bank}` : "",
    bs ? `Monto: Bs ${bs.toFixed(2)}` : `Monto: $${totalUsd.value.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join("\n");
});

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function submitOrder() {
  if (!selectedMethod.value || isSubmitting.value) return;

  isSubmitting.value = true;
  submitError.value = null;

  try {
    const phone = buyerPhone.value.startsWith("+") ? buyerPhone.value : `+58${buyerPhone.value}`;

    const response = await $fetch<{ data: { id: string; orderNumber: string } }>(
      `${apiUrl}/checkout/${tenantSlug.value}`,
      {
        method: "POST",
        body: {
          buyerName: buyerName.value,
          buyerPhone: phone,
          deliveryMethod: deliveryMethod.value,
          deliveryAddress: deliveryAddress.value || null,
          paymentMethod: selectedMethod.value,
          notes: notes.value || null,
          items: items.value.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || undefined,
            quantity: item.quantity,
          })),
          visitorId: getVisitorId() || undefined,
        },
      },
    );

    // Get merchant phone from store settings for WhatsApp link.
    const storeSettings = (store.value as any)?.settings as Record<string, string> | undefined;
    const merchantPhone = storeSettings?.whatsappPhone || storeSettings?.phone || "";

    if (import.meta.client) {
      sessionStorage.setItem(
        "qyne-order",
        JSON.stringify({
          orderId: response.data.id,
          orderNumber: response.data.orderNumber,
          totalUsd: totalUsd.value,
          totalBs: totalBs.value,
          paymentMethod: selectedMethod.value,
          buyerName: buyerName.value,
          buyerPhone: phone,
          merchantPhone,
          tenantSlug: tenantSlug.value,
          storeName: store.value?.name || "",
          items: items.value,
        }),
      );
    }

    clear();
    if (import.meta.client) {
      sessionStorage.removeItem("qyne-checkout");
    }

    router.push(`/t/${tenantSlug.value}/checkout/confirmation`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al crear el pedido";
    submitError.value = message;
  } finally {
    isSubmitting.value = false;
  }
}

useHead({ title: "Metodo de pago — Qyne" });
</script>

<template>
  <div class="payment-page">
    <NuxtLink :to="`/t/${tenantSlug}/checkout`" class="back-link">&larr; Volver</NuxtLink>

    <h1>Metodo de pago</h1>

    <p class="payment-total">
      Total: <strong>${{ totalUsd.toFixed(2) }}</strong>
      <span v-if="totalBs !== null" class="total-bs">(Bs {{ totalBs.toFixed(2) }})</span>
    </p>

    <div class="method-list">
      <button
        v-if="showAllMethods || pagoMovil"
        :class="['method-btn', { selected: selectedMethod === 'pago_movil' }]"
        @click="selectedMethod = 'pago_movil'"
      >
        <span class="method-icon">🏦</span>
        <span class="method-info">
          <strong>Pago Movil</strong>
          <small>Paga desde tu app bancaria</small>
        </span>
      </button>

      <button
        v-if="showAllMethods || zelle"
        :class="['method-btn', { selected: selectedMethod === 'zelle' }]"
        @click="selectedMethod = 'zelle'"
      >
        <span class="method-icon">💵</span>
        <span class="method-info">
          <strong>Zelle</strong>
          <small>Transferencia en USD</small>
        </span>
      </button>

      <button
        v-if="showAllMethods || hasCash"
        :class="['method-btn', { selected: selectedMethod === 'cash_on_delivery' }]"
        @click="selectedMethod = 'cash_on_delivery'"
      >
        <span class="method-icon">💰</span>
        <span class="method-info">
          <strong>Efectivo</strong>
          <small>Pago al recibir</small>
        </span>
      </button>
    </div>

    <!-- Pago Movil details from real config -->
    <div v-if="selectedMethod === 'pago_movil' && pagoMovil" class="method-details">
      <p class="method-details-title">Datos para pagar:</p>
      <div class="bank-details">
        <p v-if="pagoMovil.details.phone">Telefono: {{ pagoMovil.details.phone }}</p>
        <p v-if="pagoMovil.details.cedula">Cedula: {{ pagoMovil.details.cedula }}</p>
        <p v-if="pagoMovil.details.bank">Banco: {{ pagoMovil.details.bank }}</p>
        <p v-if="totalBs !== null">
          <strong>Monto: Bs {{ totalBs.toFixed(2) }}</strong>
        </p>
        <p v-else>
          <strong>Monto: ${{ totalUsd.toFixed(2) }}</strong>
        </p>
      </div>
      <button class="copy-btn" @click="copyToClipboard(pagoMovilText)">
        {{ copied ? "Copiado!" : "Copiar todo 📋" }}
      </button>
      <ol class="instructions">
        <li>Copia los datos arriba</li>
        <li>Abre tu app bancaria</li>
        <li>Realiza el Pago Movil</li>
        <li>Vuelve aqui y confirma</li>
      </ol>
    </div>

    <div
      v-if="selectedMethod === 'pago_movil' && !pagoMovil && !showAllMethods"
      class="method-details"
    >
      <p class="cash-note">
        El vendedor no ha configurado Pago Movil. Contactalo por WhatsApp para coordinar.
      </p>
    </div>

    <!-- Zelle details from real config -->
    <div v-if="selectedMethod === 'zelle' && zelle" class="method-details">
      <p class="method-details-title">Datos para pagar:</p>
      <div class="bank-details">
        <p v-if="zelle.details.email">Email: {{ zelle.details.email }}</p>
        <p v-if="zelle.details.name">Nombre: {{ zelle.details.name }}</p>
        <p>
          <strong>Monto: ${{ totalUsd.toFixed(2) }}</strong>
        </p>
      </div>
      <button
        v-if="zelle.details.email"
        class="copy-btn"
        @click="copyToClipboard(zelle.details.email)"
      >
        {{ copied ? "Copiado!" : "Copiar email 📋" }}
      </button>
    </div>

    <div v-if="selectedMethod === 'cash_on_delivery'" class="method-details">
      <p class="cash-note">
        Pagaras al recibir tu pedido. El vendedor te contactara por WhatsApp para coordinar.
      </p>
    </div>

    <p v-if="submitError" class="error-msg">{{ submitError }}</p>

    <button v-if="selectedMethod" class="submit-btn" :disabled="isSubmitting" @click="submitOrder">
      {{ isSubmitting ? "Enviando..." : "Confirmar pedido →" }}
    </button>
  </div>
</template>

<style scoped>
.payment-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
  padding-bottom: 6rem;
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
  margin-bottom: 0.5rem;
}
.payment-total {
  font-size: 1rem;
  margin-bottom: 1.5rem;
  color: #374151;
}
.total-bs {
  color: #6b7280;
  font-size: 0.875rem;
}
.method-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.method-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: white;
  cursor: pointer;
  text-align: left;
}
.method-btn:hover {
  border-color: #9ca3af;
}
.method-btn.selected {
  border-color: #111827;
  background: #f9fafb;
}
.method-icon {
  font-size: 1.5rem;
}
.method-info {
  display: flex;
  flex-direction: column;
}
.method-info strong {
  font-size: 0.9375rem;
}
.method-info small {
  font-size: 0.75rem;
  color: #6b7280;
}
.method-details {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  background: #f9fafb;
}
.method-details-title {
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}
.bank-details {
  padding: 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
}
.copy-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  margin-bottom: 1rem;
}
.copy-btn:hover {
  background: #1f2937;
}
.instructions {
  font-size: 0.8125rem;
  color: #6b7280;
  padding-left: 1.25rem;
  line-height: 1.8;
}
.cash-note {
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.5;
}
.error-msg {
  color: #ef4444;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.submit-btn {
  display: block;
  width: 100%;
  padding: 0.875rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}
.submit-btn:hover:not(:disabled) {
  background: #1f2937;
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
