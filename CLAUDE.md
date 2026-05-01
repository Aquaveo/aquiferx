# Aquifer Analyst

## Project Overview
- React 19 + TypeScript 5.8 + Vite 6 groundwater data visualization app
- Data stored in `public/data/{region-folder}/` with per-folder `region.json`
- Vite dev server middleware provides API endpoints in `vite.config.ts` (no separate backend)
- Tailwind CSS for styling, Recharts for charts, Leaflet for maps

## Architecture
- **Hub-and-spoke data management**: `components/import/ImportDataHub.tsx` is the entry point, launching sub-wizards for Region, Aquifer, Well, and Measurement imports
- **Data type model**: `public/data/catalog_wq.json` is the global vocabulary of standard water quality parameters. Every region implicitly has every catalog entry — a catalog type "exists" in a region only when its `data_{code}.csv` is present on disk. Region-specific non-catalog parameters (BOD5, trichloroethane, etc.) live in `region.json` as `customDataTypes`. `effectiveDataTypes` (WTE + catalog-with-data + custom-with-data) is computed at load time via `services/catalog.ts#computeEffectiveDataTypes`.
- **Measurements**: use `value` field + `dataType` code. Per-file: `data_{code}.csv` naming (e.g. `data_wte.csv`, `data_nitrate.csv`)
- **Per-folder metadata**: Each region folder has `region.json` with id, name, lengthUnit, singleUnit, customDataTypes
- **CRS reprojection**: proj4 library in `services/reprojection.ts`, auto-detects from GeoJSON `crs` property or shapefile `.prj`
- **USGS API**: `services/usgsApi.ts` for downloading wells and measurements from USGS Water Data API
- **Smart well discovery**: `services/wellMatching.ts` provides ID → name → proximity matching for CSV imports, plus per-column catalog-aware data type detection and `aqx-` ID generation for new wells. `services/gseLookup.ts` batches USGS 3DEP / Open-Meteo elevation fetches.

## Key Files
- `App.tsx` — main component, state management, data type selector
- `types.ts` — DataType, RegionMeta (customDataTypes), Region (effectiveDataTypes), CatalogParameter, ParameterCatalog, Measurement, ChartPoint interfaces
- `services/dataLoader.ts` — loads regions via `/api/regions`, computes effectiveDataTypes, loads measurements from each `data_{code}.csv`
- `services/catalog.ts` — `loadCatalog()`, `computeEffectiveDataTypes()`, `groupCatalog()`
- `services/wellMatching.ts` — matchWells (ID/name/proximity), generateAqxId, suggestDataTypesFromColumns
- `services/gseLookup.ts` — batched elevation lookup (USGS 3DEP / Open-Meteo)
- `services/importUtils.ts` — CSV parsing, file processing, point-in-polygon, save/delete API wrappers
- `services/reprojection.ts` — proj4 coordinate reprojection
- `services/usgsApi.ts` — USGS Water Data API integration
- `components/CatalogBrowser.tsx` — read-only catalog viewer, opened from DataTypeEditor and MeasurementImporter
- `components/import/` — ImportDataHub, RegionImporter, AquiferImporter, WellImporter, MeasurementImporter, DataTypeEditor, ColumnMapperModal, ConfirmDialog
- `public/data/catalog_wq.json` — global water quality parameter catalog (~38 entries with WQP mapping + MCL/WHO)
- `vite.config.ts` — API middleware endpoints (regions, save-data, delete-file, delete-folder). `/api/regions` scans each region folder and returns a `dataFiles: string[]` list alongside the meta.

## Conventions
- Data type codes: lowercase alphanumeric + underscore, max 20 chars; "wte" is the reserved default (water table elevation)
- **Catalog is authoritative**: standard WQ parameters (nitrate, arsenic, pH, etc.) live in `catalog_wq.json` and cannot be overridden per-region. If a region needs a different unit or name for a parameter, make a custom type with a non-catalog code (e.g. `hardness_caco3`) — not a rename of the catalog entry
- **No pre-staging empty types**: a data type exists in a region exactly when its `data_{code}.csv` exists on disk. There is no way to "declare a type in advance" — importing data is the only action that creates one. DataTypeEditor only manages non-catalog customs; even those must have a data file to appear in the header dropdown
- **Custom codes must not collide with catalog codes**: DataTypeEditor and the importer's detection panel both enforce this
- Single-unit regions: aquifer section dimmed in UI, all data auto-assigned `aquifer_id=0`
- CSV delimiter auto-detection (comma vs tab)
- Date format auto-detection (ISO, US, EU variants)
- Measurement values stored in `value` column (not `wte`)
- Region data lives in `public/data/{region-id}/` with: `region.json`, `region.geojson`, `aquifers.geojson`, `wells.csv`, `data_{code}.csv`

## Commands
- `npm run dev` — start dev server on port 3000
- `npx tsc --noEmit` — type check
- `npx vite build` — production build

## Environment
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase project URL + publishable key (shared with apps.geoglows / grace / rfs — same project + keys). Required for any environment that signs users in. Set per-environment on Vercel (Production + Preview + Development); setting only Production silently breaks Preview
- `VITE_PORTAL_URL` — optional. GEOGloWS portal URL used for the Profile link target (`${VITE_PORTAL_URL}/#profile`) and the back-to-portal navbar link. Defaults to `https://portal-dev.geoglows.org`. Aquiferx is reached via direct Vercel URL (different origin from the portal proxy), so absolute URLs are required for cross-origin navigation; the env var lets preview branches override the target without a code change. See `.env.example`

## Sign-in modal (1.5.0)

- The lib's `<SupabaseAuthUI>` was rewritten in `@aquaveo/geoglows-auth@1.5.0` to match the vanilla portal modal: Google + GitHub OAuth, sign-up state machine (`signUp` + `signUpSent` views), CSS-class-driven visuals
- `index.tsx` imports `@aquaveo/geoglows-auth/core/sign-in.css` once at module load. Without this import, the modal renders unstyled
- `<SupabaseAuthUI>` props wired in `App.tsx`:
  - `onClose={() => setSignInModalOpen(false)}` — aquiferx's outer `<dialog>` has no rendered close X today; this lets the lib render its own X. The lib does NOT call `dialog.close()` itself — the existing `<dialog>` close-event cleanup (G2 recovery-session clear) still fires via the useEffect that calls `dialog.close()` on state change
  - `oauthRedirectTo={window.location.origin}` — OAuth lands back on aquiferx
  - `emailRedirectTo={`${PORTAL_URL}/#profile`}` — sign-up confirmation lands on the portal where profile-completion lives
- **Cross-tab sign-up flow (documented limitation):** user submits sign-up in aquiferx → `signUpSent` view. User confirms in email tab → lands on portal `#profile`. Cross-app SSO does NOT propagate from the portal tab back to the already-open aquiferx tab (different origins; localStorage is per-origin). User must close-and-reopen aquiferx, or click "Back to sign in" and re-authenticate. The `signUpSent` body copy sets this expectation: "Confirm in the portal, then return here to sign in."
- **OAuth on Vercel preview branches is NOT supported:** Supabase redirect-URL allowlist contains only the production aquiferx origin (`https://aquiferx-bay.vercel.app`). Preview branches generate unique origins per-PR; OAuth clicks from previews fail with `redirect_uri_mismatch` (rendered as the generic OAuth error). Preview-branch testing of auth flows uses email/password + magic-link only. If preview-branch OAuth becomes a need, revisit with a wildcard allowlist or per-branch deploy-hook strategy
