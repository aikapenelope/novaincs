<script setup lang="ts">
/**
 * Store settings — /settings
 *
 * Merchant configures store name, description, WhatsApp phone,
 * and other tenant-level settings. The WhatsApp phone is used
 * in the checkout confirmation deep link.
 */

useHead({ title: "Configuracion — Qyne" });

const { get, patch } = useApi();

interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  domain: string | null;
  settings: Record<string, string>;
}

const { data: tenant, refresh } = await useAsyncData("tenant-settings", () =>
  get<Tenant>("/tenants/me"),
);

const form = reactive({
  name: "",
  description: "",
  whatsappPhone: "",
});

const isSubmitting = ref(false);
const feedback = ref<{ type: "success" | "error"; message: string } | null>(null);

function clearFeedback() {
  setTimeout(() => (feedback.value = null), 3000);
}

watch(
  tenant,
  (val) => {
    if (!val) return;
    form.name = val.name || "";
    form.description = val.description || "";
    form.whatsappPhone = val.settings?.whatsappPhone || "";
  },
  { immediate: true },
);

async function save() {
  if (!tenant.value) return;
  isSubmitting.value = true;
  feedback.value = null;

  try {
    await patch(`/tenants/${tenant.value.id}`, {
      name: form.name,
      description: form.description || null,
      settings: {
        ...tenant.value.settings,
        whatsappPhone: form.whatsappPhone,
      },
    });
    feedback.value = { type: "success", message: "Configuracion guardada" };
    await refresh();
  } catch (err: unknown) {
    feedback.value = {
      type: "error",
      message: err instanceof Error ? err.message : "Error al guardar",
    };
  } finally {
    isSubmitting.value = false;
    clearFeedback();
  }
}

const catalogUrl = computed(() => {
  if (!tenant.value) return "";
  return `/t/${tenant.value.slug}`;
});
</script>

<template>
  <div class="settings-page">
    <h1>Configuracion</h1>

    <div v-if="!tenant" class="loading">Cargando...</div>

    <template v-else>
      <div v-if="feedback" :class="['feedback', `feedback-${feedback.type}`]">
        {{ feedback.message }}
      </div>

      <!-- Store info -->
      <section class="config-section">
        <h2>Tu tienda</h2>

        <div class="form-group">
          <label for="store-name">Nombre de la tienda *</label>
          <input id="store-name" v-model="form.name" type="text" placeholder="Mi Tienda" />
        </div>

        <div class="form-group">
          <label for="store-desc">Descripcion</label>
          <textarea
            id="store-desc"
            v-model="form.description"
            rows="2"
            placeholder="Describe tu tienda en una frase"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="store-slug">URL del catalogo</label>
          <div class="slug-display">
            <span class="slug-prefix">martes.app</span>
            <span class="slug-value">{{ catalogUrl }}</span>
          </div>
          <p class="form-hint">El slug no se puede cambiar despues de creado.</p>
        </div>
      </section>

      <!-- WhatsApp -->
      <section class="config-section">
        <h2>WhatsApp</h2>
        <p class="section-desc">
          Este numero se usa en el boton "Enviar pedido por WhatsApp" que ven tus compradores
          despues de hacer un pedido.
        </p>

        <div class="form-group">
          <label for="wa-phone">Numero de WhatsApp</label>
          <div class="phone-input">
            <span class="phone-prefix">+58</span>
            <input
              id="wa-phone"
              v-model="form.whatsappPhone"
              type="tel"
              inputmode="tel"
              placeholder="4141234567"
            />
          </div>
          <p class="form-hint">Sin el +58. Solo los digitos (ej: 4141234567).</p>
        </div>
      </section>

      <button class="btn-save" :disabled="isSubmitting || !form.name.trim()" @click="save">
        {{ isSubmitting ? "Guardando..." : "Guardar cambios" }}
      </button>

      <!-- Quick links -->
      <section class="config-section links-section">
        <h2>Configuracion adicional</h2>
        <NuxtLink to="/settings/payments" class="settings-link">
          Metodos de pago &rarr;
          <span class="link-desc">Configura Pago Movil, Zelle y efectivo</span>
        </NuxtLink>
      </section>
    </template>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 700px;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.loading {
  color: #6b7280;
  padding: 2rem 0;
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
  margin-bottom: 0.75rem;
}
.section-desc {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
  line-height: 1.5;
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #374151;
}
.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  box-sizing: border-box;
}
.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}
.form-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}
.slug-display {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.slug-prefix {
  color: #6b7280;
}
.slug-value {
  font-weight: 500;
  color: #111827;
}
.phone-input {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  overflow: hidden;
}
.phone-prefix {
  padding: 0.5rem 0.75rem;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 0.875rem;
  border-right: 1px solid #d1d5db;
}
.phone-input input {
  border: none !important;
  border-radius: 0 !important;
  flex: 1;
}
.phone-input input:focus {
  box-shadow: none !important;
}
.btn-save {
  padding: 0.625rem 1.5rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 2rem;
}
.btn-save:hover:not(:disabled) {
  background: #1f2937;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.links-section {
  padding: 0;
  overflow: hidden;
}
.links-section h2 {
  padding: 1.25rem 1.25rem 0.5rem;
}
.settings-link {
  display: block;
  padding: 1rem 1.25rem;
  text-decoration: none;
  color: #111827;
  font-weight: 500;
  font-size: 0.9375rem;
  border-top: 1px solid #e5e7eb;
}
.settings-link:hover {
  background: #f9fafb;
}
.link-desc {
  display: block;
  font-size: 0.8125rem;
  color: #6b7280;
  font-weight: 400;
  margin-top: 0.125rem;
}
</style>
