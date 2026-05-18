<script setup lang="ts">
/**
 * Custom Fields settings — /settings/custom-fields
 *
 * Merchants define custom fields for products and customers.
 * Pro+ plan required (gated by API via custom_fields feature flag).
 */

useHead({ title: "Campos personalizados — Qyne" });

const { get, post, patch, del } = useApi();

interface CustomField {
  id: string;
  entityType: "product" | "customer";
  fieldKey: string;
  fieldLabel: string;
  fieldType: "text" | "number" | "date" | "select" | "boolean";
  options: string[];
  required: boolean;
  sortOrder: number;
  placeholder: string | null;
}

const activeTab = ref<"product" | "customer">("product");
const fields = ref<CustomField[]>([]);
const isLoading = ref(true);
const feedback = ref<{ type: "success" | "error"; message: string } | null>(null);

// Create form
const showCreateForm = ref(false);
const createForm = reactive({
  fieldKey: "",
  fieldLabel: "",
  fieldType: "text" as CustomField["fieldType"],
  options: "",
  required: false,
  placeholder: "",
});
const isSubmitting = ref(false);

function clearFeedback() {
  setTimeout(() => (feedback.value = null), 3000);
}

async function loadFields() {
  isLoading.value = true;
  try {
    fields.value = await get<CustomField[]>(
      `/custom-fields/definitions?entityType=${activeTab.value}`,
    );
  } catch (err: unknown) {
    // Plan gate returns 403 — show upgrade message
    if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 403) {
      feedback.value = {
        type: "error",
        message: "Esta funcion requiere el plan Pro o superior.",
      };
    }
    fields.value = [];
  } finally {
    isLoading.value = false;
  }
}

watch(activeTab, () => loadFields(), { immediate: true });

function resetCreateForm() {
  createForm.fieldKey = "";
  createForm.fieldLabel = "";
  createForm.fieldType = "text";
  createForm.options = "";
  createForm.required = false;
  createForm.placeholder = "";
  showCreateForm.value = false;
}

function generateKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
}

watch(
  () => createForm.fieldLabel,
  (val) => {
    if (!createForm.fieldKey || createForm.fieldKey === generateKey(val.slice(0, -1))) {
      createForm.fieldKey = generateKey(val);
    }
  },
);

async function createField() {
  isSubmitting.value = true;
  feedback.value = null;

  try {
    const options =
      createForm.fieldType === "select"
        ? createForm.options
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : [];

    await post<CustomField>("/custom-fields/definitions", {
      entityType: activeTab.value,
      fieldKey: createForm.fieldKey,
      fieldLabel: createForm.fieldLabel,
      fieldType: createForm.fieldType,
      options,
      required: createForm.required,
      placeholder: createForm.placeholder || null,
    });

    feedback.value = { type: "success", message: "Campo creado" };
    resetCreateForm();
    await loadFields();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al crear campo";
    feedback.value = { type: "error", message: msg };
  } finally {
    isSubmitting.value = false;
    clearFeedback();
  }
}

async function deleteField(field: CustomField) {
  if (!confirm(`Eliminar el campo "${field.fieldLabel}"? Los valores existentes no se borran.`)) {
    return;
  }

  try {
    await del(`/custom-fields/definitions/${field.id}`);
    feedback.value = { type: "success", message: "Campo eliminado" };
    await loadFields();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al eliminar";
    feedback.value = { type: "error", message: msg };
  }
  clearFeedback();
}

async function toggleRequired(field: CustomField) {
  try {
    await patch(`/custom-fields/definitions/${field.id}`, {
      required: !field.required,
    });
    field.required = !field.required;
  } catch {
    // silent
  }
}

const fieldTypeLabels: Record<string, string> = {
  text: "Texto",
  number: "Numero",
  date: "Fecha",
  select: "Seleccion",
  boolean: "Si/No",
};
</script>

