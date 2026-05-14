<script setup lang="ts">
/**
 * Dashboard home — merchant's daily overview.
 * Will show the smart feed and daily briefing in Phase 2.
 * For now, shows a simple welcome + quick stats placeholder.
 */
useHead({ title: "Inicio — Qyne" });
</script>

<template>
  <div class="dashboard-home">
    <h1>Bienvenido a Qyne</h1>
    <p class="subtitle">Tu centro de control de ventas</p>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">0</span>
        <span class="stat-label">Productos</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">$0</span>
        <span class="stat-label">Ventas hoy</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">0</span>
        <span class="stat-label">Pedidos pendientes</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-home h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #6b7280;
  margin-bottom: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}
</style>
