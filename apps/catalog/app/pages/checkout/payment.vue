<script setup lang="ts">
/**
 * Payment method selection — /checkout/payment
 *
 * Screen 4 from doc 04: Pago Movil, Zelle, or Cash on Delivery.
 *
 * For Pago Movil: shows merchant's bank details with "Copy all" button,
 * then a screenshot upload area.
 * For Zelle: shows merchant's email with copy button.
 * For Cash: just confirms the order.
 *
 * On submit, calls POST /checkout/:tenantSlug to create the order,
 * then navigates to the confirmation page.
 */

const tenantSlug = "demo";
const { items, totalUsd, totalBs, clear } = useCart(tenantSlug);
const { apiUrl } = useApi();
const router = useRouter();

// Load buyer info from sessionStorage.
const buyerName = useState("checkout-name", () => "");
const buyerPhone = useState("checkout-phone", () => "");
const deliveryMethod = useState<"pickup" | "delivery">("checkout-delivery", () => "pickup");
const deliveryAddress = useState("checkout-address", () => "");
const notes = useState("checkout-notes", () => "");

// Redirect if no buyer info.
if (import.meta.client && !buyerName.value) {
  router.replace("/checkout");
}

const selectedMethod = ref<"pago_movil" | "zelle" | "cash_on_delivery" | null>(null);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const copied = ref(false);

// Placeholder merchant payment details.
// TODO: Fetch from GET /checkout/:tenantSlug/payment-methods when endpoint exists.
const pagoMovilDetails = {
  phone: "0414-1234567",
  cedula: "V-12345678",
  bank: "Banesco",
};

const zelleDetails = {
  email: "pagos@tienda.com",
};

const pagoMovilText = computed(() => {
  const bs = totalBs.value;
  return [
    "Pago Movil",
    `Telefono: ${pagoMovilDetails.phone}`,
    `Cedula: ${pagoMovilDetails.cedula}`,
    `Banco: ${pagoMovilDetails.bank}`,
    bs ? `Monto: Bs ${bs.toFixed(2)}` : `Monto: $${totalUsd.value.toFixed(2)}`,
  ].join("\n");
});

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Fallback for older browsers.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  }
}

async function submitOrder() {
  if (!selectedMethod.value || isSubmitting.value) return;

  isSubmitting.value = true;
  submitError.value = null;

  try {
    const phone = buyerPhone.value.startsWith("+") ? buyerPhone.value : `+58${buyerPhone.value}`;

    const response = await $fetch<{ data: { id: string; orderNumber: string } }>(
      `${apiUrl}/checkout/${tenantSlug}`,
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
        },
      },
    );

    // Store order info for confirmation page.
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
          items: items.value,
        }),
      );
    }

    // Clear cart and checkout state.
    clear();
    if (import.meta.client) {
      sessionStorage.removeItem("qyne-checkout");
    }

    router.push("/checkout/confirmation");
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
    <NuxtLink to="/checkout" class="back-link">&larr; Volver</NuxtLink>

    <h1>Metodo de pago</h1>

    <p class="payment-total">
      Total: <strong>${{ totalUsd.toFixed(2) }}</strong>
      <span v-if="totalBs !== null" class="total-bs">(Bs {{ totalBs.toFixed(2) }})</span>
    </p>

    <!-- Method selection -->
    <div class="method-list">
      <button
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

    <!-- Pago Movil details -->
    <div v-if="selectedMethod === 'pago_movil'" class="method-details">
      <p class="method-details-title">Datos para pagar:</p>
      <div class="bank-details">
        <p>Telefono: {{ pagoMovilDetails.phone }}</p>
        <p>Cedula: {{ pagoMovilDetails.cedula }}</p>
        <p>Banco: {{ pagoMovilDetails.bank }}</p>
        <p v-if="totalBs !== null">
          <strong>Monto: Bs {{ totalBs.toFixed(2) }}</strong>
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

    <!-- Zelle details -->
    <div v-if="selectedMethod === 'zelle'" class="method-details">
      <p class="method-details-title">Datos para pagar:</p>
      <div class="bank-details">
        <p>Email: {{ zelleDetails.email }}</p>
        <p>
          <strong>Monto: ${{ totalUsd.toFixed(2) }}</strong>
        </p>
      </div>
      <button class="copy-btn" @click="copyToClipboard(zelleDetails.email)">
        {{ copied ? "Copiado!" : "Copiar email 📋" }}
      </button>
    </div>

    <!-- Cash on delivery -->
    <div v-if="selectedMethod === 'cash_on_delivery'" class="method-details">
      <p class="cash-note">
        Pagaras al recibir tu pedido. El vendedor te contactara por WhatsApp para coordinar.
      </p>
    </div>

    <!-- Error -->
    <p v-if="submitError" class="error-msg">{{ submitError }}</p>

    <!-- Submit -->
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
  transition: border-color 0.15s;
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
