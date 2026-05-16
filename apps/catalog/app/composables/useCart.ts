/**
 * Shopping cart composable with localStorage persistence.
 *
 * The cart lives entirely in the browser — no auth required.
 * It survives page reloads and the app-switch to banking apps
 * (critical for the Pago Movil flow where the buyer leaves the PWA).
 *
 * Cart is scoped per tenant slug so a buyer shopping at two different
 * stores doesn't mix items.
 */

export interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  priceUsd: string;
  priceBs: string | null;
  imageUrl: string | null;
  quantity: number;
  stock: number;
}

interface CartState {
  items: CartItem[];
  tenantSlug: string;
}

const STORAGE_KEY = "qyne-cart";

function loadCart(tenantSlug: string): CartItem[] {
  if (import.meta.server) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const state: CartState = JSON.parse(raw);
    // Only return items for the current tenant.
    if (state.tenantSlug !== tenantSlug) return [];
    return state.items;
  } catch {
    return [];
  }
}

function saveCart(tenantSlug: string, items: CartItem[]): void {
  if (import.meta.server) return;
  const state: CartState = { tenantSlug, items };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Cart composable. Call with the current tenant slug.
 *
 * Usage:
 *   const { items, addItem, removeItem, updateQuantity, clear, totalUsd, totalBs, itemCount } = useCart("mi-tienda");
 */
export function useCart(tenantSlug: string) {
  const items = useState<CartItem[]>(`cart-${tenantSlug}`, () => loadCart(tenantSlug));

  // Persist to localStorage on every change.
  watch(items, (val) => saveCart(tenantSlug, val), { deep: true });

  function addItem(item: Omit<CartItem, "quantity">, quantity = 1): void {
    const key = item.variantId ?? item.productId;
    const existing = items.value.find((i) => (i.variantId ?? i.productId) === key);

    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, existing.stock);
    } else {
      items.value.push({ ...item, quantity: Math.min(quantity, item.stock) });
    }
  }

  function removeItem(productId: string, variantId: string | null): void {
    const key = variantId ?? productId;
    items.value = items.value.filter((i) => (i.variantId ?? i.productId) !== key);
  }

  function updateQuantity(productId: string, variantId: string | null, quantity: number): void {
    const key = variantId ?? productId;
    const item = items.value.find((i) => (i.variantId ?? i.productId) === key);
    if (!item) return;

    if (quantity <= 0) {
      removeItem(productId, variantId);
    } else {
      item.quantity = Math.min(quantity, item.stock);
    }
  }

  function clear(): void {
    items.value = [];
  }

  const itemCount = computed(() => items.value.reduce((sum, i) => sum + i.quantity, 0));

  const totalUsd = computed(() =>
    items.value.reduce((sum, i) => sum + Number(i.priceUsd) * i.quantity, 0),
  );

  const totalBs = computed(() => {
    // Only compute if all items have a Bs price.
    if (items.value.some((i) => !i.priceBs)) return null;
    return items.value.reduce((sum, i) => sum + Number(i.priceBs) * i.quantity, 0);
  });

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clear,
    itemCount,
    totalUsd,
    totalBs,
  };
}
