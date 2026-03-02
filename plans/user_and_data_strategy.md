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

### Interface

```typescript
interface DataProvider {
  // Regions
  listRegions(): Promise<RegionMeta[]>;
  getRegion(id: string): Promise<Region>;
  saveRegion(region: RegionInput): Promise<Region>;
  deleteRegion(id: string): Promise<void>;

  // Aquifers
  getAquifers(regionId: string): Promise<Aquifer[]>;
  saveAquifers(regionId: string, aquifers: AquiferInput[], mode: 'append' | 'replace'): Promise<void>;

  // Wells
  getWells(regionId: string): Promise<Well[]>;
  saveWells(regionId: string, wells: WellInput[], mode: 'append' | 'replace'): Promise<void>;

  // Measurements
  getMeasurements(regionId: string, dataType: string): Promise<Measurement[]>;
  saveMeasurements(regionId: string, dataType: string, data: MeasurementInput[], mode: 'append' | 'replace'): Promise<void>;
  updateMeasurement(id: string, value: number): Promise<void>;
  deleteMeasurement(id: string): Promise<void>;

  // Spatial analyses (raster interpolations)
  listSpatialAnalyses(regionId: string): Promise<RasterAnalysisMeta[]>;
  getSpatialAnalysis(id: string): Promise<RasterAnalysisResult>;       // fetches result data from Storage
  saveSpatialAnalysis(regionId: string, result: RasterAnalysisResult): Promise<void>;  // writes metadata to Postgres + result to Storage
  deleteSpatialAnalysis(id: string): Promise<void>;                    // deletes metadata + Storage file
  renameSpatialAnalysis(id: string, newTitle: string): Promise<void>;

  // GeoJSON boundaries
  getRegionBoundary(regionId: string): Promise<GeoJSON.FeatureCollection>;
  getAquiferBoundaries(regionId: string): Promise<GeoJSON.FeatureCollection>;

  // Data types
  getDataTypes(regionId: string): Promise<DataType[]>;
  saveDataType(regionId: string, dataType: DataType): Promise<void>;
  deleteDataType(regionId: string, code: string): Promise<void>;

  // Version (optimistic locking)
  getRegionVersion(regionId: string): Promise<number>;

  // Sample regions (cloud only, optional)
  listSampleRegions?(): Promise<SampleRegionTemplate[]>;
  importSampleRegion?(templateId: string, targetOrgId: string): Promise<Region>;
}
```

### Implementations

1. **`SupabaseDataProvider`** — Reads and writes to Supabase Postgres via the Supabase JS client SDK. Used when the user is logged in (cloud mode). Spatial analysis results are stored in a Supabase Storage bucket (`spatial-results/`), with metadata in the `aquifer.spatial_analyses` table.

2. **`LocalDataProvider`** — Reads and writes to IndexedDB in the browser. Used in air-gapped/local mode. Data is loaded from the user's uploaded zip file and stored in IndexedDB for the duration of the session. Spatial analysis results are stored as IndexedDB blobs.

### React Integration

```typescript
// Context provides the active data provider
const DataProviderContext = createContext<DataProvider>(null);

// Hook used by all components
function useDataProvider(): DataProvider {
  return useContext(DataProviderContext);
}

// App root selects the provider based on mode
function App() {
  const [mode, setMode] = useState<'cloud' | 'local' | null>(null);
  const provider = mode === 'cloud'
    ? new SupabaseDataProvider(supabaseClient)
    : new LocalDataProvider();

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

### Phase 1 — Data Abstraction Layer

*No user-visible changes. Purely architectural preparation.*

- Define the `DataProvider` interface in TypeScript.
- Implement `LocalDataProvider` backed by the current Vite middleware (flat files on disk).
- Create `DataProviderContext` and `useDataProvider()` hook.
- Refactor all components to use the provider instead of direct `fetch()` / API calls:
  - `App.tsx` (data loading, refresh, raster load/delete/rename)
  - `ImportDataHub.tsx` and all sub-wizards
  - `DataEditor.tsx`
  - `SpatialAnalysisDialog.tsx` (raster analysis save)
  - `Sidebar.tsx` (delete operations)
- All existing functionality must continue to work identically after this phase.

### Phase 2 — Supabase Setup & Database Schema

*Infrastructure only. No app changes yet. This phase is shared across all three GEOGLOWS apps — do it once.*

- Create a single Supabase project for all GEOGLOWS apps.
- Apply shared schema: `profiles`, `organizations`, `org_memberships` tables in `public`.
- Create `aquifer` schema and apply all Aquifer Analyst tables (Section 5).
- Create placeholder `hydroviewer` and `grace` schemas (other teams populate later).
- Write and test RLS policies (Section 6) for both shared and `aquifer` tables.
- Set up Supabase Storage bucket for GeoJSON and zip files.
- Configure auth providers (email/password, Google; optionally ORCID for academic users).
- Configure Supabase Auth redirect URLs for all three app domains.
- Package the 9 existing regions as sample region templates and upload to Supabase Storage.

### Phase 3 — Authentication & User Management

*First user-visible change. Build as the shared `@geoglows/auth` package (Section 1) so all three apps can use it.*

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

### Phase 4 — Cloud Data Provider

*The big migration — cloud read/write.*

- Implement `SupabaseDataProvider` with all CRUD operations against Postgres.
- Wire up the import system (ImportDataHub, all sub-wizards) to use the provider.
- Implement optimistic locking on all save operations.
- Adapt DataEditor for cloud save (individual measurement edit/delete).
- Adapt SpatialAnalysisDialog for cloud save (metadata → Postgres, result JSON → Supabase Storage bucket).
- Wire up spatial analysis list/load/delete/rename through the provider.
- Handle large measurement datasets (pagination or streaming for regions with 100K+ rows).
- Test the full import → visualize → analyze flow end-to-end.

### Phase 5 — Vercel Deployment

*Go live. Each app is a separate Vercel project.*

- Create Vercel project for Aquifer Analyst linked to its GitHub repo.
- Implement serverless API routes in `api/` (Section 10) for any operations that require server-side logic.
- Configure environment variables in Vercel dashboard (shared Supabase URL, anon key, service role key — same values across all three apps).
- Set up preview deployments for pull requests.
- DNS configuration: `aquifer.apps.geoglows.org` (or similar subdomain scheme).
- Remove the Vite dev server middleware plugin (no longer needed in production).
- Verify the full flow in the deployed environment.
- Coordinate with Hydroviewer and GRACE teams on their Vercel deployments (same Supabase env vars, their own subdomains).

### Phase 6 — Local / Air-Gapped Mode

*Complete the second data path.*

- Implement `IndexedDBDataProvider` (reads/writes to browser IndexedDB).
- Build the **zip upload flow**: user selects a zip → parsed in-browser → stored in IndexedDB.
- Build the **zip export flow**: serialize IndexedDB contents back to the standard zip format.
- Ensure all visualization and analysis features work in local mode (MapView, charts, storage analysis, cross-sections).
- Ensure **zero network requests** in local mode (verify with browser network tab).
- Session management: warn user before closing the tab if they have unsaved data. Provide a "Clear Data" action.

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
