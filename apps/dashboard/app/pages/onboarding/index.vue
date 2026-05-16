<script setup lang="ts">
/**
 * Onboarding wizard — /onboarding
 *
 * 3-step flow for new merchants:
 *   Step 1: Create store (name + slug)
 *   Step 2: Configure payment methods (Pago Movil / Zelle)
 *   Step 3: Add first product
 *
 * After completion, redirects to dashboard home.
 * No layout wrapper — standalone full-screen page.
 */

definePageMeta({ layout: false });
useHead({ title: "Configura tu tienda — Qyne" });

const { post, patch, upload, resolveTenant, tenantId } = useApi();
const router = useRouter();

const step = ref(1);
const isSubmitting = ref(false);
const error = ref<string | null>(null);

// --- Step 1: Store info ---
const storeName = ref("");
const storeSlug = ref("");

// Auto-generate slug from name.
watch(storeName, (name) => {
  storeSlug.value = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
});

async function createStore() {
  if (!storeName.value.trim() || !storeSlug.value.trim()) return;
  isSubmitting.value = true;
  error.value = null;

  try {
    await post("/tenants", {
      name: storeName.value.trim(),
      slug: storeSlug.value.trim(),
    });
    // Resolve the newly created tenant.
    await resolveTenant();
    step.value = 2;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("409")) {
      error.value = "Ese slug ya esta en uso. Prueba con otro.";
    } else {
      error.value = err instanceof Error ? err.message : "Error al crear la tienda";
    }
  } finally {
    isSubmitting.value = false;
  }
}

// --- Step 2: Payment methods ---
const pmPhone = ref("");
const pmCedula = ref("");
const pmBank = ref("");
const zelleEmail = ref("");

async function savePayments() {
  isSubmitting.value = true;
  error.value = null;

  try {
    // Save Pago Movil if filled.
    if (pmPhone.value.trim()) {
      await post("/payment-configs", {
        method: "pago_movil",
        details: {
          phone: pmPhone.value.trim(),
          cedula: pmCedula.value.trim(),
          bank: pmBank.value.trim(),
        },
      });
    }

    // Save Zelle if filled.
    if (zelleEmail.value.trim()) {
      await post("/payment-configs", {
        method: "zelle",
        details: { email: zelleEmail.value.trim() },
      });
    }

    step.value = 3;
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : "Error al guardar";
  } finally {
    isSubmitting.value = false;
  }
}

// --- Step 3: First product ---
const productName = ref("");
const productPrice = ref("");
const productImage = ref<{ url: string; key: string } | null>(null);
const isUploadingImage = ref(false);

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isUploadingImage.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await upload<{ url: string; key: string }>("/uploads/image", formData);
    productImage.value = result;
  } catch {
    error.value = "Error al subir la imagen";
  } finally {
    isUploadingImage.value = false;
  }
}

async function createProduct() {
  if (!productName.value.trim()) return;
  isSubmitting.value = true;
  error.value = null;

  const slug = productName.value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  try {
    await post("/products", {
      name: productName.value.trim(),
      slug,
      priceUsd: productPrice.value || null,
      stock: 1,
      status: "active",
      images: productImage.value ? [productImage.value] : [],
    });

    // Done! Go to dashboard.
    router.replace("/");
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : "Error al crear producto";
  } finally {
    isSubmitting.value = false;
  }
}

