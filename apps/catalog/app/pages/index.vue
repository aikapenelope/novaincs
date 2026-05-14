<script setup lang="ts">
/**
 * Catalog home — product listing page.
 * Server-side rendered for SEO and fast TTFB on Cloudflare Workers.
 *
 * In production, this page is rendered at the edge (~30ms TTFB).
 * Products are fetched from the Qyne API and cached for 60 seconds.
 */

// TODO: Replace with real API call when tenant resolution is implemented.
// For now, this is a static placeholder that demonstrates the page structure.

const products = ref([
  {
    id: "placeholder-1",
    name: "Producto de ejemplo",
    slug: "producto-de-ejemplo",
    priceUsd: "25.00",
    priceBs: "950.00",
    stock: 10,
    images: [],
    status: "active",
  },
]);

useHead({
  title: "Catalogo — Qyne",
  meta: [{ name: "description", content: "Explora nuestro catalogo de productos" }],
});
</script>

<template>
  <div class="catalog-home">
    <header class="catalog-header">
      <h1>Catalogo</h1>
    </header>

    <main class="product-grid">
      <article v-for="product in products" :key="product.id" class="product-card">
        <NuxtLink :to="`/p/${product.slug}`">
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
              <span class="price-usd">${{ product.priceUsd }}</span>
              <span v-if="product.priceBs" class="price-bs">Bs {{ product.priceBs }}</span>
            </div>
            <span v-if="product.stock <= 0" class="out-of-stock">Agotado</span>
          </div>
        </NuxtLink>
      </article>
    </main>
  </div>
</template>

<style scoped>
.catalog-home {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.catalog-header {
  margin-bottom: 2rem;
}

.catalog-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
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
</style>
