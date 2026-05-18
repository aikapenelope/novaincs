<script setup lang="ts">
/**
 * Default dashboard layout with sidebar navigation and notification bell.
 *
 * The notification bell polls GET /notifications/unread-count every 30 seconds
 * and shows a dropdown panel with recent notifications.
 */

const { get, patch, post } = useApi();

// --- Notification state ---

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  unread: number;
}

const unreadCount = ref(0);
const showNotifications = ref(false);
const notificationItems = ref<Notification[]>([]);
const notificationsLoaded = ref(false);

// Poll unread count every 30 seconds.
async function fetchUnreadCount() {
  try {
    const result = await get<{ unread: number }>("/notifications/unread-count");
    // The get() helper extracts .data, but this endpoint returns { unread: N }
    // at the top level. Handle both shapes.
    const raw = result as unknown as { unread?: number };
    unreadCount.value = raw?.unread ?? 0;
  } catch {
    // Silently fail — notifications are non-critical.
  }
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  fetchUnreadCount();
  pollInterval = setInterval(fetchUnreadCount, 30_000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

// Load full notifications when panel opens.
async function toggleNotifications() {
  showNotifications.value = !showNotifications.value;
  if (showNotifications.value && !notificationsLoaded.value) {
    await loadNotifications();
  }
}

async function loadNotifications() {
  try {
    const result = await get<NotificationsResponse>("/notifications?limit=20");
    const raw = result as unknown as NotificationsResponse;
    notificationItems.value = raw?.data ?? [];
    unreadCount.value = raw?.unread ?? 0;
    notificationsLoaded.value = true;
  } catch {
    // Silently fail.
  }
}

async function markAllRead() {
  try {
    await post("/notifications/read-all", {});
    unreadCount.value = 0;
    notificationItems.value = notificationItems.value.map((n) => ({ ...n, isRead: true }));
  } catch {
    // Silently fail.
  }
}

async function markRead(id: string) {
  try {
    await patch(`/notifications/${id}/read`, {});
    const item = notificationItems.value.find((n) => n.id === id);
    if (item && !item.isRead) {
      item.isRead = true;
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  } catch {
    // Silently fail.
  }
}

function handleNotificationClick(notification: Notification) {
  if (!notification.isRead) {
    markRead(notification.id);
  }
  showNotifications.value = false;
  if (notification.actionUrl) {
    navigateTo(notification.actionUrl);
  }
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Close panel when clicking outside.
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".notification-area")) {
    showNotifications.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

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
        <li>
          <NuxtLink to="/orders" class="nav-link">Pedidos</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/analytics" class="nav-link">Finanzas</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/settings" class="nav-link">Configuracion</NuxtLink>
        </li>
      </ul>
    </nav>
    <div class="main-wrapper">
      <header class="top-bar">
        <div class="top-bar-spacer" />
        <div class="notification-area">
          <button class="notification-bell" @click.stop="toggleNotifications">
            🔔
            <span v-if="unreadCount > 0" class="notification-badge">{{ unreadCount }}</span>
          </button>
          <div v-if="showNotifications" class="notification-panel">
            <div class="notification-header">
              <span class="notification-title">Notificaciones</span>
              <button v-if="unreadCount > 0" class="mark-all-read" @click="markAllRead">
                Marcar todo leido
              </button>
            </div>
            <div v-if="notificationItems.length === 0" class="notification-empty">
              Sin notificaciones
            </div>
            <div v-else class="notification-list">
              <div
                v-for="n in notificationItems"
                :key="n.id"
                class="notification-item"
                :class="{ unread: !n.isRead }"
                @click="handleNotificationClick(n)"
              >
                <div class="notification-content">
                  <span class="notification-item-title">{{ n.title }}</span>
                  <span v-if="n.body" class="notification-item-body">{{ n.body }}</span>
                </div>
                <span class="notification-time">{{ formatRelativeTime(n.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main class="main-content">
        <slot />
      </main>
    </div>
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

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.75rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.top-bar-spacer {
  flex: 1;
}

.notification-area {
  position: relative;
}

.notification-bell {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  position: relative;
  padding: 0.25rem;
}

.notification-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: #dc2626;
  color: white;
  font-size: 0.625rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-panel {
  position: absolute;
  top: 100%;
  right: 0;
  width: 360px;
  max-height: 480px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 50;
  overflow: hidden;
  margin-top: 0.5rem;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.notification-title {
  font-weight: 600;
  font-size: 0.875rem;
}

.mark-all-read {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.75rem;
  cursor: pointer;
  font-weight: 500;
}

.mark-all-read:hover {
  text-decoration: underline;
}

.notification-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.8125rem;
}

.notification-list {
  max-height: 400px;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.15s;
}

.notification-item:hover {
  background: #f9fafb;
}

.notification-item.unread {
  background: #eff6ff;
}

.notification-item.unread:hover {
  background: #dbeafe;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-item-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #111827;
  line-height: 1.3;
}

.notification-item-body {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.125rem;
  line-height: 1.3;
}

.notification-time {
  font-size: 0.6875rem;
  color: #9ca3af;
  flex-shrink: 0;
  white-space: nowrap;
}

.main-content {
  flex: 1;
  padding: 1.5rem;
}
</style>
