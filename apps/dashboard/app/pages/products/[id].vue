<script setup lang="ts">
/**
 * Edit product page — /products/:id
 * Loads existing product data and allows editing all fields.
 * Reuses the same form structure as the create page.
 */

const route = useRoute();
const router = useRouter();
const productId = route.params.id as string;
const { get, patch, del, upload } = useApi();

useHead({ title: "Editar producto — Qyne" });

interface ProductImage {
  url: string;
  key: string;
}

interface ProductData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceUsd: string | null;
  priceBs: string | null;
  costUsd: string | null;
  sku: string | null;
  categoryId: string | null;
  stock: number;
  status: string;
  images: ProductImage[];
  hasVariants: boolean;
  variants: Variant[];
}

interface Variant {
  id: string;
  name: string;
  sku: string | null;
  priceUsd: string | null;
  priceBs: string | null;
  stock: number;
  options: Record<string, string>;
  status: string;
}

interface Category {
  id: string;
  name: string;
}

const form = reactive({
  name: "",
  description: "",
  priceUsd: "",
  priceBs: "",
  costUsd: "",
  sku: "",
  categoryId: "" as string | null,
  stock: 0,
  status: "active",
  images: [] as ProductImage[],
});

const product = ref<ProductData | null>(null);
const categories = ref<Category[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const isDeleting = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const isUploadingImage = ref(false);

onMounted(async () => {
  try {
    const [productData, categoryData] = await Promise.all([
      get<ProductData>(`/products/${productId}`),
      get<Category[]>("/categories").catch(() => [] as Category[]),
    ]);

    product.value = productData;
    categories.value = categoryData;

    // Populate form with existing data.
    form.name = productData.name;
    form.description = productData.description ?? "";
    form.priceUsd = productData.priceUsd ?? "";
    form.priceBs = productData.priceBs ?? "";
    form.costUsd = productData.costUsd ?? "";
    form.sku = productData.sku ?? "";
    form.categoryId = productData.categoryId;
    form.stock = productData.stock;
    form.status = productData.status;
    form.images = productData.images ?? [];
  } catch {
    error.value = "No se pudo cargar el producto";
  } finally {
    isLoading.value = false;
  }
});

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

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
    input.value = "";
  }
}

function removeImage(index: number) {
  form.images.splice(index, 1);
}

async function handleSave() {
  if (!form.name) {
    error.value = "Nombre es requerido";
    return;
  }

  isSaving.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    await patch(`/products/${productId}`, {
      name: form.name,
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
    successMessage.value = "Producto actualizado";
    setTimeout(() => {
      successMessage.value = null;
    }, 3000);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Error al guardar";
  } finally {
    isSaving.value = false;
  }
}

async function handleDelete() {
  if (!confirm("Archivar este producto? No sera visible en el catalogo.")) return;

  isDeleting.value = true;
  error.value = null;

  try {
    await del(`/products/${productId}`);
    await router.push("/products");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Error al archivar";
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="edit-product">
    <div class="page-header">
      <NuxtLink to="/products" class="back-link">&larr; Productos</NuxtLink>
      <div class="header-row">
        <h1>{{ isLoading ? "Cargando..." : form.name || "Editar producto" }}</h1>
        <button
          v-if="!isLoading && product"
          type="button"
          class="btn-danger"
          :disabled="isDeleting"
          @click="handleDelete"
        >
          {{ isDeleting ? "Archivando..." : "Archivar" }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="loading">Cargando producto...</div>

    <form v-else-if="product" class="product-form" @submit.prevent="handleSave">
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="successMessage" class="form-success">{{ successMessage }}</div>

      <div class="form-section">
        <h2>Informacion basica</h2>

        <div class="form-group">
          <label for="name">Nombre *</label>
          <input id="name" v-model="form.name" type="text" required />
        </div>

        <div class="form-group">
          <label>URL del catalogo</label>
          <div class="slug-display">
            tu-tienda.qyne.app/p/<strong>{{ product.slug }}</strong>
          </div>
          <p class="field-hint">El slug no se puede cambiar despues de crear el producto.</p>
        </div>

        <div class="form-group">
          <label for="description">Descripcion</label>
          <textarea id="description" v-model="form.description" rows="3" />
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
            <option value="archived">Archivado</option>
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
            <input
              id="stock"
              v-model.number="form.stock"
              type="number"
              min="0"
              :disabled="product.hasVariants"
            />
            <p v-if="product.hasVariants" class="field-hint">
              Stock calculado automaticamente desde las variantes.
            </p>
          </div>
        </div>

        <div class="form-group">
          <label for="sku">SKU</label>
          <input id="sku" v-model="form.sku" type="text" />
        </div>
      </div>

      <!-- Variants section (read-only summary for now) -->
      <div v-if="product.hasVariants && product.variants.length > 0" class="form-section">
        <h2>Variantes ({{ product.variants.length }})</h2>
        <table class="variants-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>SKU</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in product.variants" :key="v.id">
              <td>{{ v.name }}</td>
              <td>{{ v.sku || "—" }}</td>
              <td>{{ v.priceUsd ? `$${v.priceUsd}` : "Precio base" }}</td>
              <td>{{ v.stock }}</td>
              <td>
                <span :class="['status-badge', `status-${v.status}`]">
                  {{ v.status === "active" ? "Activo" : "Archivado" }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="form-section">
        <h2>Fotos</h2>

        <div v-if="form.images.length > 0" class="image-preview-grid">
          <div v-for="(img, idx) in form.images" :key="img.key || idx" class="image-preview">
            <img :src="img.url" alt="Producto" />
            <button type="button" class="remove-image-btn" @click="removeImage(idx)">x</button>
          </div>
        </div>

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
        <button type="submit" class="btn-primary" :disabled="isSaving">
          {{ isSaving ? "Guardando..." : "Guardar cambios" }}
        </button>
      </div>
    </form>

    <div v-else class="error-state">
      <p>{{ error || "Producto no encontrado" }}</p>
      <NuxtLink to="/products" class="btn-secondary">Volver a productos</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.edit-product {
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

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-row h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.loading,
.error-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
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

.form-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
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

.form-group input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.slug-display {
  font-size: 0.875rem;
  color: #374151;
  padding: 0.5rem 0.75rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}

.field-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* Variants table */
.variants-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.variants-table th {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
  color: #6b7280;
  font-weight: 500;
}

.variants-table td {
  padding: 0.5rem;
  border-bottom: 1px solid #f3f4f6;
}

.status-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
}

.status-archived {
  background: #f3f4f6;
  color: #6b7280;
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
  text-decoration: none;
}

.btn-secondary:hover {
  background: #f9fafb;
}

.btn-danger {
  padding: 0.375rem 0.75rem;
  background: white;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-danger:hover {
  background: #fef2f2;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
