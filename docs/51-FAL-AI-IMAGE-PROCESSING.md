# Qyne — Image Processing with fal.ai

> **Status**: Active  
> **Last Updated**: May 2026  
> **Replaces**: All references to Photoroom in previous docs

---

## 1. Why fal.ai Instead of Photoroom

### Cost Comparison

| Service | Cost/image | 10K imgs/mo | Notes |
|---|---|---|---|
| **fal.ai rembg** | ~$0.001 | ~$10 | Open-source model, billed per compute second |
| **fal.ai Bria RMBG 2.0** | $0.018 | $180 | Licensed data, enterprise-safe |
| **Photoroom Basic** | $0.02 | $200 | Background removal only |
| **Photoroom Plus** | $0.10 | $1,000 | AI backgrounds + shadows |

At $8-15/merchant, Photoroom at scale eats 20%+ of revenue. fal.ai rembg is ~20x cheaper for the same background removal, and Bria is comparable in price but with better licensing.

### Architecture Advantage

fal.ai is an API — no containers, no GPU, no RAM on our VPS. The processing happens on fal.ai's infrastructure. We send an image URL, get back a processed image URL. This keeps our VPS lean for what it does best: serving the app.

---

## 2. Service Design

### Two Providers, One Interface

```typescript
// services/image-processor.ts

interface ImageProcessResult {
  url: string;           // URL of processed image (on fal.ai CDN)
  width: number;
  height: number;
  contentType: string;
  fileSize: number;
  provider: "fal-rembg" | "fal-bria";
}

type ImageProvider = "fal-rembg" | "fal-bria";
```

**`fal-rembg`** (default for all plans):
- Endpoint: `fal-ai/imageutils/rembg`
- Cost: ~$0.001/image (billed per compute second, <1 sec per image)
- Quality: Good for ecommerce products (clothing, shoes, accessories, food)
- Output: PNG with transparent background

**`fal-bria`** (premium, Pro/Business plans):
- Endpoint: `fal-ai/bria/background/remove`
- Cost: $0.018/image
- Quality: Professional-grade, trained on licensed data, better edge detection
- Output: PNG with transparent background
- Use case: When merchants need higher quality (jewelry, transparent objects, fine details)

### Plan Limits

| Plan | Background Removal | Provider | Monthly Limit |
|---|---|---|---|
| Free | Included | fal-rembg | 10 images |
| Starter | Included | fal-rembg | 100 images |
| Pro | Included | fal-rembg (default) + fal-bria (selectable) | Unlimited rembg, 200 bria |
| Business | Included | fal-rembg + fal-bria | Unlimited both |

---

## 3. Integration Architecture

### Flow

```
Merchant uploads photo
       │
       ▼
POST /uploads/image (existing route)
       │
       ├── Validates file (magic bytes, size, type)
       ├── Uploads original to R2
       │
       ▼
Enqueue BullMQ job: "process-image"
       │
       ├── payload: { imageUrl, tenantId, productId, provider }
       │
       ▼
BullMQ Worker picks up job
       │
       ├── Checks tenant plan limits
       ├── Calls fal.ai API (rembg or bria)
       │     │
       │     ├── fal.subscribe("fal-ai/imageutils/rembg", { input: { image_url } })
       │     │   or
       │     ├── fal.subscribe("fal-ai/bria/background/remove", { input: { image_url } })
       │     │
       │     ▼
       │   fal.ai processes image (~1-3 seconds)
       │     │
       │     ▼
       │   Returns { image: { url, width, height } }
       │
       ├── Downloads processed image from fal.ai CDN
       ├── Uploads to R2 (our permanent storage)
       ├── Updates product record with processed image URL
       │
       ▼
Product image updated (merchant sees result in dashboard)
```

### Why BullMQ (not direct API call)

1. **Non-blocking**: Merchant doesn't wait 3+ seconds for the upload response
2. **Retry**: If fal.ai is temporarily down, BullMQ retries automatically
3. **Rate limiting**: Controls how many concurrent fal.ai calls we make
4. **Plan enforcement**: Worker checks limits before calling the API
5. **Already in the stack**: BullMQ is a dependency, Redis is running

### fal.ai SDK Usage

```typescript
import { createFalClient } from "@fal-ai/client";

const fal = createFalClient({
  credentials: process.env.FAL_KEY,
});

// Background removal with rembg (default)
const result = await fal.subscribe("fal-ai/imageutils/rembg", {
  input: { image_url: "https://r2.example.com/original.jpg" },
});
// result.data.image.url -> processed image on fal.ai CDN

// Background removal with Bria (premium)
const result = await fal.subscribe("fal-ai/bria/background/remove", {
  input: { image_url: "https://r2.example.com/original.jpg" },
});
```

