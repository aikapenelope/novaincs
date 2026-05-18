<script setup lang="ts">
/**
 * Unlock page — PIN entry for Owner Lock.
 *
 * Shown when the user tries to access a locked route (reports,
 * analytics, etc.) while the owner lock is active.
 * After successful PIN entry, redirects back to the intended page.
 */
useHead({ title: "Desbloquear — Qyne" });

const { post } = useApi();
const router = useRouter();
const route = useRoute();

const pin = ref("");
const error = ref("");
const loading = ref(false);

const returnTo = computed(() => (route.query.returnTo as string) || "/");

function onDigit(digit: string) {
  if (pin.value.length >= 4) return;
  pin.value += digit;
  error.value = "";

  if (pin.value.length === 4) {
    verifyPin();
  }
}

function onBackspace() {
  pin.value = pin.value.slice(0, -1);
}

async function verifyPin() {
  if (pin.value.length !== 4) return;
  loading.value = true;
  error.value = "";

  try {
    const result = await post<{ valid: boolean }>("/owner-lock/verify", { pin: pin.value });
    const raw = result as unknown as { valid: boolean };
    if (raw?.valid) {
      // Store unlock state in sessionStorage (expires on tab close).
      sessionStorage.setItem("owner-unlocked", Date.now().toString());
      router.push(returnTo.value);
    } else {
      error.value = "Clave incorrecta";
      pin.value = "";
    }
  } catch {
    error.value = "Error verificando clave";
    pin.value = "";
  } finally {
    loading.value = false;
  }
}

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
</script>

<template>
  <div class="unlock-page">
    <div class="unlock-card">
      <div class="lock-icon">🔒</div>
      <h1>Seccion protegida</h1>
      <p class="unlock-subtitle">Ingresa tu clave de 4 digitos</p>

      <!-- PIN dots -->
      <div class="pin-dots">
        <div
          v-for="i in 4"
          :key="i"
          class="pin-dot"
          :class="{
            filled: i <= pin.length,
            error: error && pin.length === 0,
          }"
        />
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <!-- Loading -->
      <div v-if="loading" class="loading">
        <div class="spinner" />
      </div>

      <!-- Numpad -->
      <div v-else class="numpad">
        <template v-for="d in digits" :key="d">
          <button v-if="d === ''" class="numpad-btn empty" disabled />
          <button v-else-if="d === 'back'" class="numpad-btn back" @click="onBackspace">←</button>
          <button v-else class="numpad-btn" @click="onDigit(d)">
            {{ d }}
          </button>
        </template>
      </div>

      <NuxtLink to="/" class="back-link">Volver al inicio</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.unlock-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f9fafb;
  padding: 1rem;
}

.unlock-card {
  background: white;
  border-radius: 1rem;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 320px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.lock-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.unlock-card h1 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.unlock-subtitle {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.pin-dots {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e5e7eb;
  transition: all 0.15s;
}

.pin-dot.filled {
  background: #3b82f6;
  transform: scale(1.1);
}

.pin-dot.error {
  background: #fca5a5;
}

.error-msg {
  color: #dc2626;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.loading {
  padding: 2rem 0;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  max-width: 240px;
  margin: 0 auto 1.5rem;
}

.numpad-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: white;
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  transition: all 0.1s;
}

.numpad-btn:active {
  background: #f3f4f6;
  transform: scale(0.95);
}

.numpad-btn.empty {
  border: none;
  cursor: default;
}

.numpad-btn.back {
  font-size: 1.5rem;
  color: #6b7280;
}

.back-link {
  display: block;
  font-size: 0.75rem;
  color: #9ca3af;
  text-decoration: none;
}

.back-link:hover {
  color: #6b7280;
}
</style>
