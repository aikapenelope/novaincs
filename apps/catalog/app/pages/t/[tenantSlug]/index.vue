<script setup lang="ts">
/**
 * Catalog home — /t/:tenantSlug
 *
 * Fetches real products from the API. Server-side rendered for SEO.
 */

const { slug, store, storeError, fetchStore } = useTenant();
const { get } = useApi();
const { trackPageView } = useBeacon();

await fetchStore();

onMounted(() => {
  trackPageView("catalog_home");
});

interface Product {
  id: string;
  name: string;
  slug: string;
  priceUsd: string | null;
  priceBs: string | null;
  stock: number;
  images: { url: string }[];
  status: string;
}

interface ProductsResponse {
  data: Product[];
  total: number;
}

const { data: productsData, error: fetchError } = await useAsyncData(`products-${slug.value}`, () =>
  get<ProductsResponse>(`/catalog/${slug.value}/products`),
);

const products = computed(() => (productsData.value as unknown as ProductsResponse)?.data ?? []);

useHead({
  title: store.value ? `${store.value.name} — Catalogo` : "Catalogo — Qyne",
  meta: [
    {
      name: "description",
      content: store.value?.description || "Explora nuestro catalogo de productos",
    },
    { property: "og:title", content: store.value?.name || "Catalogo" },
    {
      property: "og:description",
      content: store.value?.description || "Explora nuestro catalogo de productos",
    },
    { property: "og:type", content: "website" },
    ...(store.value?.logoUrl ? [{ property: "og:image", content: store.value.logoUrl }] : []),
  ],
  script: store.value
    ? [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            name: store.value.name,
            description: store.value.description || undefined,
            image: store.value.logoUrl || undefined,
          }),
        },
      ]
    : [],
});
</script>

<template>
  <div class="catalog-home">
    <div v-if="storeError" class="error-state">
      <h1>Tienda no encontrada</h1>
      <p>La tienda "{{ slug }}" no existe.</p>
    </div>

    <template v-else>
      <header class="catalog-header">
        <img v-if="store?.logoUrl" :src="store.logoUrl" :alt="store?.name" class="store-logo" />
        <h1>{{ store?.name || "Catalogo" }}</h1>
        <p v-if="store?.description" class="store-description">{{ store.description }}</p>
      </header>

      <p v-if="fetchError" class="error-msg">Error cargando productos.</p>

      <main class="product-grid">
        <article v-for="product in products" :key="product.id" class="product-card">
          <NuxtLink :to="`/t/${slug}/p/${product.slug}`">
            <div class="product-image">
              <img
                v-if="product.images.length > 0"
                :src="(product.images[0] as any)?.url"
                :alt="product.name"
              />
              <div v-else class="product-image-placeholder">Sin imagen</div>
            </div>
            <div class="product-info">
              <h2>{{ product.name }}</h2>
              <div class="product-price">
                <span v-if="product.priceUsd" class="price-usd">${{ product.priceUsd }}</span>
                <span v-if="product.priceBs" class="price-bs">Bs {{ product.priceBs }}</span>
              </div>
              <span v-if="product.stock <= 0" class="out-of-stock">Agotado</span>
              <span v-else-if="product.stock <= 5" class="low-stock">Quedan pocas unidades</span>
            </div>
          </NuxtLink>
        </article>
      </main>

      <p v-if="products.length === 0 && !fetchError" class="empty-state">
        No hay productos disponibles.
      </p>
    </template>
  </div>
</template>

<style scoped>
.catalog-home {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
  padding-bottom: 5rem;
}

.error-state {
  text-align: center;
  padding: 3rem 1rem;
}

.error-state h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.error-state p {
  color: #6b7280;
}

.catalog-header {
  margin-bottom: 2rem;
}

.store-logo {
  width: 48px;
  height: 48px;
  border-radius: 0.5rem;
  object-fit: cover;
  margin-bottom: 0.5rem;
}

.catalog-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.store-description {
  color: #6b7280;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.error-msg {
  color: #ef4444;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.product-card {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.product-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.product-card a {
  text-decoration: none;
  color: inherit;
}

.product-image {
  aspect-ratio: 1;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-image-placeholder {
  color: #9ca3af;
  font-size: 0.875rem;
}

.product-info {
  padding: 0.75rem;
}

.product-info h2 {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  line-height: 1.3;
}

.product-price {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.price-usd {
  font-weight: 600;
  color: #111827;
}

.price-bs {
  font-size: 0.75rem;
  color: #6b7280;
}

.out-of-stock {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #ef4444;
  font-weight: 500;
}

.low-stock {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #d97706;
  font-weight: 500;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}
</style>
