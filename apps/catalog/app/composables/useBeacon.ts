/**
 * Behavioral event tracking composable.
 *
 * Sends events to the beacon API for CRM behavioral tracking.
 * Events are fire-and-forget — tracking never blocks the user experience.
 *
 * Uses navigator.sendBeacon when available (survives page unload),
 * falls back to fetch for immediate events.
 *
 * Generates a persistent visitor ID stored in localStorage so anonymous
 * browsing sessions can be linked to a customer after checkout.
 *
 * Event types:
 *   - page_view: visitor viewed a catalog page
 *   - product_view: visitor viewed a product detail page
 *   - add_to_cart: visitor added a product to cart
 *   - remove_from_cart: visitor removed a product from cart
 *   - checkout_start: visitor started checkout flow
 *   - checkout_complete: visitor completed checkout
 *   - search: visitor searched for products
 */

const VISITOR_ID_KEY = "qyne-visitor-id";

function getVisitorId(): string {
  if (import.meta.server) return "";
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    // Generate a random visitor ID (UUID-like).
    id = crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

interface TrackEventOptions {
  eventType: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

export function useBeacon() {
  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl;
  const { slug, store } = useTenant();

  /**
   * Track a single behavioral event.
   * Fire-and-forget: never throws, never blocks.
   */
  function track(options: TrackEventOptions): void {
    // Only track on the client side.
    if (import.meta.server) return;

    const tenantId = store.value?.id;
    if (!tenantId) return; // Can't track without a tenant.

    const payload = {
      tenantId,
      eventType: options.eventType,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      visitorId: getVisitorId(),
      data: {
        ...options.data,
        tenantSlug: slug.value,
        url: window.location.pathname,
        referrer: document.referrer || null,
      },
    };

    const url = `${apiUrl}/beacon`;
    const body = JSON.stringify(payload);

    // Prefer sendBeacon (survives page unload) for non-critical events.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback to fetch (fire-and-forget).
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // Silently ignore tracking failures.
      });
    }
  }

  /**
   * Track a page view. Call this in onMounted() of each page.
   */
  function trackPageView(pageName?: string): void {
    track({
      eventType: "page_view",
      data: { pageName: pageName ?? document.title },
    });
  }

  /**
   * Track a product view. Call when a product detail page loads.
   */
  function trackProductView(productId: string, productName: string): void {
    track({
      eventType: "product_view",
      entityType: "product",
      entityId: productId,
      data: { productName },
    });
  }

  /**
   * Track an add-to-cart event.
   */
  function trackAddToCart(productId: string, productName: string, variantId?: string): void {
    track({
      eventType: "add_to_cart",
      entityType: "product",
      entityId: productId,
      data: { productName, variantId: variantId ?? null },
    });
  }

  /**
   * Track a remove-from-cart event.
   */
  function trackRemoveFromCart(productId: string): void {
    track({
      eventType: "remove_from_cart",
      entityType: "product",
      entityId: productId,
    });
  }

  /**
   * Track checkout start.
   */
  function trackCheckoutStart(itemCount: number, totalUsd: number): void {
    track({
      eventType: "checkout_start",
      data: { itemCount, totalUsd },
    });
  }

  /**
   * Track a search query.
   */
  function trackSearch(query: string, resultCount: number): void {
    track({
      eventType: "search",
      data: { query, resultCount },
    });
  }

  return {
    track,
    trackPageView,
    trackProductView,
    trackAddToCart,
    trackRemoveFromCart,
    trackCheckoutStart,
    trackSearch,
    getVisitorId,
  };
}
