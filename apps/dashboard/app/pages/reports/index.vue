<script setup lang="ts">
/**
 * Reports page — /reports
 *
 * Downloadable sales reports (PDF and CSV).
 * Available only for Pro and Business plans.
 * Protected by Owner Lock if enabled.
 */
useHead({ title: "Reportes — Qyne" });

const { apiUrl } = useApi();
const { hasAccess, requiredTier, loading: planLoading } = usePlanGate("reports");
useOwnerLock();

const periods = [
  { label: "Hoy", days: 1 },
  { label: "Esta semana", days: 7 },
  { label: "Este mes", days: 30 },
  { label: "Ultimos 3 meses", days: 90 },
];

const selectedDays = ref(30);

function downloadPdf() {
  window.open(`${apiUrl}/export/pdf?days=${selectedDays.value}`, "_blank");
}

function downloadCsv() {
  window.open(`${apiUrl}/export/excel?days=${selectedDays.value}`, "_blank");
}
</script>

<template>
  <div class="reports-page">
    <!-- Plan gate overlay -->
    <div v-if="!planLoading && !hasAccess" class="gate-overlay">
      <div class="gate-card">
        <span class="gate-icon">🔒</span>
        <h2>Reportes</h2>
        <p>Disponible en el plan {{ requiredTier === "pro" ? "Pro" : "Business" }} o superior.</p>
        <NuxtLink to="/settings/plan" class="gate-btn">Ver planes</NuxtLink>
      </div>
    </div>

    <template v-else>
      <h1>Reportes</h1>
      <p class="subtitle">Descarga reportes de ventas en PDF o CSV.</p>

      <div class="period-selector">
        <label class="period-label">Periodo:</label>
        <div class="period-buttons">
          <button
            v-for="p in periods"
            :key="p.days"
            class="period-btn"
            :class="{ active: selectedDays === p.days }"
            @click="selectedDays = p.days"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <div class="download-cards">
        <div class="download-card" @click="downloadPdf">
          <span class="download-icon">📄</span>
          <span class="download-title">Reporte PDF</span>
          <span class="download-desc">
            Resumen completo: ingresos, top productos, metodos de pago.
          </span>
          <span class="download-btn">Descargar PDF</span>
        </div>

        <div class="download-card" @click="downloadCsv">
          <span class="download-icon">📊</span>
          <span class="download-title">Datos CSV</span>
          <span class="download-desc">
            Todos los pedidos verificados. Abre en Excel o Google Sheets.
          </span>
          <span class="download-btn">Descargar CSV</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gate-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
}

.gate-card {
  text-align: center;
  max-width: 320px;
}

.gate-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 1rem;
}

.gate-card h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.gate-card p {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.gate-btn {
  display: inline-block;
  padding: 0.625rem 1.5rem;
  background: #3b82f6;
  color: white;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
}

.gate-btn:hover {
  background: #2563eb;
}

.reports-page h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.subtitle {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.period-selector {
  margin-bottom: 2rem;
}

.period-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
}

.period-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.period-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.period-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.period-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.download-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.download-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.download-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.download-icon {
  font-size: 2rem;
}

.download-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.download-desc {
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.4;
}

.download-btn {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #3b82f6;
}
</style>
