<template>
  <div class="dashboard-layout">
    <nav class="sidebar">
      <div class="sidebar-brand">
        <h1>Qyne</h1>
      </div>
      <ul class="sidebar-nav">
        <li>
          <NuxtLink to="/" class="nav-link">Inicio</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/products" class="nav-link">Productos</NuxtLink>
        </li>
      </ul>
    </nav>
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #111827;
  color: white;
  padding: 1rem;
  flex-shrink: 0;
}

.sidebar-brand h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 2rem;
}

.sidebar-nav {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sidebar-nav li {
  margin-bottom: 0.25rem;
}

.nav-link {
  display: block;
  padding: 0.5rem 0.75rem;
  color: #d1d5db;
  text-decoration: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.nav-link:hover {
  background: #1f2937;
  color: white;
}

.main-content {
  flex: 1;
  padding: 1.5rem;
  background: #f9fafb;
}
</style>
