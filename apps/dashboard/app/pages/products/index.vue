<script setup lang="ts">
/**
 * Product list page — /products
 * Fetches real products from the API. Supports filtering by status.
 */
useHead({ title: "Productos — Qyne" });

const { get } = useApi();

const statusFilter = ref("all");

interface Product {
  id: string;
  name: string;
  slug: string;
  priceUsd: string | null;
  stock: number;
  status: string;
  images: { url: string }[];
}

interface ProductsResponse {
  data: Product[];
  total: number;
}

const {
  data: productsData,
  refresh,
  status: fetchStatus,
} = await useAsyncData(
  "products",
  async () => {
    const params = new URLSearchParams();
    if (statusFilter.value !== "all") {
      params.set("status", statusFilter.value);
    }
    const query = params.toString();
    return get<ProductsResponse>(`/products${query ? `?${query}` : ""}`);
  },
  { watch: [statusFilter] },
);

const products = computed(() => (productsData.value as unknown as ProductsResponse)?.data ?? []);
const total = computed(() => (productsData.value as unknown as ProductsResponse)?.total ?? 0);

function onFilterChange() {
  refresh();
}
</script>

<template>
  <div class="products-page">
    <div class="page-header">
      <h1>Productos</h1>
      <span class="product-count">{{ total }} {{ total === 1 ? "producto" : "productos" }}</span>
      <NuxtLink to="/products/new" class="btn-primary">+ Nuevo producto</NuxtLink>
    </div>

    <div class="filters">
      <select v-model="statusFilter" class="filter-select" @change="onFilterChange">
        <option value="all">Todos</option>
        <option value="active">Activos</option>
        <option value="draft">Borradores</option>
        <option value="archived">Archivados</option>
      </select>
    </div>

    <div v-if="fetchStatus === 'pending'" class="loading">Cargando productos...</div>

    <div v-else-if="products.length === 0" class="empty-state">
      <p>No tienes productos {{ statusFilter !== "all" ? "con este estado" : "aun" }}.</p>
      <NuxtLink to="/products/new" class="btn-primary">Crear tu primer producto</NuxtLink>
    </div>

    <div v-else class="product-grid">
      <div v-for="product in products" :key="product.id" class="product-card">
        <NuxtLink :to="`/products/${product.id}`">
          <div class="card-image">
            <img
              v-if="product.images.length > 0"
              :src="(product.images[0] as any)?.url"
              :alt="product.name"
            />
            <div v-else class="image-placeholder">Sin foto</div>
          </div>
          <div class="card-body">
            <h3>{{ product.name }}</h3>
            <div class="card-meta">
              <span v-if="product.priceUsd" class="price">${{ product.priceUsd }}</span>
              <span class="stock">{{ product.stock }} uds</span>
            </div>
            <span :class="['status-badge', `status-${product.status}`]">
              {{
                product.status === "active"
                  ? "Activo"
                  : product.status === "draft"
                    ? "Borrador"
                    : "Archivado"
              }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.products-page {
  max-width: 1200px;
}

.page-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.product-count {
  font-size: 0.875rem;
  color: #6b7280;
  flex: 1;
}

.btn-primary {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #111827;
  color: white;
  border-radius: 0.375rem;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
}

.btn-primary:hover {
  background: #1f2937;
}

.filters {
  margin-bottom: 1rem;
}

.filter-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
}

.loading {
  color: #6b7280;
  padding: 2rem 0;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}

.empty-state p {
  margin-bottom: 1rem;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.product-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.product-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.product-card a {
  text-decoration: none;
  color: inherit;
}

.card-image {
  aspect-ratio: 1;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  color: #9ca3af;
  font-size: 0.875rem;
}

.card-body {
  padding: 0.75rem;
}

.card-body h3 {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.price {
  font-weight: 600;
}

.stock {
  color: #6b7280;
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

.status-draft {
  background: #fef3c7;
  color: #92400e;
}

.status-archived {
  background: #f3f4f6;
  color: #6b7280;
}
</style>
