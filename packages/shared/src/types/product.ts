/** Product visibility status. */
export type ProductStatus = "active" | "draft" | "archived";

/** A product image with AI enhancement metadata. */
export interface ProductImage {
  url: string;
  alt: string;
  order: number;
  isEnhanced: boolean;
  originalUrl?: string;
}

/** A product in the catalog. */
export interface Product {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  priceUsd: number | null;
  priceBs: number | null;
  costUsd: number | null;
  sku: string | null;
  categoryId: string | null;
  stock: number;
  status: ProductStatus;
  images: ProductImage[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