<template>
  <div class="custom-fields-page">
    <div class="page-header">
      <h1>Campos personalizados</h1>
      <p class="page-desc">
        Define campos extra para tus productos y clientes. Los valores se guardan en cada entidad.
      </p>
    </div>

    <div v-if="feedback" :class="['feedback', `feedback-${feedback.type}`]">
      {{ feedback.message }}
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        :class="['tab', { active: activeTab === 'product' }]"
        @click="activeTab = 'product'"
      >
        Productos
      </button>
      <button
        :class="['tab', { active: activeTab === 'customer' }]"
        @click="activeTab = 'customer'"
      >
        Clientes
      </button>
    </div>

    <!-- Field list -->
    <div class="fields-section">
      <div v-if="isLoading" class="loading">Cargando...</div>

      <div v-else-if="fields.length === 0" class="empty-state">
        <p>No hay campos personalizados para {{ activeTab === "product" ? "productos" : "clientes" }}.</p>
        <button class="btn-create" @click="showCreateForm = true">Crear primer campo</button>
      </div>

      <template v-else>
        <div class="fields-list">
          <div v-for="field in fields" :key="field.id" class="field-card">
            <div class="field-info">
              <span class="field-label">{{ field.fieldLabel }}</span>
              <span class="field-meta">
                <span class="field-type-badge">{{ fieldTypeLabels[field.fieldType] }}</span>
                <span v-if="field.required" class="field-required">Requerido</span>
                <code class="field-key">{{ field.fieldKey }}</code>
              </span>
              <span v-if="field.fieldType === 'select' && field.options.length" class="field-options">
                Opciones: {{ field.options.join(", ") }}
              </span>
            </div>
            <div class="field-actions">
              <button class="btn-toggle" :title="field.required ? 'Hacer opcional' : 'Hacer requerido'" @click="toggleRequired(field)">
                {{ field.required ? "Opcional" : "Requerido" }}
              </button>
              <button class="btn-delete" @click="deleteField(field)">Eliminar</button>
            </div>
          </div>
        </div>

        <button v-if="!showCreateForm && fields.length < 20" class="btn-create" @click="showCreateForm = true">
          Agregar campo
        </button>
        <p v-if="fields.length >= 20" class="limit-msg">Maximo 20 campos por tipo de entidad.</p>
      </template>
    </div>

    <!-- Create form -->
    <div v-if="showCreateForm" class="create-form">
      <h3>Nuevo campo para {{ activeTab === "product" ? "productos" : "clientes" }}</h3>

      <div class="form-group">
        <label>Nombre del campo *</label>
        <input v-model="createForm.fieldLabel" type="text" placeholder="Ej: Material, Talla, RIF" />
      </div>

      <div class="form-group">
        <label>Clave interna</label>
        <input v-model="createForm.fieldKey" type="text" placeholder="material" />
        <p class="form-hint">Solo letras minusculas, numeros y guion bajo.</p>
      </div>

      <div class="form-group">
        <label>Tipo de dato *</label>
        <select v-model="createForm.fieldType">
          <option value="text">Texto</option>
          <option value="number">Numero</option>
          <option value="date">Fecha</option>
          <option value="select">Seleccion (opciones fijas)</option>
          <option value="boolean">Si/No</option>
        </select>
      </div>

      <div v-if="createForm.fieldType === 'select'" class="form-group">
        <label>Opciones (separadas por coma) *</label>
        <input v-model="createForm.options" type="text" placeholder="Talla S, Talla M, Talla L" />
      </div>

      <div class="form-group">
        <label>Placeholder</label>
        <input v-model="createForm.placeholder" type="text" placeholder="Texto de ayuda en el input" />
      </div>

      <div class="form-group checkbox-group">
        <label>
          <input v-model="createForm.required" type="checkbox" />
          Campo requerido
        </label>
      </div>

      <div class="form-actions">
        <button
          class="btn-save"
          :disabled="isSubmitting || !createForm.fieldLabel.trim() || !createForm.fieldKey.trim()"
          @click="createField"
        >
          {{ isSubmitting ? "Creando..." : "Crear campo" }}
        </button>
        <button class="btn-cancel" @click="resetCreateForm">Cancelar</button>
      </div>
    </div>

    <!-- Back link -->
    <NuxtLink to="/settings" class="back-link">&larr; Volver a configuracion</NuxtLink>
  </div>
</template>

<style scoped>
.custom-fields-page {
  max-width: 750px;
}
.page-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.page-desc {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
}
.feedback {
  padding: 0.625rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.feedback-success {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.feedback-error {
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fecaca;
}
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 1.5rem;
}
.tab {
  padding: 0.625rem 1.25rem;
  border: none;
  background: none;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab.active {
  color: #111827;
  border-bottom-color: #111827;
}
.tab:hover:not(.active) {
  color: #374151;
}
.loading {
  color: #6b7280;
  padding: 2rem 0;
}
.empty-state {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}
.empty-state p {
  margin-bottom: 1rem;
}
.fields-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.field-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
}
.field-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.field-label {
  font-weight: 600;
  font-size: 0.9375rem;
  color: #111827;
}
.field-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
.field-type-badge {
  background: #f3f4f6;
  color: #374151;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}
.field-required {
  color: #dc2626;
  font-size: 0.75rem;
  font-weight: 500;
}
.field-key {
  font-size: 0.75rem;
  color: #9ca3af;
  background: #f9fafb;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
}
.field-options {
  font-size: 0.8125rem;
  color: #6b7280;
}
.field-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.btn-toggle {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  background: white;
  color: #374151;
  cursor: pointer;
}
.btn-toggle:hover {
  background: #f3f4f6;
}
.btn-delete {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  border: 1px solid #fecaca;
  border-radius: 0.25rem;
  background: white;
  color: #dc2626;
  cursor: pointer;
}
.btn-delete:hover {
  background: #fef2f2;
}
.btn-create {
  padding: 0.5rem 1rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.btn-create:hover {
  background: #1f2937;
}
.limit-msg {
  font-size: 0.8125rem;
  color: #9ca3af;
  margin-top: 0.5rem;
}
.create-form {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
}
.create-form h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #374151;
}
.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  box-sizing: border-box;
}
.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #111827;
  box-shadow: 0 0 0 1px #111827;
}
.form-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.checkbox-group input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
}
.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
.btn-save {
  padding: 0.5rem 1.25rem;
  background: #111827;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-save:hover:not(:disabled) {
  background: #1f2937;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-cancel {
  padding: 0.5rem 1.25rem;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-cancel:hover {
  background: #f3f4f6;
}
.back-link {
  display: inline-block;
  margin-top: 2rem;
  font-size: 0.875rem;
  color: #6b7280;
  text-decoration: none;
}
.back-link:hover {
  color: #111827;
}
</style>
