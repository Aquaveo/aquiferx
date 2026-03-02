# Vercel Blob Storage Migration Plan

## Problem

The app currently stores all data as files on disk under `public/data/`. The API endpoints that read/write these files are implemented as Vite dev server middleware in `vite.config.ts`. This works locally with `npm run dev`, but when deployed to Vercel:

- **Reads work** — Vite builds `public/data/` into static assets served by Vercel's CDN
- **Writes fail** — The `/api/save-data`, `/api/delete-file`, `/api/delete-folder`, and `/api/rename-raster` endpoints don't exist in production (404 errors)

## Solution: Vercel Blob Storage

[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) is an S3-compatible object store with a simple API. Our data is already file-shaped (JSON, CSV, GeoJSON), so the mapping is 1:1.

### Pricing (as of 2025)

| Tier | Storage | Reads | Writes | Cost |
|------|---------|-------|--------|------|
| Hobby (free) | 250 MB | 100K/month | 10K/month | $0 |
| Pro | 1 GB included | unlimited | unlimited | $20/mo base |

Current dataset is ~55 files, well within free tier limits.

## Current Architecture

```
Browser ──fetch──▶ Vite Dev Server ──fs.*──▶ public/data/{region-id}/
                   (vite.config.ts)           ├── region.json
                                              ├── region.geojson
                                              ├── aquifers.geojson
                                              ├── wells.csv
                                              ├── data_{code}.csv
                                              └── {aquifer-slug}/
                                                  └── raster_{type}_{code}.json
```

### Current API Endpoints (Vite middleware)

| Endpoint | Method | Purpose | FS Operations |
|----------|--------|---------|---------------|
| `/api/regions` | GET | List all regions | `readdirSync`, `readFileSync` |
| `/api/save-data` | POST | Write multiple files | `mkdirSync`, `writeFileSync` |
| `/api/delete-file` | POST | Delete single file + cleanup empty dirs | `unlinkSync`, `rmdirSync` |
| `/api/delete-folder` | POST | Delete entire region folder | `rmSync` recursive |
| `/api/list-rasters` | GET | List raster analysis results | `readdirSync`, `readFileSync` |
| `/api/rename-raster` | POST | Rename/move raster file | `readFileSync`, `writeFileSync`, `unlinkSync` |

### Current Frontend Data Access

**Reads (GET static files):**
- `/data/{id}/region.json` — region metadata
- `/data/{id}/region.geojson` — region boundary
- `/data/{id}/aquifers.geojson` — aquifer polygons
- `/data/{id}/wells.csv` — well locations
- `/data/{id}/data_{code}.csv` — measurements by data type
- `/data/{id}/{aquifer-slug}/raster_{type}_{code}.json` — spatial analysis results

**Writes (POST to API):**
- `saveFiles()` → `/api/save-data` — used everywhere: imports, edits, raster saves
- `deleteFile()` → `/api/delete-file` — delete individual files
- `fetch('/api/delete-folder')` — delete entire regions
- `fetch('/api/rename-raster')` — rename raster analyses

## Target Architecture

```
Browser ──fetch──▶ Vercel Serverless Functions ──@vercel/blob──▶ Vercel Blob Store
                   api/                                           data/{region-id}/
                   ├── regions.ts          (list regions)           ├── region.json
                   ├── save-data.ts        (write files)            ├── ...
                   ├── delete-file.ts      (delete file)            └── ...
                   ├── delete-folder.ts    (delete region)
                   ├── list-rasters.ts     (list rasters)
                   ├── rename-raster.ts    (rename raster)
                   └── blob-read.ts        (read any data file)
```

### Key Change: Reads Also Go Through API

Currently the browser fetches data files directly as static assets (`/data/utah/wells.csv`). With Blob storage, these files won't be in the static build — they'll be in the Blob store. So reads need a new API route too:

- **New endpoint:** `GET /api/blob-read?path=data/{region-id}/{filename}`
- **Or** use Vercel Blob's public URL feature (each blob gets a public CDN URL)

