# GEOGLOWS — User & Data Management Strategy

## Executive Summary

The [GEOGLOWS](https://dev.apps.geoglows.org/) web application suite consists of three apps that share a common user account system:

| App | Purpose | Data |
|---|---|---|
| **Hydroviewer RFS v2** | View past, current, and forecasted river conditions globally | River Forecast System streams, forecasts |
| **GRACE Regional Groundwater Analyst** | Monitor regional groundwater storage changes from GRACE/GRACE-FO satellite gravity data | GRACE basins, time series, anomaly grids |
| **Aquifer Analyst** | Map and analyze groundwater well locations and observations | Regions, aquifers, wells, measurements, spatial analyses |

All three apps share **one Supabase project** for authentication, user profiles, and organizations. Each app has its own database schema for app-specific data. A user signs up once and has access to all three apps with the same account and organization memberships.

The Aquifer Analyst currently runs as a local-only prototype with no user accounts, no remote data storage, and no access control. This document defines the strategy to evolve it into a multi-user cloud application while preserving a fully offline mode for organizations that cannot share data externally. The shared infrastructure patterns described here (auth, orgs, profiles) apply equally to the other two apps.

### Goals

- **Shared user accounts** across all three GEOGLOWS apps via a single Supabase Auth instance.
- **Organization-based access control** with admin (read/write) and viewer (read-only) roles, shared across all apps.
- **Cloud data persistence** so users can revisit and manage their data across sessions.
- **Public and private visibility** — organizations choose whether their data is publicly accessible or restricted to members.
- **Air-gapped / local-only mode** for organizations that treat groundwater data as confidential. Data never leaves the browser.
- **Sample data** that new users can explore immediately to understand each app's capabilities.
- **Concurrent editing safety** via optimistic locking to prevent data loss when multiple admins work simultaneously.

### Approach

The recommended stack is **Supabase** (authentication, Postgres database, file storage) and **Vercel** (hosting, serverless API routes, GitHub CI/CD). Both offer generous free tiers and scale affordably. Supabase is open-source and can be self-hosted if institutional requirements demand it.

One Supabase project serves all three apps. Shared tables (`profiles`, `organizations`, `org_memberships`) live in the `public` schema. Each app gets its own Postgres schema for app-specific data (`aquifer`, `hydroviewer`, `grace`). This keeps data cleanly separated while sharing identity and permissions.

The core architectural change for Aquifer Analyst is a **Data Provider abstraction layer** — a TypeScript interface that all components use instead of calling APIs directly. Two implementations back this interface: a `SupabaseDataProvider` for cloud mode and a `LocalDataProvider` (IndexedDB) for air-gapped mode. This allows the entire visualization and analysis layer to remain unchanged regardless of where data lives.

Implementation is organized into **7 phases**: (1) data abstraction layer, (2) Supabase setup, (3) authentication and user management, (4) cloud data operations, (5) Vercel deployment, (6) local/air-gapped mode, (7) public access and sample regions.

---

## Table of Contents

1. [GEOGLOWS App Suite & Shared Infrastructure](#1-geoglows-app-suite--shared-infrastructure)
2. [Technology Stack](#2-technology-stack)
3. [Use Cases & Access Patterns](#3-use-cases--access-patterns)
4. [App Modes & Entry Flow](#4-app-modes--entry-flow)
5. [Current On-Disk Data Layout (Reference)](#5-current-on-disk-data-layout-reference)
6. [Database Schema](#6-database-schema)
7. [Row-Level Security (RLS)](#7-row-level-security-rls)
8. [Data Provider Abstraction Layer](#8-data-provider-abstraction-layer)
9. [Organization & Permissions](#9-organization--permissions)
10. [Optimistic Locking (Concurrency)](#10-optimistic-locking-concurrency)
11. [Vercel API Routes](#11-vercel-api-routes)
12. [Sample Regions](#12-sample-regions)
13. [Implementation Phases](#13-implementation-phases)
14. [What Changes and What Doesn't](#14-what-changes-and-what-doesnt)

---

## 1. GEOGLOWS App Suite & Shared Infrastructure

### The Three Apps

All three apps are separate Vercel deployments (separate repos, separate builds) that share one Supabase project for identity and permissions.

```
                        ┌─────────────────────────────────┐
                        │     Supabase (one project)      │
                        │                                 │
                        │  auth.users     ← shared auth   │
                        │  public.profiles                │
                        │  public.organizations           │
                        │  public.org_memberships         │
                        │                                 │
                        │  aquifer.*      ← Aquifer data  │
                        │  hydroviewer.*  ← Hydroviewer   │
                        │  grace.*       ← GRACE data     │
                        └──────┬──────┬──────┬────────────┘
                               │      │      │
              ┌────────────────┘      │      └────────────────┐
              │                       │                       │
    ┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
    │  Aquifer Analyst   │  │  Hydroviewer RFS  │  │   GRACE Analyst   │
    │  (Vercel deploy)   │  │  (Vercel deploy)  │  │  (Vercel deploy)  │
    │  aquifer.apps.     │  │  hydroviewer.apps. │  │  grace.apps.      │
    │  geoglows.org      │  │  geoglows.org      │  │  geoglows.org     │
    └────────────────────┘  └────────────────────┘  └────────────────────┘
```

### Cross-App Authentication

All three apps use the same `SUPABASE_URL` and `SUPABASE_ANON_KEY`. A user who signs up on any app has the same account everywhere. However, because the apps are on different subdomains, **browser sessions (localStorage) are not shared** between them. This means:

- A user logs in on Aquifer Analyst → they have a session on `aquifer.apps.geoglows.org`
- They navigate to Hydroviewer → they need to log in again (same credentials, same account, separate session)
- This is the standard behavior for most multi-app suites and requires no special infrastructure

If seamless single sign-on (login once, authenticated everywhere) becomes a priority later, options include:
1. **Central auth page** on `apps.geoglows.org` that handles login and passes a token to each app via redirect
2. **Shared cookie domain** using Supabase's custom domain feature on `.apps.geoglows.org`

For launch, the simpler "same account, separate sessions" approach is recommended.

### Shared vs. App-Specific Data

| Schema | Owned By | Contains |
|---|---|---|
| `public` | All apps (shared) | `profiles`, `organizations`, `org_memberships` |
| `aquifer` | Aquifer Analyst | `regions`, `aquifers`, `wells`, `measurements`, `data_types`, `storage_analyses`, `sample_region_templates` |
| `hydroviewer` | Hydroviewer RFS | Streams, forecasts, saved views (TBD by Hydroviewer team) |
| `grace` | GRACE Analyst | Basins, GRACE time series, anomaly grids (TBD by GRACE team) |

Organizations are shared: if a user creates an org "Utah Water Agency" and invites colleagues, those colleagues can access that org's data in all three apps. Roles (admin/viewer) also apply across all apps — an admin can write data in any app under their org.

### NPM Package: `@geoglows/auth`

To avoid duplicating auth UI and logic across three codebases, the shared components should be extracted into a common package:

```
@geoglows/auth
  ├── SupabaseProvider     — React context wrapping the Supabase client
  ├── AuthProvider         — React context for current user, orgs, active org
  ├── LoginPage            — Email/password + social login buttons
  ├── OrgSelector          — Dropdown to switch active org
  ├── OrgSettings          — Member management, invite, role editing
  ├── UserMenu             — Avatar, profile link, logout
  ├── useAuth()            — Hook: current user, login/logout methods
  ├── useOrg()             — Hook: active org, role, org list
  └── types                — Profile, Organization, OrgMembership TypeScript types
```

Each app installs `@geoglows/auth`, wraps its root in `<SupabaseProvider>` and `<AuthProvider>`, and gets login, org management, and user menus for free. App-specific data providers and UI remain in each app's own codebase.

---

## 2. Technology Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend (per app) | React 19 + Vite 6 | Free |
| Hosting (per app) | Vercel | Free (hobby) / $20/mo (pro) per app |
| Auth + DB + Storage | Supabase (one project, shared) | Free tier / $25/mo (pro) |
| Shared auth package | `@geoglows/auth` (private npm or monorepo) | Free |
| Repo + CI/CD | GitHub → Vercel auto-deploy | Free |

### Why Supabase

- **Free tier is generous** — 50K monthly active users, 500MB database, 1GB storage.
- **Auth is built in** — Google, GitHub, email/password, and SAML/SSO for institutional logins. No separate service to manage.
- **Postgres database** — Real SQL with Row-Level Security (RLS) policies. Permissions are enforced at the database level, not just in application code.
- **One project for all three apps** — Users sign up once. Organizations and memberships are shared. Each app uses its own Postgres schema for app-specific data.
- **Storage bucket** — For GeoJSON files, shapefiles, and other binary uploads that don't belong in Postgres tables.
- **Real-time subscriptions** — Built-in support for "someone else just imported new data" notifications if needed in the future.
- **Open source** — If GEOGLOWS ever needs to self-host (university IT requirements, etc.), Supabase can be deployed on your own infrastructure.

### Why Vercel

- Each app is a separate Vercel project with its own repo and deployment pipeline.
- Automatic deployments on every push to `main` via GitHub integration.
- Every pull request gets a preview deployment with a unique URL for testing.
- Build settings auto-detect Vite projects — near-zero configuration.
- Serverless API routes (`api/` directory) replace the current Vite dev server middleware.
- Environment variables managed in the Vercel dashboard (Supabase keys, etc.).
- Free hobby tier for development; Pro ($20/mo) for production.

### Cost Estimate (All Three Apps)

| Item | Cost |
|---|---|
| Supabase Pro (shared) | $25/mo |
| Vercel Pro × 3 apps | $60/mo |
| **Total** | **~$85/mo** |

Usage overages (MAUs, storage, egress) would add to this if traffic is high. For a modest academic/research user base, the base cost covers it.

---

## 2. Use Cases & Access Patterns

| Pattern | Auth Required | Data Location | Visibility |
|---|---|---|---|
| **Public viewer** | None | Cloud (Supabase) | Read-only, anyone with the URL |
| **Org viewer** | Login | Cloud (Supabase) | Read-only, org members only |
| **Org admin** | Login | Cloud (Supabase) | Read/write, org members only |
| **Public org** | Login (admins) | Cloud (Supabase) | Admins manage, public can view |
| **Air-gapped / local-only** | None | Browser only (IndexedDB) | Never leaves the machine |

### Air-Gapped Use Case

Some organizations consider groundwater data to be a state secret. They will not upload data to any remote server. For these users:

- The app runs entirely in the browser. No data is transmitted over the network.
- Users upload a zip file containing their region data. It is loaded into IndexedDB (browser-local storage).
- All visualization and analysis features work identically to cloud mode.
- Users can export their data back as a zip file when done.
- When the browser tab closes, the data can be cleared (with a warning).

---

## 3. App Modes & Entry Flow

```
User visits app
  │
  ├─→ "Sign In" → Supabase Auth → Cloud Mode
  │     ├─→ Dashboard: your orgs, your regions
  │     ├─→ Create org, invite members
  │     ├─→ Import data (writes to Supabase)
  │     └─→ View public regions (no org required)
  │
  ├─→ "Use Locally" → Local Mode (Air-Gapped)
  │     ├─→ Upload zip file → IndexedDB
  │     ├─→ Full app functionality (view, analyze, import)
  │     ├─→ Export zip when done
  │     └─→ Data never leaves the browser
  │
  └─→ "Explore Sample Data" → Read-Only Cloud Mode (no login)
        └─→ Browse pre-loaded demo regions
```

---

## 5. Current On-Disk Data Layout (Reference)

This section documents the current file-based storage structure for reference during migration.

### Directory Structure

```
public/data/
├── {region-id}/                        # e.g. "jamaica", "utah", "great-salt-lake-basin"
│   ├── region.json                     # Region metadata (id, name, lengthUnit, singleUnit, dataTypes[])
│   ├── region.geojson                  # Region boundary (FeatureCollection, single polygon)
│   ├── aquifers.geojson                # Aquifer boundaries (FeatureCollection, multiple polygons)
│   │                                   #   Properties: { aquifer_id: "2", aquifer_name: "Kingston" }
│   ├── wells.csv                       # Well locations
│   │                                   #   Columns: well_id, well_name, lat, long, gse, aquifer_id
│   ├── data_{code}.csv                 # One file per data type (e.g. data_wte.csv, data_salt.csv)
│   │                                   #   Columns: well_id, well_name, date, value, aquifer_id
│   └── {aquifer-slug}/                 # One subfolder per aquifer that has spatial analyses
│       └── raster_{dataType}_{code}.json   # Spatial analysis result (~0.5–2 MB each)
```

### Aquifer Slug Convention

Aquifer subfolders are named using `slugify(aquifer_name)`:

```typescript
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
```

Examples: `"Kingston"` → `"kingston"`, `"Blue Mountain South"` → `"blue_mountain_south"`

### Raster Analysis Files

Each file contains the full analysis result:

```json
{
  "version": 1,
  "title": "kriging",
  "code": "kriging",
  "aquiferId": "2",
  "aquiferName": "Kingston",
  "regionId": "jamaica",
  "dataType": "wte",
  "params": { "startDate": "...", "endDate": "...", "resolution": 50, ... },
  "options": { "temporal": { ... }, "spatial": { ... } },
  "grid": { "minLng": ..., "minLat": ..., "dx": ..., "dy": ..., "nx": 50, "ny": 40, "mask": [...] },
  "frames": [ { "date": "...", "values": [...] }, ... ],
  "createdAt": "...",
  "generatedAt": "..."
}
```

### Current Dataset Summary

| Region | Wells | Measurement Rows | Data Types | Spatial Analyses |
|---|---|---|---|---|
| Dominican Republic | 699 | 15,080 | wte, tce | — |
| Great Salt Lake Basin | 3,150 | 177,209 | wte | — |
| Guam | 21 | 602 | wte | — |
| Jamaica | 699 | 116,913 | wte, salt | 5 (Kingston aquifer) |
| Jordan | 34 | 5,868 | wte | — |
| Niger | 125 | 2,323 | wte | — |
| Oregon | 246 | 3,983 | wte | — |
| Utah | 1,876 | 179,665 | wte | — |
| Volta Basin | 14 | 619 | wte | — |
| **Total** | **6,864** | **502,262** | | **5** |

---

## 6. Database Schema

### Shared Tables (`public` schema — used by all three apps)

```sql
-- Users (managed by Supabase Auth; this extends auth.users)
CREATE TABLE public.profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users(id),
    email       text NOT NULL,
    display_name text,
    created_at  timestamptz DEFAULT now()
);

-- Organizations (shared across all GEOGLOWS apps)
CREATE TABLE public.organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,  -- URL-safe identifier
    created_by  uuid REFERENCES public.profiles(id),
    created_at  timestamptz DEFAULT now()
);

-- Organization memberships (shared across all GEOGLOWS apps)
-- An admin in an org is admin in all three apps for that org.
CREATE TABLE public.org_memberships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('admin', 'viewer')),
    invited_at  timestamptz DEFAULT now(),
    accepted_at timestamptz,
    UNIQUE (org_id, user_id)
);
```

### Aquifer Analyst Tables (`aquifer` schema)

```sql
CREATE SCHEMA IF NOT EXISTS aquifer;

-- Regions
CREATE TABLE aquifer.regions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,  -- nullable for sample regions
    slug        text NOT NULL,
    name        text NOT NULL,
    length_unit text NOT NULL CHECK (length_unit IN ('ft', 'm')),
    single_unit boolean NOT NULL DEFAULT false,
    visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    version     integer NOT NULL DEFAULT 1,  -- optimistic locking
    boundary    jsonb,                        -- GeoJSON geometry
    is_sample   boolean NOT NULL DEFAULT false,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (org_id, slug)
);

-- Data types (per region)
CREATE TABLE aquifer.data_types (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id   uuid NOT NULL REFERENCES aquifer.regions(id) ON DELETE CASCADE,
    code        varchar(20) NOT NULL,
    name        text NOT NULL,
    unit        text NOT NULL,
    UNIQUE (region_id, code)
);

-- Aquifers
CREATE TABLE aquifer.aquifers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id   uuid NOT NULL REFERENCES aquifer.regions(id) ON DELETE CASCADE,
    aquifer_id  text NOT NULL,      -- user-facing ID ("0", "1", etc.)
    aquifer_name text NOT NULL,
    boundary    jsonb,              -- GeoJSON geometry
    UNIQUE (region_id, aquifer_id)
);

-- Wells
CREATE TABLE aquifer.wells (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id   uuid NOT NULL REFERENCES aquifer.regions(id) ON DELETE CASCADE,
    aquifer_id  uuid REFERENCES aquifer.aquifers(id) ON DELETE SET NULL,
    well_id     text NOT NULL,      -- user-facing ID
    well_name   text,
    lat         double precision NOT NULL,
    long        double precision NOT NULL,
    gse         double precision,   -- ground surface elevation
    created_at  timestamptz DEFAULT now(),
    UNIQUE (region_id, well_id)
);

-- Measurements
CREATE TABLE aquifer.measurements (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id   uuid NOT NULL REFERENCES aquifer.regions(id) ON DELETE CASCADE,
    well_id     uuid NOT NULL REFERENCES aquifer.wells(id) ON DELETE CASCADE,
    data_type   varchar(20) NOT NULL,
    date        date NOT NULL,
    value       double precision NOT NULL
);
CREATE INDEX idx_measurements_lookup
    ON aquifer.measurements (region_id, well_id, data_type, date);

-- Spatial analyses (raster interpolations: kriging, IDW, etc.)
-- Metadata stored in Postgres; large result data stored in Supabase Storage.
--
-- Current file-based layout for reference:
--   public/data/{region-id}/{aquifer-slug}/raster_{dataType}_{code}.json
-- where aquifer-slug = slugify(aquifer_name) using:
--   s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
--
-- Each raster JSON file is ~0.5–2 MB (grids, frames, masks). Storing these
-- as JSONB in Postgres would bloat the database. Instead, the result data
-- goes into a Supabase Storage bucket and this table stores a reference.
CREATE TABLE aquifer.spatial_analyses (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id     uuid NOT NULL REFERENCES aquifer.regions(id) ON DELETE CASCADE,
    aquifer_id    uuid REFERENCES aquifer.aquifers(id) ON DELETE CASCADE,
    data_type     varchar(20) NOT NULL,    -- e.g. "wte", "salt"
    title         text NOT NULL,
    code          text NOT NULL,           -- slugified title, used in filenames
    params        jsonb NOT NULL,          -- RasterAnalysisParams (dates, resolution, method, etc.)
    options       jsonb,                   -- TemporalOptions, SpatialOptions
    storage_path  text NOT NULL,           -- path in Supabase Storage bucket
    created_at    timestamptz DEFAULT now(),
    generated_at  timestamptz,
    UNIQUE (region_id, aquifer_id, data_type, code)
);

-- Sample region templates (for the "Explore Sample Data" feature)
CREATE TABLE aquifer.sample_region_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    thumbnail_url text,
    bundle_path text NOT NULL,      -- path in Supabase Storage to the zip
    created_at  timestamptz DEFAULT now()
);
```

### Other App Schemas (defined by their respective teams)

```sql
-- Hydroviewer RFS v2 — tables TBD
CREATE SCHEMA IF NOT EXISTS hydroviewer;
-- e.g. hydroviewer.saved_views, hydroviewer.stream_bookmarks, ...

-- GRACE Regional Groundwater Analyst — tables TBD
CREATE SCHEMA IF NOT EXISTS grace;
-- e.g. grace.basins, grace.time_series, grace.anomaly_grids, ...
```

---

## 7. Row-Level Security (RLS)

All tables have RLS enabled. Core policies:

### Shared Tables (public schema)

```sql
-- Profiles: users can read all profiles, update only their own
CREATE POLICY "Profiles are publicly readable"
    ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Organizations: readable by members
CREATE POLICY "Org members can read their orgs"
    ON public.organizations FOR SELECT
    USING (id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
    ));

-- Memberships: readable by org members, writable by org admins
CREATE POLICY "Members can view org memberships"
    ON public.org_memberships FOR SELECT
    USING (org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
    ));
```

### Aquifer Analyst Tables (aquifer schema)

#### Regions

```sql
-- Anyone can read public regions and sample regions
CREATE POLICY "Public regions are visible to all"
    ON aquifer.regions FOR SELECT
    USING (visibility = 'public' OR is_sample = true);

-- Org members can read their org's private regions
CREATE POLICY "Org members can view private regions"
    ON aquifer.regions FOR SELECT
    USING (org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
    ));

-- Only org admins can write
CREATE POLICY "Org admins can modify regions"
    ON aquifer.regions FOR ALL
    USING (org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid() AND role = 'admin'
    ));
```

#### Child Tables (aquifers, wells, measurements, data_types, storage_analyses)

All inherit access from their parent region:

```sql
-- Read: allowed if the parent region is readable
CREATE POLICY "Readable if region is readable"
    ON aquifer.wells FOR SELECT
    USING (region_id IN (
        SELECT id FROM aquifer.regions
        WHERE visibility = 'public'
           OR is_sample = true
           OR org_id IN (
               SELECT org_id FROM public.org_memberships
               WHERE user_id = auth.uid()
           )
    ));

-- Write: allowed if user is admin of the parent region's org
CREATE POLICY "Writable if org admin"
    ON aquifer.wells FOR ALL
    USING (region_id IN (
        SELECT r.id FROM aquifer.regions r
        JOIN public.org_memberships m ON m.org_id = r.org_id
        WHERE m.user_id = auth.uid() AND m.role = 'admin'
    ));
```

The same pattern applies to all child tables in the `aquifer` schema. Hydroviewer and GRACE teams define their own RLS policies following the same org-membership pattern against their respective schemas.

---

## 8. Data Provider Abstraction Layer

The abstraction layer is the key architectural piece that enables both cloud and local modes. Components never call Supabase or fetch APIs directly — they go through a provider interface.

### Design Decision: Org-Free Interface

The `DataProvider` interface does **not** include organization or permission concepts (`orgId`, roles, etc.). This is intentional:

- **Local mode doesn't need orgs.** The interface should represent pure data operations.
- **Cloud mode scopes by org internally.** The `SupabaseDataProvider` uses the authenticated user's active org from `AuthContext` to filter queries. The interface callers don't need to know about this.
- **Separation of concerns.** Auth/permissions are a cross-cutting concern handled at the provider implementation level and UI level (hiding edit buttons for viewers), not at the data interface level.

### Interface

```typescript
interface DataProvider {
  // Regions
  listRegions(): Promise<RegionMeta[]>;
  getRegion(id: string): Promise<Region>;
  saveRegion(region: RegionInput): Promise<Region>;
  updateRegion(id: string, updates: { name?: string; lengthUnit?: 'ft' | 'm' }): Promise<void>;
  deleteRegion(id: string): Promise<void>;

  // Aquifers
  getAquifers(regionId: string): Promise<Aquifer[]>;
  saveAquifers(regionId: string, aquifers: AquiferInput[], mode: 'append' | 'replace'): Promise<void>;
  renameAquifer(regionId: string, aquiferId: string, newName: string): Promise<void>;
  deleteAquifer(regionId: string, aquiferId: string): Promise<void>;  // cascades to wells + measurements

  // Wells
  getWells(regionId: string): Promise<Well[]>;
  saveWells(regionId: string, wells: WellInput[], mode: 'append' | 'replace'): Promise<void>;

  // Measurements
  getMeasurements(regionId: string, dataType: string): Promise<Measurement[]>;
  saveMeasurements(regionId: string, dataType: string, data: MeasurementInput[], mode: 'append' | 'replace'): Promise<void>;
  updateMeasurement(regionId: string, wellId: string, dataType: string, date: string, value: number): Promise<void>;
  deleteMeasurement(regionId: string, wellId: string, dataType: string, date: string): Promise<void>;

  // Spatial analyses (raster interpolations)
  listSpatialAnalyses(regionId: string): Promise<RasterAnalysisMeta[]>;
  getSpatialAnalysis(regionId: string, filePath: string): Promise<RasterAnalysisResult>;
  saveSpatialAnalysis(regionId: string, result: RasterAnalysisResult): Promise<void>;
  deleteSpatialAnalysis(regionId: string, filePath: string): Promise<void>;
  renameSpatialAnalysis(regionId: string, oldPath: string, newTitle: string, newCode: string): Promise<void>;

  // Imputation models
  listModels(regionId: string): Promise<ImputationModelMeta[]>;
  getModel(regionId: string, filePath: string): Promise<ImputationModelResult>;
  deleteModel(regionId: string, filePath: string): Promise<void>;
  renameModel(regionId: string, oldPath: string, newTitle: string, newCode: string): Promise<void>;

  // GeoJSON boundaries
  getRegionBoundary(regionId: string): Promise<GeoJSON.FeatureCollection>;
  getAquiferBoundaries(regionId: string): Promise<GeoJSON.FeatureCollection>;

  // Data types
  getDataTypes(regionId: string): Promise<DataType[]>;
  saveDataType(regionId: string, dataType: DataType): Promise<void>;
  deleteDataType(regionId: string, code: string): Promise<void>;

  // Bulk import/export (zip-based)
  exportRegion(regionId: string): Promise<Blob>;                     // returns zip
  exportDatabase(): Promise<Blob>;                                    // returns zip of all regions
  importRegionFromZip(file: File): Promise<{ regionId: string }>;
  importDatabaseFromZip(file: File, mode: 'append' | 'replace'): Promise<ImportResult>;
}
```

### Implementations

Three implementations back this interface, built in order:

1. **`ViteDataProvider`** — Wraps the current Vite dev server middleware (`/api/*` endpoints and `/data/*` file reads). This is the first implementation, built during Phase 1. It preserves all existing behavior while routing through the interface. Used during development.

2. **`IndexedDBDataProvider`** — Reads and writes to browser IndexedDB. Built during Phase 2. Data is loaded from a user-uploaded zip and stored in IndexedDB object stores (one per entity type). Spatial analysis results are stored as IndexedDB blobs. Zero network requests. Used in air-gapped/local mode.

3. **`SupabaseDataProvider`** — Reads and writes to Supabase Postgres via the Supabase JS client SDK. Built later (Phase 4). Scopes all queries by the authenticated user's active organization (from `AuthContext`). Spatial analysis results stored in a Supabase Storage bucket. Used in cloud mode.

### React Integration

```typescript
// Context provides the active data provider
const DataProviderContext = createContext<DataProvider>(null!);

// Hook used by all components
function useDataProvider(): DataProvider {
  return useContext(DataProviderContext);
}

// App root selects the provider based on mode
function App() {
  const [mode, setMode] = useState<'vite' | 'local' | 'cloud'>('vite');
  const provider = useMemo(() => {
    switch (mode) {
      case 'vite':  return new ViteDataProvider();
      case 'local': return new IndexedDBDataProvider();
      case 'cloud': return new SupabaseDataProvider(supabaseClient);
    }
  }, [mode]);

  return (
    <DataProviderContext.Provider value={provider}>
      {/* ... */}
    </DataProviderContext.Provider>
  );
}
```

---

## 9. Organization & Permissions

### Self-Service Organization Creation

1. User signs up or logs in via Supabase Auth.
2. User clicks "Create Organization" → enters a name.
3. A URL-safe slug is auto-generated from the name.
4. The user is automatically assigned as the first admin.
5. The user can invite others via email.
6. Invitees receive an email link → create account (or link existing) → join as viewer or admin (the inviter chooses the role).

### Permission Matrix

| Action | Required Role |
|---|---|
| View public region | No login required |
| View sample region | No login required |
| View private region | Org member (admin or viewer) |
| Import / edit / delete data | Org admin |
| Create spatial analysis | Org admin |
| Create organization | Any logged-in user |
| Invite members | Org admin |
| Change member roles | Org admin |
| Remove members | Org admin |
| Delete organization | Org admin (with confirmation) |
| Change region visibility | Org admin |
| Manage sample templates | GEOGLOWS super-admin |

### UI Changes

- **Header**: Shows user avatar/name and org selector dropdown when logged in.
- **Sidebar**: Regions grouped by org, with a "Public" section for public regions and a "Samples" section for demo data.
- **Import hub**: Only accessible to org admins. Org selector determines where imported data goes.
- **Read-only indicators**: Viewers see a lock icon or "View Only" badge. Edit/import buttons are hidden.

---

## 10. Optimistic Locking (Concurrency)

Concurrent editing within an organization is expected to be rare, so optimistic locking is sufficient.

### How It Works

1. Client loads a region → receives `version: 5`.
2. Client makes edits, sends a save request including `version: 5`.
3. Server checks: if the current DB version is still `5`, the save succeeds → version becomes `6`.
4. If another admin saved first (version is now `6`), the request fails with a conflict error.
5. Client shows: *"This region was modified by another user. Reload to see their changes?"*

### Scope

Optimistic locking applies at the **region level** for all write operations:

- Importing aquifers, wells, or measurements
- Editing individual measurements (DataEditor)
- Creating or deleting spatial analyses
- Changing region settings (name, visibility, data types)

---

## 11. Vercel API Routes

The current Vite dev server middleware (`vite.config.ts` plugin) is replaced with Vercel serverless functions in the `api/` directory.

```
api/
  ├── auth/
  │   └── callback.ts              # Supabase auth callback handler
  │
  ├── regions/
  │   ├── index.ts                 # GET: list regions; POST: create region
  │   └── [id].ts                  # GET: single region; PUT: update; DELETE: delete
  │
  ├── regions/[id]/
  │   ├── aquifers.ts              # GET: list; POST: save aquifers
  │   ├── wells.ts                 # GET: list; POST: save wells
  │   ├── measurements.ts          # GET: list by data type; POST: save measurements
  │   ├── data-types.ts            # GET: list; POST: add; DELETE: remove
  │   └── spatial/
  │       ├── index.ts             # GET: list spatial analyses; POST: save (metadata → Postgres, result → Storage)
  │       └── [analysisId].ts      # GET: fetch result from Storage; PUT: rename; DELETE: remove metadata + Storage file
  │
  ├── orgs/
  │   ├── index.ts                 # GET: my orgs; POST: create org
  │   ├── [id].ts                  # GET: org details; PUT: update; DELETE: delete
  │   └── [id]/
  │       └── members.ts           # GET: list; POST: invite; DELETE: remove
  │
  └── samples/
      ├── index.ts                 # GET: list sample templates
      └── [id]/
          └── import.ts            # POST: copy sample into user's org
```

Each route:
1. Extracts the Supabase JWT from the `Authorization` header.
2. Creates a Supabase server client scoped to that user.
3. Performs the database operation with RLS automatically enforced.
4. Returns JSON responses.

---

## 12. Sample Regions

Sample regions allow new users to explore the app immediately without uploading their own data.

### How It Works

- Sample region templates are stored in **Supabase Storage** as zip bundles (same format as the current region folder structure: `region.json`, `region.geojson`, `aquifers.geojson`, `wells.csv`, `data_*.csv`).
- A `sample_region_templates` table stores metadata: name, description, thumbnail URL.
- The app shows a **"Sample Data"** section accessible without login. Users can browse and explore these regions in read-only mode.
- Logged-in users get an **"Import Sample Region"** button that copies a template into their org as a real, editable region.
- In **local mode**, sample regions are downloadable as zip files that the user can then upload.

### Initial Migration

The 9 existing regions in `public/data/` become the initial set of sample region templates:
- dominican-republic
- great-salt-lake-basin
- guam
- jamaica
- jordan
- niger
- oregon
- utah
- volta-basin

### Management

A GEOGLOWS super-admin (identified by a flag on their user profile or membership in a special "geoglows" organization) can:
- Upload new sample region templates
- Edit template metadata (name, description, thumbnail)
- Remove sample templates

---

## 13. Implementation Phases

Phases are reordered so that the data abstraction layer and local/air-gapped mode can be built first (Phases 1–2), independently of Supabase, authentication, and deployment work (Phases 3–7). This allows parallel workstreams: one team builds local mode while another team sets up cloud infrastructure.

### Phase 1 — Data Abstraction Layer + ViteDataProvider

*No user-visible changes. Purely architectural preparation. The app works exactly as before, but all data I/O goes through the provider interface.*

#### 1a. Define the DataProvider interface

- Create `services/dataProvider.ts` with the `DataProvider` interface (Section 8).
- Define input types where needed: `RegionInput`, `AquiferInput`, `WellInput`, `MeasurementInput`, `ImportResult`.
- Keep the interface org-free — no `orgId` parameters. Cloud provider handles org scoping internally later.

#### 1b. Implement ViteDataProvider

Implement `services/viteDataProvider.ts` — wraps all current Vite middleware calls and `/data/*` file reads behind the interface. This is a mechanical translation: each interface method maps to the existing `fetch()` / `freshFetch()` / `saveFiles()` / `deleteFile()` calls that currently live scattered across components.

**Reads (wrapping current fetch/freshFetch calls):**

| Method | Current location | What it wraps |
|---|---|---|
| `listRegions()` | `dataLoader.ts:179`, `ImportDataHub.tsx:28` | `GET /api/regions` |
| `getRegion(id)` | `dataLoader.ts:393` | Load `region.json` + `region.geojson`, compute bounds |
| `getAquifers(regionId)` | `dataLoader.ts:203` | Load `aquifers.geojson`, group by `aquifer_id` |
| `getWells(regionId)` | `dataLoader.ts:294` | Parse `wells.csv` |
| `getMeasurements(regionId, dataType)` | `dataLoader.ts:336` | Parse `data_{code}.csv` |
| `getRegionBoundary(regionId)` | `dataLoader.ts:393` | Load `region.geojson` |
| `getAquiferBoundaries(regionId)` | Multiple places | Load raw `aquifers.geojson` |
| `getDataTypes(regionId)` | Via `listRegions()` | Extract from `region.json` metadata |
| `listSpatialAnalyses(regionId)` | `dataLoader.ts:426` | `GET /api/list-rasters?region={id}` |
| `getSpatialAnalysis(regionId, path)` | `App.tsx:469` | Load raster JSON from `/data/{path}` |
| `listModels(regionId)` | `dataLoader.ts:437` | `GET /api/list-models?region={id}` |
| `getModel(regionId, path)` | `App.tsx:577` | Load model JSON from `/data/{path}` |

**Writes (wrapping current saveFiles/deleteFile/fetch POST calls):**

| Method | Current location | What it wraps |
|---|---|---|
| `saveRegion(input)` | `RegionImporter.tsx:96,182` | Save `region.json` + `region.geojson` via `POST /api/save-data` |
| `updateRegion(id, updates)` | `App.tsx:810`, `RegionEditor.tsx:98` | Load `region.json`, update fields, save back |
| `deleteRegion(id)` | `App.tsx:833`, `RegionEditor.tsx:61` | `POST /api/delete-folder` |
| `saveAquifers(regionId, ...)` | `AquiferImporter.tsx:80,100` | Save `aquifers.geojson` |
| `renameAquifer(...)` | `App.tsx:880` | Rebuild + save `aquifers.geojson` |
| `deleteAquifer(...)` | `App.tsx:903`, `AquiferEditor.tsx` | Rebuild `aquifers.geojson`, `wells.csv`, all `data_*.csv` |
| `saveWells(regionId, ...)` | `WellImporter.tsx:483–520` | Save `wells.csv` |
| `saveMeasurements(...)` | `MeasurementImporter.tsx:358,401` | Save `data_{code}.csv` |
| `updateMeasurement(...)` | `DataEditor.tsx` | Edit single row in `data_{code}.csv` |
| `deleteMeasurement(...)` | `DataEditor.tsx` | Remove single row from `data_{code}.csv` |
| `saveSpatialAnalysis(...)` | `rasterAnalysis.ts:418` | `POST /api/save-data` with raster JSON |
| `deleteSpatialAnalysis(...)` | `App.tsx:525` | `POST /api/delete-file` |
| `renameSpatialAnalysis(...)` | `App.tsx:543` | `POST /api/rename-raster` |
| `deleteModel(...)` | `App.tsx:601` | `POST /api/delete-file` |
| `renameModel(...)` | `App.tsx:618` | `POST /api/rename-model` |
| `saveDataType(...)` | `DataTypeEditor.tsx:83` | Update `region.json` dataTypes array |
| `deleteDataType(...)` | `DataTypeEditor.tsx:120` | Delete `data_{code}.csv` + update `region.json` |
| `exportRegion(id)` | `Sidebar.tsx` (download) | Fetch all region files, zip via JSZip |
| `exportDatabase()` | `ImportDataHub.tsx:125` | Fetch all regions, zip via JSZip |
| `importRegionFromZip(file)` | `RegionImporter.tsx` (import mode) | Parse zip, save files |
| `importDatabaseFromZip(...)` | `ImportDataHub.tsx:175` | Parse zip, save/replace regions |

#### 1c. Create React context and hook

- Create `services/DataProviderContext.tsx`:
  - `DataProviderContext` — React context holding the active provider
  - `useDataProvider()` — hook that returns the context value
  - `DataProviderWrapper` — component that creates the `ViteDataProvider` and wraps children
- Wrap the app root in `DataProviderWrapper`.
- Initially, mode is always `'vite'`. Mode switching comes in Phase 2.

#### 1d. Refactor components (incremental, one group at a time)

Refactor all components to call `useDataProvider()` instead of direct fetch/API calls. Do this incrementally — one functional area at a time, testing after each:

**Group 1 — Data loading** (highest impact, touches `App.tsx` and `dataLoader.ts`):
- Replace `loadAllData()` in `App.tsx` with provider calls
- `loadRegionManifest()` → `provider.listRegions()`
- Region/aquifer/well/measurement loading → respective `get*()` methods
- Raster and model listing → `provider.listSpatialAnalyses()`, `provider.listModels()`

**Group 2 — Region management** (`Sidebar.tsx`, `App.tsx`, `RegionEditor.tsx`):
- Region rename → `provider.updateRegion()`
- Region delete → `provider.deleteRegion()`
- Region editor save/delete → same methods

**Group 3 — Aquifer management** (`App.tsx`, `AquiferEditor.tsx`):
- Aquifer rename → `provider.renameAquifer()`
- Aquifer delete → `provider.deleteAquifer()`
- Aquifer editor save/delete → same methods

**Group 4 — Import wizards** (`ImportDataHub.tsx`, `RegionImporter.tsx`, `AquiferImporter.tsx`, `WellImporter.tsx`, `MeasurementImporter.tsx`, `DataTypeEditor.tsx`):
- Region import → `provider.saveRegion()` / `provider.importRegionFromZip()`
- Aquifer import → `provider.saveAquifers()`
- Well import → `provider.saveWells()`
- Measurement import → `provider.saveMeasurements()`
- Data type add/delete → `provider.saveDataType()` / `provider.deleteDataType()`
- Database export/import → `provider.exportDatabase()` / `provider.importDatabaseFromZip()`

**Group 5 — Spatial analyses and models** (`App.tsx`, `rasterAnalysis.ts`):
- Raster load/save/delete/rename → `provider.get/save/delete/renameSpatialAnalysis()`
- Model load/delete/rename → `provider.get/delete/renameModel()`

**Group 6 — Data editor** (`DataEditor.tsx`):
- Measurement edit/delete → `provider.updateMeasurement()` / `provider.deleteMeasurement()`

#### 1e. Clean up dead code

- Remove direct `fetch()`, `freshFetch()`, `saveFiles()`, `deleteFile()` calls from components (they should only exist inside `ViteDataProvider` now).
- `services/importUtils.ts` — keep CSV parsing, date detection, column mapping, and spatial utilities. Move `saveFiles()`, `deleteFile()`, `freshFetch()` to `ViteDataProvider` internals (or keep them as private helpers imported only by `ViteDataProvider`).
- `services/dataLoader.ts` — most of `loadAllData()` logic moves into `ViteDataProvider`. The file may be eliminated or reduced to helper functions.

#### Validation

- All existing functionality must work identically after this phase.
- Run `npx tsc --noEmit` — no type errors.
- Manual test: import region, add aquifers/wells/measurements, create spatial analysis, edit data, delete data, export database.
- Grep the codebase: no component should contain direct `fetch('/api/` or `fetch('/data/` calls except inside `ViteDataProvider`.

---

### Phase 2 — IndexedDB Data Provider + Local Mode

*First user-visible change: a "Use Locally" option that runs the full app with zero network requests.*

#### 2a. IndexedDB data provider

- Implement `services/indexedDBDataProvider.ts` conforming to the same `DataProvider` interface.
- Create IndexedDB database `aquiferx` with object stores:
  - `regions` — keyed by `id`, stores `RegionMeta` + boundary GeoJSON
  - `aquifers` — keyed by `[regionId, aquiferId]`, stores boundary GeoJSON per aquifer
  - `wells` — keyed by `[regionId, wellId]`, stores well data
  - `measurements` — keyed by `[regionId, wellId, dataType, date]`, stores values
  - `spatialAnalyses` — keyed by path, stores full raster JSON (as blobs for large results)
  - `models` — keyed by path, stores full model JSON
- All operations are async (IndexedDB is async by nature), matching the `Promise`-based interface.
- Use the `idb` library (lightweight IndexedDB wrapper with proper TypeScript types) or raw IndexedDB API.

#### 2b. Zip upload flow

- Build a **mode selector** UI (landing page or modal) with "Use Locally" entry point.
- User selects a zip file → parse in-browser via JSZip (already a dependency).
- Discover regions in the zip (find `region.json` files), same logic as current `importDatabaseFromZip`.
- Populate IndexedDB object stores from the parsed zip data.
- Switch the `DataProviderContext` to `IndexedDBDataProvider`.
- App loads and renders from IndexedDB — full visualization, analysis, import features work.

#### 2c. Zip export flow

- `exportDatabase()` on the IndexedDB provider reads all object stores and builds a zip in the same format as the current file layout.
- User downloads the zip — can re-upload it later or share with others.

#### 2d. Session management

- `beforeunload` listener warns user if IndexedDB has data and they haven't exported.
- "Clear Data" action in the UI that wipes IndexedDB stores and returns to mode selection.
- Optionally persist data across sessions (IndexedDB survives tab close by default) — let user choose "Keep data in browser" vs. "Clear on close".

#### 2e. Validation

- Verify zero network requests in local mode (browser DevTools network tab).
- Full test: upload zip → browse regions → view map → view charts → run spatial analysis → export zip → re-import → verify data integrity.
- Test with the existing sample datasets (Jamaica, Utah, etc.) exported as zip.

---

### Phase 3 — Supabase Setup & Database Schema

*Infrastructure only. No app changes. Shared across all three GEOGLOWS apps. Can be done in parallel with Phases 1–2 by the cloud infrastructure team.*

- Create a single Supabase project for all GEOGLOWS apps.
- Apply shared schema: `profiles`, `organizations`, `org_memberships` tables in `public`.
- Create `aquifer` schema and apply all Aquifer Analyst tables (Section 6).
- Create placeholder `hydroviewer` and `grace` schemas (other teams populate later).
- Write and test RLS policies (Section 7) for both shared and `aquifer` tables.
- Set up Supabase Storage bucket for GeoJSON and zip files.
- Configure auth providers (email/password, Google; optionally ORCID for academic users).
- Configure Supabase Auth redirect URLs for all three app domains.
- Package the existing regions as sample region templates and upload to Supabase Storage.

### Phase 4 — Authentication & User Management

*First cloud-visible change. Build as the shared `@geoglows/auth` package (Section 1) so all three apps can use it.*

- Create the `@geoglows/auth` package with shared auth components.
- Implement `SupabaseProvider` and `AuthProvider` React contexts.
- Build login / signup pages (email + social provider buttons).
- Build the **landing page** with three entry points: Sign In, Use Locally, Explore Samples.
- Add auth state to React context (current user, current org, org list).
- Build organization creation UI.
- Build member invitation and role management UI.
- Build `UserMenu` and `OrgSelector` components.
- Integrate the package into Aquifer Analyst: update the header with user menu and org selector.
- Gate the Import Data hub behind admin role check.
- Provide integration guide for Hydroviewer and GRACE teams to add auth to their apps.

### Phase 5 — Cloud Data Provider (SupabaseDataProvider)

*The big migration — cloud read/write. Plugs into the same DataProvider interface built in Phase 1.*

- Implement `SupabaseDataProvider` with all CRUD operations against Postgres.
- Org scoping: provider reads active org from `AuthContext` and filters all queries by `org_id`.
- Implement optimistic locking on all save operations (region `version` column).
- Spatial analysis results stored in Supabase Storage bucket; metadata in `aquifer.spatial_analyses`.
- Handle large measurement datasets (pagination or streaming for regions with 100K+ rows).
- Test the full import → visualize → analyze flow end-to-end.

### Phase 6 — Vercel Deployment

*Go live. Each app is a separate Vercel project.*

- Create Vercel project for Aquifer Analyst linked to its GitHub repo.
- Implement serverless API routes in `api/` (Section 11) for any operations that require server-side logic.
- Configure environment variables in Vercel dashboard (shared Supabase URL, anon key, service role key).
- Set up preview deployments for pull requests.
- DNS configuration: `aquifer.apps.geoglows.org` (or similar subdomain scheme).
- Remove the Vite dev server middleware plugin (no longer needed in production).
- Verify the full flow in the deployed environment.
- Coordinate with Hydroviewer and GRACE teams on their Vercel deployments.

### Phase 7 — Public Access, Sharing & Sample Regions

*Polish and complete the access model.*

- Add region **visibility toggle** in region settings (admin only): private ↔ public.
- Implement **public URL scheme**: `/public/{org-slug}/{region-slug}` — accessible without login.
- Wire up unauthenticated read path through the Supabase provider (anon key + RLS policies for public regions).
- Build the **sample regions gallery** UI: grid of cards with thumbnails, names, descriptions.
- Implement "Import Sample Region" flow: copy template data into the user's selected org.
- Build the **admin interface** for managing sample templates (upload zip, edit metadata, delete).

---

## 14. What Changes and What Doesn't

### Unchanged

These components and systems remain as they are today:

- **Visualization**: MapView, TimeSeriesChart, StorageOverlay, CrossSectionChart, DataEditor
- **Import wizard UI/UX**: ImportDataHub, RegionImporter, AquiferImporter, WellImporter, MeasurementImporter, DataTypeEditor, ColumnMapperModal, ConfirmDialog
- **Data formats**: CSV, GeoJSON, region.json — still used for import, export, local mode, and sample region bundles
- **Client-side computation**: Kriging, storage analysis, PCHIP interpolation, trend analysis, CRS reprojection
- **Services**: usgsApi.ts, kriging.ts, storageAnalysis.ts, reprojection.ts

### Changed

- **Data access**: All components read/write through the `DataProvider` interface instead of direct API calls.
- **App entry point**: New landing page with mode selection (Sign In / Use Locally / Explore Samples).
- **Header**: User avatar, org selector, login/logout controls.
- **Sidebar**: Regions grouped by org. Permission-aware (edit controls hidden for viewers).
- **Import hub**: Org-scoped — data imports go into the selected org's region. Accessible only to org admins.
- **Data loading**: `loadAllData()` replaced by provider calls. No more full-reload refresh — incremental updates where possible.
- **Hosting**: Vite dev server middleware → Vercel serverless functions for production. Vite middleware retained for local development.
- **Shared infrastructure**: Auth, profiles, and organizations managed by the `@geoglows/auth` package, shared across Aquifer Analyst, Hydroviewer RFS, and GRACE Analyst. One user account works in all three apps.
