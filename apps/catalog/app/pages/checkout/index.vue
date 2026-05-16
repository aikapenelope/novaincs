<script setup lang="ts">
/**
 * Checkout page — /checkout
 *
 * Screen 3 from doc 04: Buyer info (name, phone, delivery method).
 * Only 2 required fields: name + WhatsApp number.
 * Phone field triggers numeric keyboard via inputmode="tel".
 * +58 country code is pre-filled.
 *
 * After filling in info, buyer proceeds to payment method selection.
 */

const tenantSlug = "demo";
const { items, totalUsd, totalBs, itemCount } = useCart(tenantSlug);
const router = useRouter();

// Redirect to cart if empty.
if (import.meta.client && itemCount.value === 0) {
  router.replace("/cart");
}

// Form state — persisted in sessionStorage to survive app-switch.
const buyerName = useState("checkout-name", () => "");
const buyerPhone = useState("checkout-phone", () => "");
const deliveryMethod = useState<"pickup" | "delivery">("checkout-delivery", () => "pickup");
const deliveryAddress = useState("checkout-address", () => "");
const notes = useState("checkout-notes", () => "");

// Load from sessionStorage on client.
onMounted(() => {
  const saved = sessionStorage.getItem("qyne-checkout");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      buyerName.value = data.buyerName || "";
      buyerPhone.value = data.buyerPhone || "";
      deliveryMethod.value = data.deliveryMethod || "pickup";
      deliveryAddress.value = data.deliveryAddress || "";
      notes.value = data.notes || "";
    } catch {
      // Ignore corrupt data.
    }
  }
});

// Save to sessionStorage on change.
function persistCheckout() {
  if (import.meta.server) return;
  sessionStorage.setItem(
    "qyne-checkout",
    JSON.stringify({
      buyerName: buyerName.value,
      buyerPhone: buyerPhone.value,
      deliveryMethod: deliveryMethod.value,
      deliveryAddress: deliveryAddress.value,
      notes: notes.value,
    }),
  );
}

watch([buyerName, buyerPhone, deliveryMethod, deliveryAddress, notes], persistCheckout);

const isValid = computed(() => {
  return buyerName.value.trim().length > 0 && buyerPhone.value.trim().length >= 7;
});

function proceed() {
  if (!isValid.value) return;
  persistCheckout();
  router.push("/checkout/payment");
}

useHead({ title: "Checkout — Qyne" });
</script>

<template>
  <div class="checkout-page">
    <NuxtLink to="/cart" class="back-link">&larr; Volver al carrito</NuxtLink>

    <h1>Datos de envio</h1>

    <div class="checkout-form">
      <div class="form-group">
        <label for="buyer-name">Nombre *</label>
        <input
          id="buyer-name"
          v-model="buyerName"
          type="text"
          placeholder="Tu nombre"
          autocomplete="name"
          required
        />
      </div>

      <div class="form-group">
        <label for="buyer-phone">WhatsApp *</label>
        <div class="phone-input">
          <span class="phone-prefix">+58</span>
          <input
            id="buyer-phone"
            v-model="buyerPhone"
            type="tel"
            inputmode="tel"
            placeholder="4141234567"
            autocomplete="tel"
            required
          />
        </div>
      </div>

      <div class="form-group">
        <label>Metodo de entrega</label>
        <div class="delivery-options">
          <label class="radio-option">
            <input v-model="deliveryMethod" type="radio" value="pickup" />
            <span>Retiro en tienda (gratis)</span>
          </label>
          <label class="radio-option">
            <input v-model="deliveryMethod" type="radio" value="delivery" />
            <span>Delivery</span>
          </label>
        </div>
      </div>

      <div v-if="deliveryMethod === 'delivery'" class="form-group">
        <label for="delivery-address">Zona / Direccion</label>
        <input
          id="delivery-address"
          v-model="deliveryAddress"
          type="text"
          placeholder="Ej: Chacao, Caracas"
        />
      </div>

      <div class="form-group">
        <label for="notes">Nota para el vendedor (opcional)</label>
        <textarea
          id="notes"
          v-model="notes"
          rows="2"
          placeholder="Ej: Talla M por favor"
        ></textarea>
      </div>
    </div>

    <div class="checkout-summary">
      <div class="summary-row">
        <span>{{ itemCount }} {{ itemCount === 1 ? "producto" : "productos" }}</span>
        <span>${{ totalUsd.toFixed(2) }}</span>
      </div>
      <div v-if="totalBs !== null" class="summary-row summary-bs">
        <span>En bolivares</span>
        <span>Bs {{ totalBs.toFixed(2) }}</span>
      </div>
    </div>

    <button class="proceed-btn" :disabled="!isValid" @click="proceed">
      Elegir metodo de pago &rarr;
    </button>
  </div>
</template>

<style scoped>
.checkout-page {
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
  margin-bottom: 1.5rem;
}

.checkout-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: #374151;
}

.form-group input[type="text"],
.form-group input[type="tel"],
.form-group textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}

.phone-input {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  overflow: hidden;
}

.phone-prefix {
  padding: 0.625rem 0.75rem;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 1rem;
  border-right: 1px solid #d1d5db;
  white-space: nowrap;
}

.phone-input input {
  border: none !important;
  border-radius: 0 !important;
  flex: 1;
}

.phone-input input:focus {
  box-shadow: none !important;
}

.delivery-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.radio-option:has(input:checked) {
  border-color: #111827;
  background: #f9fafb;
}

.radio-option input[type="radio"] {
  accent-color: #111827;
}

.checkout-summary {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
  margin-bottom: 1.5rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.summary-bs {
  color: #6b7280;
  font-size: 0.8125rem;
}

.proceed-btn {
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

.proceed-btn:hover:not(:disabled) {
  background: #1f2937;
}

.proceed-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