The **public URL approach** is simpler: store the Blob URL and fetch directly from the CDN, no API middleman for reads. But the URLs are opaque (e.g., `https://abc123.public.blob.vercel-storage.com/data/utah/wells.csv`), so we'd need a lookup step or store URLs in region metadata.

**Recommended: API proxy for reads.** Keeps the same URL pattern, simpler frontend changes.

## Migration Steps

### Step 1: Set Up Vercel Blob

1. Install the package: `npm install @vercel/blob`
2. In Vercel dashboard: create a Blob store, get the `BLOB_READ_WRITE_TOKEN`
3. Add token to `.env.local` (for local dev) and Vercel project env vars

### Step 2: Create Serverless API Routes

Create an `api/` directory at project root with these files:

#### `api/regions.ts`
```typescript
// List all regions by scanning blob store for */region.json files
import { list, getBlob } from '@vercel/blob';

export default async function handler(req, res) {
  const { blobs } = await list({ prefix: 'data/', mode: 'folded' });
  // For each folder prefix, fetch region.json
  const regions = [];
  for (const blob of blobs) {
    if (blob.pathname.endsWith('/region.json')) {
      const response = await fetch(blob.url);
      const meta = await response.json();
      regions.push(meta);
    }
  }
  res.json(regions);
}
```

#### `api/save-data.ts`
```typescript
// Write multiple files to blob store
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  const { files } = req.body; // [{ path, content }]
  for (const file of files) {
    await put(file.path, file.content, { access: 'public', addRandomSuffix: false });
  }
  res.json({ ok: true, count: files.length });
}
```

#### `api/delete-file.ts`
```typescript
import { del } from '@vercel/blob';

export default async function handler(req, res) {
  const { filePath } = req.body;
  await del(`data/${filePath}`);
  res.json({ ok: true });
}
```

#### `api/delete-folder.ts`
```typescript
import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  const { folder } = req.body;
  const { blobs } = await list({ prefix: folder + '/' });
  await del(blobs.map(b => b.url));
  res.json({ ok: true });
}
```

#### `api/list-rasters.ts`
```typescript
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const regionId = req.query.region;
  const { blobs } = await list({ prefix: `data/${regionId}/` });
  const rasters = blobs
    .filter(b => b.pathname.match(/raster_.*\.json$/))
    .map(async (b) => {
      const response = await fetch(b.url);
      const data = await response.json();
      return { ...data, filePath: b.pathname.replace('data/', '') };
    });
  res.json(await Promise.all(rasters));
}
```

#### `api/rename-raster.ts`
```typescript
import { put, del } from '@vercel/blob';

export default async function handler(req, res) {
  const { oldPath, newPath, newCode, newTitle } = req.body;
  const response = await fetch(/* old blob URL */);
  const data = await response.json();
  data.code = newCode;
  data.title = newTitle;
  await put(`data/${newPath}`, JSON.stringify(data), { access: 'public', addRandomSuffix: false });
  if (oldPath !== newPath) await del(/* old blob URL */);
  res.json({ ok: true });
}
```

#### `api/blob-read.ts`
```typescript
// Proxy reads from blob store — replaces direct /data/ static file access
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const filePath = req.query.path; // e.g., "data/utah/wells.csv"
  const { blobs } = await list({ prefix: filePath });
  const blob = blobs.find(b => b.pathname === filePath);
  if (!blob) return res.status(404).json({ error: 'Not found' });
  const response = await fetch(blob.url);
  const content = await response.text();
  // Set content-type based on extension
  const ext = filePath.split('.').pop();
  const types = { json: 'application/json', csv: 'text/csv', geojson: 'application/json' };
  res.setHeader('Content-Type', types[ext] || 'text/plain');
  res.send(content);
}
```

### Step 3: Update Frontend Fetch Paths

All direct `/data/...` fetches need to route through the API in production. Two approaches:

