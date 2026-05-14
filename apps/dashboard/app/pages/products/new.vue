<script setup lang="ts">
/**
 * Create product page — /products/new
 * Form for creating a new product with image upload.
 */
useHead({ title: "Nuevo producto — Qyne" });

const form = reactive({
  name: "",
  slug: "",
  description: "",
  priceUsd: "",
  priceBs: "",
  costUsd: "",
  sku: "",
  categoryId: "",
  stock: 0,
  status: "active" as "active" | "draft",
});

const isSubmitting = ref(false);
const error = ref<string | null>(null);

// Auto-generate slug from name.
watch(
  () => form.name,
  (name) => {
    form.slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  },
);

async function handleSubmit() {
  if (!form.name || !form.slug) {
    error.value = "Nombre y slug son requeridos";
    return;
  }

  isSubmitting.value = true;
  error.value = null;

  try {
    // TODO: Replace with real API call via useApi().
    console.log("Creating product:", form);
    await navigateTo("/products");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Error al crear producto";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="create-product">
    <div class="page-header">
      <NuxtLink to="/products" class="back-link">&larr; Productos</NuxtLink>
      <h1>Nuevo producto</h1>
    </div>

    <form class="product-form" @submit.prevent="handleSubmit">
      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="form-section">
        <h2>Informacion basica</h2>

        <div class="form-group">
          <label for="name">Nombre *</label>
          <input
            id="name"
            v-model="form.name"
            type="text"
            placeholder="Ej: Camisa Polo Azul"
            required
          />
        </div>

        <div class="form-group">
          <label for="slug">URL del catalogo</label>
          <div class="slug-preview">
            tu-tienda.qyne.app/p/<strong>{{ form.slug || "..." }}</strong>
          </div>
          <input id="slug" v-model="form.slug" type="text" placeholder="camisa-polo-azul" />
        </div>

        <div class="form-group">
          <label for="description">Descripcion</label>
          <textarea
            id="description"
            v-model="form.description"
            rows="3"
            placeholder="Describe tu producto..."
          />
        </div>
      </div>

      <div class="form-section">
        <h2>Precio e inventario</h2>

        <div class="form-row">
          <div class="form-group">
            <label for="priceUsd">Precio USD</label>
            <input id="priceUsd" v-model="form.priceUsd" type="text" placeholder="25.00" />
          </div>
          <div class="form-group">
            <label for="priceBs">Precio Bs</label>
            <input id="priceBs" v-model="form.priceBs" type="text" placeholder="950.00" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="costUsd">Costo USD</label>
            <input id="costUsd" v-model="form.costUsd" type="text" placeholder="12.00" />
          </div>
          <div class="form-group">
            <label for="stock">Stock</label>
            <input id="stock" v-model.number="form.stock" type="number" min="0" />
          </div>
        </div>

        <div class="form-group">
          <label for="sku">SKU</label>
          <input id="sku" v-model="form.sku" type="text" placeholder="POLO-AZ-001" />
        </div>
      </div>

      <div class="form-section">
        <h2>Fotos</h2>
        <div class="image-upload-area">
          <p>Arrastra fotos aqui o haz clic para seleccionar</p>
          <p class="upload-hint">JPEG, PNG, WebP. Maximo 5 MB.</p>
          <!-- TODO: Wire up real file upload to /uploads/image endpoint -->
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="navigateTo('/products')">
          Cancelar
        </button>
        <button type="submit" class="btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? "Creando..." : "Crear producto" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-product {
  max-width: 700px;
}

.page-header {
  margin-bottom: 1.5rem;
}

.back-link {
  display: inline-block;
  margin-bottom: 0.5rem;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.form-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.form-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.form-section h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #374151;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}

.slug-preview {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.image-upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  cursor: pointer;
}

.image-upload-area:hover {
  border-color: #9ca3af;
}

.upload-hint {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-primary {
  padding: 0.5rem 1.25rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  background: #1f2937;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.5rem 1.25rem;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #f9fafb;
}
</style>
