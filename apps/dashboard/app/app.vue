<script setup lang="ts">
/**
 * Root app component.
 *
 * When signed in, resolves the user's tenant. If no tenant exists,
 * redirects to the onboarding wizard.
 */
const { resolveTenant, tenantId } = useApi();
const { isSignedIn } = useAuth();
const router = useRouter();
const route = useRoute();

const isReady = ref(false);

watch(
  () => isSignedIn.value,
  async (signedIn) => {
    if (!signedIn) {
      isReady.value = true;
      return;
    }
    await resolveTenant();
    // If user has no tenant and is not already on onboarding, redirect.
    if (!tenantId.value && !route.path.startsWith("/onboarding")) {
      router.replace("/onboarding");
    }
    isReady.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <Show when="signed-in">
    <template v-if="isReady">
      <NuxtLayout v-if="!$route.path.startsWith('/onboarding')">
        <NuxtPage />
      </NuxtLayout>
      <NuxtPage v-else />
    </template>
    <div v-else class="loading-screen">
      <p>Cargando...</p>
    </div>
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
.loading-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

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