### Error Handling

```typescript
try {
  const result = await fal.subscribe(endpoint, {
    input: { image_url },
    pollInterval: 1000,    // Check every second
    timeout: 30000,        // 30 second timeout
    onQueueUpdate: (update) => {
      // Log progress for debugging
    },
  });
} catch (error) {
  // Retry via BullMQ (automatic, up to 3 attempts)
  throw error;
}
```

---

## 4. Environment Variables

### New (replacing Photoroom)

```
FAL_KEY=                    # fal.ai API key (https://fal.ai/dashboard/keys)
```

### Removed

```
PHOTOROOM_API_KEY=          # No longer needed
```

### Pulumi ESC Update

```yaml
# qyne-infra/nova-app environment
values:
  falKey:
    fn::secret: <from-fal-dashboard>
  environmentVariables:
    FAL_KEY: ${falKey}
    # Remove: PHOTOROOM_API_KEY
```

---

## 5. Cost Projections

### At 200 Merchants (Beta)

| Scenario | Images/mo | Provider | Cost |
|---|---|---|---|
| Conservative | 2,000 | rembg | ~$2 |
| Moderate | 5,000 | rembg | ~$5 |
| Heavy | 10,000 | rembg | ~$10 |
| With premium | 10,000 rembg + 500 bria | mixed | ~$19 |

### At 1,000 Merchants

| Scenario | Images/mo | Provider | Cost |
|---|---|---|---|
| Conservative | 10,000 | rembg | ~$10 |
| Moderate | 50,000 | rembg | ~$50 |
| With premium | 50,000 rembg + 5,000 bria | mixed | ~$140 |

Compare with Photoroom at 50,000 images: **$1,000/mo** (Basic) or **$5,000/mo** (Plus).

### Revenue vs Cost

At 1,000 merchants with $10 average revenue:
- Revenue: $10,000/mo
- fal.ai cost: ~$140/mo (1.4% of revenue)
- Photoroom would be: $1,000-5,000/mo (10-50% of revenue)

---

## 6. Future fal.ai Capabilities

These endpoints are available on fal.ai and can be added as premium features without architecture changes:

| Feature | Endpoint | Cost | Plan |
|---|---|---|---|
| AI Background Replace | `fal-ai/bria/background/replace` | $0.023 | Business |
| Product Shot (studio scene) | `fal-ai/bria/product-shot` | $0.023 | Business |
| Image Expand (outpainting) | `fal-ai/bria/expand` | $0.023 | Business |
| Image Upscale | `fal-ai/aura-sr` | $0.01 | Pro |

Adding any of these is: new endpoint ID + new BullMQ job type + new plan limit. Same architecture, same worker, same flow.

---

## 7. Sprint Plan

### Sprint 6 (Updated): fal.ai Image Processing + Inventory

| # | Task | Details |
|---|---|---|
| 1 | Install `@fal-ai/client` | Add to API dependencies |
| 2 | Create `services/image-processor.ts` | Unified interface for rembg + bria providers |
| 3 | Create BullMQ worker for image processing | Queue job on upload, process async, update product |
| 4 | Update `POST /uploads/image` | After R2 upload, enqueue processing job |
| 5 | Add `GET /uploads/:id/status` | Check processing status (pending/processing/done/failed) |
| 6 | Plan limit enforcement | Check tenant plan before calling fal.ai |
| 7 | Update environment variables | Replace PHOTOROOM_API_KEY with FAL_KEY everywhere |
| 8 | Dual pricing (BCV rate) | Integrate `ve.dolarapi.com` API (from NALA) |
| 9 | Inventory management | Stock adjustments, movement history, low stock alerts |

### Sprint 7 (Unchanged): Complete Checkout

| # | Task | Details |
|---|---|---|
| 1 | Shopping cart | localStorage + API, sticky bottom bar |
| 2 | Buyer info form | Name + phone (2 required fields) |
| 3 | Pago Movil flow | Copy bank data, upload screenshot |
| 4 | Zelle flow | Show email, reference field |
| 5 | Cash on delivery | Simple option |
| 6 | Payment screenshot upload to R2 | Reuse upload infrastructure |
| 7 | Stock reservation on checkout | 24h TTL, Prefect job to release expired |