function skipToEnd() {
  router.replace("/");
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding-container">
      <!-- Progress -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${(step / 3) * 100}%` }"></div>
      </div>
      <p class="step-indicator">Paso {{ step }} de 3</p>

      <!-- Error -->
      <div v-if="error" class="error-msg">{{ error }}</div>

      <!-- Step 1: Create store -->
      <div v-if="step === 1" class="step">
        <h1>Crea tu tienda</h1>
        <p class="step-desc">
          Elige un nombre para tu tienda. Tus compradores lo veran en el catalogo.
        </p>

        <div class="form-group">
          <label for="store-name">Nombre de la tienda *</label>
          <input
            id="store-name"
            v-model="storeName"
            type="text"
            placeholder="Ej: Moda Express"
            autofocus
          />
        </div>

        <div class="form-group">
          <label for="store-slug">URL del catalogo</label>
          <div class="slug-preview">
            <span class="slug-prefix">martes.app/t/</span>
            <input id="store-slug" v-model="storeSlug" type="text" placeholder="moda-express" />
          </div>
        </div>

        <button
          class="btn-primary"
          :disabled="isSubmitting || !storeName.trim() || !storeSlug.trim()"
          @click="createStore"
        >
          {{ isSubmitting ? "Creando..." : "Crear tienda" }}
        </button>
      </div>

      <!-- Step 2: Payment methods -->
      <div v-if="step === 2" class="step">
        <h1>Metodos de pago</h1>
        <p class="step-desc">Configura como te pagan tus clientes. Puedes agregar mas despues.</p>

        <div class="payment-section">
          <h3>Pago Movil</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="pm-phone">Telefono</label>
              <input id="pm-phone" v-model="pmPhone" type="tel" placeholder="0414-1234567" />
            </div>
            <div class="form-group">
              <label for="pm-cedula">Cedula</label>
              <input id="pm-cedula" v-model="pmCedula" type="text" placeholder="V-12345678" />
            </div>
          </div>
          <div class="form-group">
            <label for="pm-bank">Banco</label>
            <input id="pm-bank" v-model="pmBank" type="text" placeholder="Banesco" />
          </div>
        </div>

        <div class="payment-section">
          <h3>Zelle</h3>
          <div class="form-group">
            <label for="zelle-email">Email de Zelle</label>
            <input
              id="zelle-email"
              v-model="zelleEmail"
              type="email"
              placeholder="pagos@tutienda.com"
            />
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-primary" :disabled="isSubmitting" @click="savePayments">
            {{ isSubmitting ? "Guardando..." : "Continuar" }}
          </button>
          <button class="btn-skip" @click="step = 3">Saltar por ahora</button>
        </div>
      </div>

      <!-- Step 3: First product -->
      <div v-if="step === 3" class="step">
        <h1>Tu primer producto</h1>
        <p class="step-desc">
          Agrega un producto para que tus clientes puedan verlo en tu catalogo.
        </p>

        <div class="form-group">
          <label for="product-name">Nombre del producto *</label>
          <input
            id="product-name"
            v-model="productName"
            type="text"
            placeholder="Ej: Camisa Polo Azul"
          />
        </div>

        <div class="form-group">
          <label for="product-price">Precio (USD)</label>
          <input
            id="product-price"
            v-model="productPrice"
            type="text"
            inputmode="decimal"
            placeholder="25.00"
          />
        </div>

        <div class="form-group">
          <label>Foto del producto</label>
          <div v-if="productImage" class="image-preview">
            <img :src="productImage.url" alt="Producto" />
            <button class="remove-image" @click="productImage = null">Quitar</button>
          </div>
          <label v-else class="upload-area">
            <input type="file" accept="image/*" hidden @change="handleImageUpload" />
            <span v-if="isUploadingImage">Subiendo...</span>
            <span v-else>Toca para subir una foto</span>
          </label>
        </div>

        <div class="step-actions">
          <button
            class="btn-primary"
            :disabled="isSubmitting || !productName.trim()"
            @click="createProduct"
          >
            {{ isSubmitting ? "Creando..." : "Crear producto y empezar" }}
          </button>
          <button class="btn-skip" @click="skipToEnd">Saltar y empezar sin productos</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  min-height: 100vh;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.onboarding-container {
  width: 100%;
  max-width: 500px;
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.progress-bar {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  margin-bottom: 0.5rem;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #111827;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.step-indicator {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 1.5rem;
}

.error-msg {
  padding: 0.625rem 1rem;
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.step h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.375rem;
}

.step-desc {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
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

.form-group input[type="text"],
.form-group input[type="tel"],
.form-group input[type="email"] {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 1rem;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}

.slug-preview {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  overflow: hidden;
}

.slug-prefix {
  padding: 0.625rem 0.5rem 0.625rem 0.75rem;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 0.875rem;
  white-space: nowrap;
  border-right: 1px solid #d1d5db;
}

.slug-preview input {
  border: none !important;
  border-radius: 0 !important;
  flex: 1;
}

.slug-preview input:focus {
  box-shadow: none !important;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.payment-section {
  margin-bottom: 1.5rem;
}

.payment-section h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.image-preview {
  position: relative;
  display: inline-block;
}

.image-preview img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.remove-image {
  position: absolute;
  top: -0.5rem;
  right: -0.5rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 9999px;
  width: 24px;
  height: 24px;
  font-size: 0.75rem;
  cursor: pointer;
}

.upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  font-size: 0.8125rem;
  text-align: center;
  padding: 0.5rem;
}

.upload-area:hover {
  border-color: #9ca3af;
}

.step-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.btn-primary {
  width: 100%;
  padding: 0.75rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  background: #1f2937;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-skip {
  width: 100%;
  padding: 0.5rem;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-skip:hover {
  color: #111827;
}
</style>
