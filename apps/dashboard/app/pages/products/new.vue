<script setup lang="ts">
/**
 * Create product page — /products/new
 * Form for creating a new product with image upload and category selector.
 */
useHead({ title: "Nuevo producto — Qyne" });

const { get, post, upload } = useApi();
const router = useRouter();

const form = reactive({
  name: "",
  slug: "",
  description: "",
  priceUsd: "",
  priceBs: "",
  costUsd: "",
  sku: "",
  categoryId: "" as string | null,
  stock: 0,
  status: "active" as "active" | "draft",
  images: [] as { url: string; key: string }[],
});

const isSubmitting = ref(false);
const error = ref<string | null>(null);
const isUploadingImage = ref(false);

// Load categories for the selector.
interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}
const categories = ref<Category[]>([]);

onMounted(async () => {
  try {
    categories.value = await get<Category[]>("/categories");
  } catch {
    // Categories may not exist yet — not a blocking error.
  }
});

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

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Client-side validation.
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowedTypes.includes(file.type)) {
    error.value = "Formato no soportado. Usa JPEG, PNG o WebP.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = "La imagen es muy grande. Maximo 5 MB.";
    return;
  }

  isUploadingImage.value = true;
  error.value = null;

  try {
    const formData = new FormData();
    formData.append("file", file);

    const result = await upload<{ url: string; key: string }>("/uploads/image", formData);

    form.images.push({ url: result.url, key: result.key });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Error al subir imagen";
  } finally {
    isUploadingImage.value = false;
    // Reset input so the same file can be selected again.
    input.value = "";
  }
}

function removeImage(index: number) {
  form.images.splice(index, 1);
}

async function handleSubmit() {
  if (!form.name || !form.slug) {
    error.value = "Nombre es requerido";
    return;
  }

  isSubmitting.value = true;
  error.value = null;

  try {
    await post("/products", {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      priceUsd: form.priceUsd || null,
      priceBs: form.priceBs || null,
      costUsd: form.costUsd || null,
      sku: form.sku || null,
      categoryId: form.categoryId || null,
      stock: form.stock,
      status: form.status,
      images: form.images,
    });
    await router.push("/products");
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

        <div class="form-group">
          <label for="categoryId">Categoria</label>
          <select id="categoryId" v-model="form.categoryId">
            <option value="">Sin categoria</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="status">Estado</label>
          <select id="status" v-model="form.status">
            <option value="active">Activo (visible en catalogo)</option>
            <option value="draft">Borrador (no visible)</option>
          </select>
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

        <!-- Uploaded images preview -->
        <div v-if="form.images.length > 0" class="image-preview-grid">
          <div v-for="(img, idx) in form.images" :key="img.key" class="image-preview">
            <img :src="img.url" alt="Producto" />
            <button type="button" class="remove-image-btn" @click="removeImage(idx)">x</button>
          </div>
        </div>

        <!-- Upload area -->
        <label class="image-upload-area" :class="{ uploading: isUploadingImage }">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            class="file-input-hidden"
            :disabled="isUploadingImage"
            @change="handleImageUpload"
          />
          <span v-if="isUploadingImage">Subiendo...</span>
          <span v-else>
            <span class="upload-icon">+</span>
            Agregar foto
          </span>
          <p class="upload-hint">JPEG, PNG, WebP. Maximo 5 MB.</p>
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="router.push('/products')">
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
  background: white;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
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

/* Image upload */
.image-preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.image-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 0.375rem;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-image-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.image-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 1.5rem;
  text-align: center;
  color: #6b7280;
  cursor: pointer;
  transition: border-color 0.2s;
}

.image-upload-area:hover {
  border-color: #9ca3af;
}

.image-upload-area.uploading {
  opacity: 0.6;
  cursor: wait;
}

.file-input-hidden {
  display: none;
}

.upload-icon {
  display: block;
  font-size: 1.5rem;
  font-weight: 300;
  margin-bottom: 0.25rem;
}

.upload-hint {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

/* Actions */
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
