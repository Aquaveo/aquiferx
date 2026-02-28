# Spatial Analysis

Refactor the existing "Storage Analysis" feature into a generic "Spatial Analysis" raster-building tool that works with any data type. Storage change calculation becomes a derived product computed on the fly when viewing WTE rasters.

---

## Phase 1: Generalize Raster Building

### UI Changes

- Rename button from "Analyze Storage" to "Spatial Analysis"
- Rename `StorageAnalysisDialog.tsx` → `SpatialAnalysisDialog.tsx`
- The dialog presents the same options it currently does (PCHIP time series preview, data density histogram, start/end date, resolution, interval, min observations, min time span, smoothing method, title) **except** storage coefficient and volume units — those are removed from this step
- The dialog works with whatever data type is currently active (not just WTE)

### Computation Changes

- The interpolation pipeline stays the same: PCHIP temporal interpolation → optional kernel smoothing → kriging per timestep
- Remove the storage volume calculation step (Step 5 in current `storageAnalysis.ts`)
- The output is a time-varying raster with no `storageSeries` field

### Type Changes

- Remove `storageSeries` from the raster result type (currently `StorageAnalysisResult`)
- Rename to something like `RasterAnalysisResult`
- Remove `storageCoefficient` and `volumeUnit` from `StorageAnalysisParams`
- The `dataType` field in the result should reflect the active data type (not hardcoded to `wte`)

### File Format

- Same JSON structure as today minus the `storageSeries` array
- Naming convention: `raster_{datatype}_{code}.json` in the aquifer subfolder (already the current layout)
- Rasters listed in the left panel UI grouped under the aquifer, displayed and animated like the current overlay

### Migration

- Refactor existing `raster_wte_*.json` files to remove the `storageSeries` field
- Write a one-time migration script (similar to `scripts/migrate-storage-to-rasters.mjs`)

### Renamed Files/Types

| Current | New |
|---------|-----|
| `StorageAnalysisDialog.tsx` | `SpatialAnalysisDialog.tsx` |
| `StorageAnalysisResult` | `RasterAnalysisResult` |
| `StorageAnalysisParams` | `RasterAnalysisParams` |
| `StorageAnalysisMeta` | `RasterAnalysisMeta` |
| `storageAnalysis.ts` | `rasterAnalysis.ts` (or `spatialAnalysis.ts`) |
| `StorageOverlay.tsx` | Could stay or rename to `RasterOverlay.tsx` |

---

## Phase 2: Derived Storage Change (On-the-Fly)

When the user views a **WTE** raster, compute the storage change time series on the fly using the existing volume calculation algorithm.

### UI

- Show a "Storage Coeff." control when viewing a WTE raster (only WTE — not other data types)
- Default value: 0.1
- Control: number input (direct editing) with spin buttons incrementing by 0.05
- Changing the value immediately recalculates and updates the storage time series chart (no button press needed — the calculation is just a multiply across grid cells, so it's fast)

### Computation

- Extract the volume calculation logic from the current `storageAnalysis.ts` Step 5 into a standalone function
- Input: raster frames + grid + storage coefficient + volume unit
- Output: cumulative storage change series
- Called reactively whenever the storage coefficient changes or a WTE raster is loaded
- Volume unit selection: same options as today (acre-ft, ft³, m³, MCM, km³ based on region lengthUnit)

---

## Future Work: Other Derived Products

Once the raster infrastructure is generalized, we could compute other per-timestep summaries from any raster. These are ideas for future consideration:

- **Mean value per timestep** — spatial average of non-null cells per frame, displayed as a trend line
- **Min / Max per timestep** — range across the aquifer, displayed as a shaded band around the mean
- **Spatial standard deviation per timestep** — measures uniformity vs. variability; increasing std dev could indicate localized drawdown
- **Rate of change raster** — derivative between consecutive frames (units/year), highlights where values are changing fastest
- **Anomaly from mean** — subtract the time-averaged raster from each frame to show departures from "normal"
- **Area above/below threshold** — user sets a critical level, system reports what percentage of the aquifer is above/below it per timestep (useful for regulatory thresholds)
