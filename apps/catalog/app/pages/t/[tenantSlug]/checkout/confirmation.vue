<script setup lang="ts">
/**
 * Order confirmation — /t/:tenantSlug/checkout/confirmation
 *
 * WhatsApp deep link uses the real merchant phone from store settings.
 * Order data comes from the real API response stored in sessionStorage.
 */

const { slug: tenantSlug } = useTenant();
const router = useRouter();

interface OrderData {
  orderId: string;
  orderNumber: string;
  totalUsd: number;
  totalBs: number | null;
  paymentMethod: string;
  buyerName: string;
  buyerPhone: string;
  merchantPhone: string;
  tenantSlug: string;
  storeName: string;
  items: {
    name: string;
    variantName: string | null;
    quantity: number;
    priceUsd: string;
  }[];
}

const order = ref<OrderData | null>(null);

onMounted(() => {
  const saved = sessionStorage.getItem("qyne-order");
  if (!saved) {
    router.replace(`/t/${tenantSlug.value}`);
    return;
  }
  order.value = JSON.parse(saved) as OrderData;
});

const paymentMethodLabel = computed(() => {
  switch (order.value?.paymentMethod) {
    case "pago_movil":
      return "Pago Movil";
    case "zelle":
      return "Zelle";
    case "cash_on_delivery":
      return "Efectivo al recibir";
    default:
      return "";
  }
});

/**
 * WhatsApp deep link with structured order message.
 * Uses the real merchant phone from store settings.
 */
const whatsappUrl = computed(() => {
  if (!order.value) return "#";

  const o = order.value;
  const itemLines = o.items
    .map((i) => {
      const name = i.variantName ? `${i.name} - ${i.variantName}` : i.name;
      return `- ${name} x${i.quantity} ($${i.priceUsd})`;
    })
    .join("\n");

  const totalLine = o.totalBs
    ? `Total: $${o.totalUsd.toFixed(2)} (Bs ${o.totalBs.toFixed(2)})`
    : `Total: $${o.totalUsd.toFixed(2)}`;

  const message = [
    `Hola! Acabo de hacer el pedido ${o.orderNumber} en ${o.storeName || "tu tienda"}.`,
    "",
    "Mi pedido:",
    itemLines,
    "",
    totalLine,
    `Pago: ${paymentMethodLabel.value}`,
  ].join("\n");

  // Use merchant phone if available, otherwise open WhatsApp without a number.
  const phone = o.merchantPhone ? o.merchantPhone.replace(/[^0-9]/g, "") : "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
});

useHead({ title: "Pedido confirmado — Qyne" });
</script>

<template>
  <div class="confirmation-page">
    <div v-if="order" class="confirmation-content">
      <div class="success-icon">&#10003;</div>
      <h1>Pedido enviado</h1>

      <div class="order-summary">
        <p class="order-number">Pedido {{ order.orderNumber }}</p>
        <p class="order-total">${{ order.totalUsd.toFixed(2) }}</p>
        <p v-if="order.totalBs" class="order-total-bs">Bs {{ order.totalBs.toFixed(2) }}</p>
        <p class="order-status">Estado: Pago en verificacion</p>
      </div>

      <p class="confirmation-text">El vendedor revisara tu pago y te confirmara por WhatsApp.</p>

      <a
        v-if="order.merchantPhone"
        :href="whatsappUrl"
        target="_blank"
        rel="noopener"
        class="whatsapp-btn"
      >
        Enviar pedido por WhatsApp
      </a>

      <p v-else class="no-phone-note">El vendedor te contactara al numero que proporcionaste.</p>

      <NuxtLink :to="`/t/${tenantSlug}`" class="continue-link">Volver al catalogo</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.confirmation-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 2rem 1rem;
  text-align: center;
}
.success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  background: #059669;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.order-summary {
  padding: 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}
.order-number {
  font-weight: 600;
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}
.order-total {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.125rem;
}
.order-total-bs {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}
.order-status {
  font-size: 0.875rem;
  color: #6b7280;
}
.confirmation-text {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}
.whatsapp-btn {
  display: block;
  width: 100%;
  padding: 0.875rem;
  background: #25d366;
  color: white;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 1rem;
}
.whatsapp-btn:hover {
  background: #1da851;
}
.no-phone-note {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
}
.continue-link {
  display: inline-block;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
}
.continue-link:hover {
  color: #111827;
}
</style>