**Option A: Environment-based URL prefix (recommended)**

Create a utility:
```typescript
// services/dataUrl.ts
const IS_PROD = import.meta.env.PROD;

export function dataUrl(path: string): string {
  // In dev: /data/utah/wells.csv (served by Vite from public/)
  // In prod: /api/blob-read?path=data/utah/wells.csv
  return IS_PROD
    ? `/api/blob-read?path=${encodeURIComponent(path.replace(/^\//, ''))}`
    : path;
}
```

Then replace all `fetch('/data/...')` and `freshFetch('/data/...')` calls with `fetch(dataUrl('/data/...'))`.

**Files that need updating:**
- `services/dataLoader.ts` — `loadRegionManifest`, `loadAquifers`, `loadWells`, `loadMeasurements`
- `App.tsx` — `handleLoadRaster`, `handleToggleCompareRaster`, `handleEditRegion`, `handleDownloadRegion`
- `components/import/ImportDataHub.tsx` — `fetchRegionList`, `handleExportDatabase`
- `components/import/WellImporter.tsx` — aquifer/well loading, region metadata
- `components/import/AquiferImporter.tsx` — aquifer loading
- `components/import/MeasurementImporter.tsx` — wells/measurements loading

**Option B: Vercel rewrite rule**

Add to `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/data/:path*", "destination": "/api/blob-read?path=data/:path*" }
  ]
}
```

This transparently routes `/data/*` to the blob-read API — zero frontend changes needed. However, it adds latency to every read (serverless function cold start) vs. direct CDN access.

### Step 4: Keep Vite Middleware for Local Dev

The existing `vite.config.ts` middleware continues to work for local development against the filesystem. No changes needed — `npm run dev` works exactly as before.

### Step 5: Seed Blob Store with Existing Data

Create a one-time script to upload `public/data/` contents to Vercel Blob:

```typescript
// scripts/seed-blob.ts
import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

async function seedBlob(dir: string, prefix: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const blobPath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      await seedBlob(fullPath, `${blobPath}/`);
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8');
      await put(blobPath, content, { access: 'public', addRandomSuffix: false });
      console.log(`Uploaded: ${blobPath}`);
    }
  }
}

seedBlob('public/data', 'data/');
```

Run with: `BLOB_READ_WRITE_TOKEN=xxx npx tsx scripts/seed-blob.ts`

### Step 6: Configure Vercel

Create `vercel.json`:
```json
{
  "framework": "vite",
  "rewrites": [
    { "source": "/data/:path*", "destination": "/api/blob-read?path=data/:path*" }
  ]
}
```

Add `BLOB_READ_WRITE_TOKEN` to the Vercel project environment variables.

## Summary of Changes

| Area | What Changes | Effort |
|------|-------------|--------|
| `api/` directory (new) | 7 serverless functions | Medium |
| `services/dataUrl.ts` (new) | URL routing utility | Small |
| Frontend fetch calls | Use `dataUrl()` or Vercel rewrite | Small-Medium |
| `vite.config.ts` | No changes (still works for local dev) | None |
| `vercel.json` (new) | Deployment config + rewrite rule | Small |
| `scripts/seed-blob.ts` (new) | One-time data upload | Small |
| Vercel dashboard | Create Blob store, set env var | Small |

## Open Questions

1. **Vercel rewrite vs. `dataUrl()` utility?** Rewrite is zero frontend changes but all reads go through a serverless function. The utility is more explicit and could later point directly at Blob CDN URLs for faster reads.

2. **Public vs. private blobs?** Using `access: 'public'` means blobs get CDN URLs anyone can access (if they know the URL). For groundwater data this is probably fine. Use `access: 'private'` if data should be restricted.

3. **Blob store size limits?** Free tier is 250 MB. Raster analysis JSON files can be large. May need to monitor usage.

4. **Authentication?** Currently there's no auth — anyone with the URL can read and write. This is a separate concern from storage backend, but worth considering for production.
