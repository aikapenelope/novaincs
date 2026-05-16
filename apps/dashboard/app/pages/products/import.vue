<script setup lang="ts">
/**
 * Product import — /products/import
 *
 * Upload CSV or Excel file, preview parsed rows, then batch import.
 * Uses SheetJS (xlsx) for client-side parsing.
 */

useHead({ title: "Importar productos — Qyne" });

import { read, utils } from "xlsx";

const { post } = useApi();
const router = useRouter();

interface ParsedProduct {
  name: string;
  priceUsd: string | null;
  stock: number;
  sku: string | null;
  description: string | null;
}

const parsedProducts = ref<ParsedProduct[]>([]);
const headers = ref<string[]>([]);
const parseError = ref<string | null>(null);
const isImporting = ref(false);
const importResult = ref<{ imported: number; skipped: number; total: number } | null>(null);

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  parseError.value = null;
  parsedProducts.value = [];
  importResult.value = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!];
      if (!sheet) {
        parseError.value = "El archivo no tiene hojas de datos.";
        return;
      }

      const rows = utils.sheet_to_json<Record<string, unknown>>(sheet);
      if (rows.length === 0) {
        parseError.value = "El archivo esta vacio.";
        return;
      }

      headers.value = Object.keys(rows[0]!);

      // Map rows to products. Try common column names.
      parsedProducts.value = rows
        .map((row) => {
          const name = String(
            row["nombre"] ??
              row["Nombre"] ??
              row["name"] ??
              row["Name"] ??
              row["producto"] ??
              row["Producto"] ??
              "",
          ).trim();
          const price =
            row["precio"] ??
            row["Precio"] ??
            row["price"] ??
            row["Price"] ??
            row["precio_usd"] ??
            row["PrecioUSD"] ??
            null;
          const stock =
            row["stock"] ??
            row["Stock"] ??
            row["cantidad"] ??
            row["Cantidad"] ??
            row["inventario"] ??
            0;
          const sku = row["sku"] ?? row["SKU"] ?? row["codigo"] ?? row["Codigo"] ?? null;
          const desc =
            row["descripcion"] ??
            row["Descripcion"] ??
            row["description"] ??
            row["Description"] ??
            null;

          return {
            name,
            priceUsd: price !== null && price !== undefined && price !== "" ? String(price) : null,
            stock: Number(stock) || 0,
            sku: sku ? String(sku) : null,
            description: desc ? String(desc) : null,
          };
        })
        .filter((p) => p.name.length > 0);

      if (parsedProducts.value.length === 0) {
        parseError.value =
          "No se encontraron productos con nombre. Asegurate de tener una columna 'nombre' o 'name'.";
      }
    } catch {
      parseError.value = "Error al leer el archivo. Asegurate de que sea CSV o Excel (.xlsx).";
    }
  };
  reader.readAsArrayBuffer(file);
}

function removeProduct(index: number) {
  parsedProducts.value.splice(index, 1);
}

async function importProducts() {
  if (parsedProducts.value.length === 0) return;
  isImporting.value = true;
  parseError.value = null;

  try {
    const result = await post<{ imported: number; skipped: number; total: number }>(
      "/products/import",
      { products: parsedProducts.value },
    );
    importResult.value = result;
  } catch (err: unknown) {
    parseError.value = err instanceof Error ? err.message : "Error al importar";
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <div class="import-page">
    <NuxtLink to="/products" class="back-link">&larr; Volver a productos</NuxtLink>

    <h1>Importar productos</h1>
    <p class="subtitle">Sube un archivo CSV o Excel (.xlsx) con tus productos.</p>

    <!-- Success result -->
    <div v-if="importResult" class="result-card">
      <h2>Importacion completada</h2>
      <p>
        <strong>{{ importResult.imported }}</strong> productos importados
      </p>
      <p v-if="importResult.skipped > 0">{{ importResult.skipped }} omitidos (ya existian)</p>
      <NuxtLink to="/products" class="btn-primary">Ver productos</NuxtLink>
    </div>

    <template v-else>
      <!-- File upload -->
      <div class="upload-section">
        <label class="upload-area">
          <input type="file" accept=".csv,.xlsx,.xls" hidden @change="handleFile" />
          <span class="upload-icon">📄</span>
          <span>Seleccionar archivo CSV o Excel</span>
        </label>
        <p class="upload-hint">
          El archivo debe tener al menos una columna "nombre" o "name". Columnas opcionales: precio,
          stock, sku, descripcion.
        </p>
      </div>

      <div v-if="parseError" class="error-msg">{{ parseError }}</div>

      <!-- Preview -->
      <div v-if="parsedProducts.length > 0" class="preview-section">
        <h2>Vista previa ({{ parsedProducts.length }} productos)</h2>

        <div class="preview-table-wrapper">
          <table class="preview-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio USD</th>
                <th>Stock</th>
                <th>SKU</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(product, i) in parsedProducts" :key="i">
                <td>{{ product.name }}</td>
                <td>{{ product.priceUsd ? `$${product.priceUsd}` : "—" }}</td>
                <td>{{ product.stock }}</td>
                <td>{{ product.sku || "—" }}</td>
                <td>
                  <button class="remove-btn" @click="removeProduct(i)">Quitar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button class="btn-primary" :disabled="isImporting" @click="importProducts">
          {{ isImporting ? "Importando..." : `Importar ${parsedProducts.length} productos` }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.import-page {
  max-width: 900px;
}
.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.subtitle {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.result-card {
  padding: 1.5rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}
.result-card h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #059669;
  margin-bottom: 0.5rem;
}
.result-card p {
  font-size: 0.875rem;
  color: #374151;
  margin-bottom: 0.25rem;
}
.result-card .btn-primary {
  margin-top: 1rem;
}

.upload-section {
  margin-bottom: 1.5rem;
}
.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  border: 2px dashed #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
}
.upload-area:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}
.upload-icon {
  font-size: 2rem;
}
.upload-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.5rem;
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

.preview-section {
  margin-bottom: 1.5rem;
}
.preview-section h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.preview-table-wrapper {
  overflow-x: auto;
  margin-bottom: 1rem;
}
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.preview-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 500;
  color: #6b7280;
}
.preview-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f3f4f6;
}
.remove-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}
.remove-btn:hover {
  text-decoration: underline;
}

.btn-primary {
  display: inline-block;
  padding: 0.625rem 1.5rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.btn-primary:hover:not(:disabled) {
  background: #1f2937;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
