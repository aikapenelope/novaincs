<template>
  <Show when="signed-in">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </Show>
  <Show when="signed-out">
    <div class="auth-page">
      <div class="auth-container">
        <h1>Qyne</h1>
        <p>Inicia sesion para acceder a tu tienda</p>
        <SignIn />
      </div>
    </div>
  </Show>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.auth-container {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
}

.auth-container h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.auth-container p {
  color: #6b7280;
  margin-bottom: 2rem;
}
</style>
