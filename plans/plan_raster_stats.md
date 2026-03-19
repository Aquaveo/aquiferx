# Raster Statistics

When we do spatial analysis, we first do a temporal interpolation at each well and then we sample the resulting well time series at selected intervals and then do spatial interpolation to get a time varying raster which we store in a json file. When animating a raster, one of the interesting things to know would be how the data values vary over time. This plan is to compute some statistics of the raster data and store them in the json file as well.

This is especially useful for **water quality data** (salinity, chloride, etc.) where there is currently no time series visualization of the raster. For WTE rasters we already have the storage change chart, but raster statistics apply to any data type.

## Statistics to Compute

The statistics are computed from the **temporally-interpolated well values** (not the spatially-interpolated grid cell values) at each time step. Grid cell stats would be dominated by the interpolation method (kriging/IDW) and wouldn't reflect actual observation trends. Well-level stats reflect the real data.

For each frame/time step, compute across all active wells:

1. Count (number of active wells)
2. Minimum value
3. Maximum value
4. Mean value
5. Standard deviation
6. Median value
7. 25th percentile
8. 75th percentile

The count gives context — a mean from 5 wells vs 200 wells tells a very different story.

## Storage Format

Add a `stats` array to the raster JSON alongside the existing `frames` array. This is backwards-compatible — existing raster files without `stats` still load and work fine.

```json
{
  "frames": [...],
  "stats": [
    { "date": "2020-01-01", "count": 42, "min": 45.2, "max": 120.5, "mean": 82.3, "std": 18.1, "median": 80.0, "p25": 68.5, "p75": 95.2 },
    { "date": "2020-04-01", "count": 40, "min": 44.8, "max": 121.0, "mean": 81.9, "std": 17.8, "median": 79.5, "p25": 67.9, "p75": 94.8 },
    ...
  ]
}
```

### Computing the Statistics

The stats are computed during raster generation in `rasterAnalysis.ts`. At frame generation time, the `wellInterp` map already contains all temporally-interpolated well values at each interval date. For each frame:

1. Collect all non-null values from `wellInterp[wellId].values[frameIdx]` across all qualified wells.
2. Sort the values.
3. Compute min, max, mean, std, median, p25, p75, and count.
4. Store in the `stats` array at the corresponding frame index.

No additional data loading or computation is required beyond basic statistics on the already-available well values.

### Legacy Raster Files

Existing raster files generated before this feature will not have a `stats` property. For these files, the statistics tab simply does not appear. Users can regenerate the raster to get stats.

## Chart UI Changes

### Tab-Based Chart Selector

Replace the current dropdown selector with **narrow tabs at the top of the time series chart panel**. Tabs appear/disappear based on available data:

| Tab | Visible when |
|---|---|
| **Water Level** | Well(s) selected |
| **Storage Change** | WTE raster active |
| **Raster Statistics** | Any raster active with `stats` property |
| **Cross Section** | Cross-section profile drawn |

When only one tab is available, the tab bar is hidden. This is more compact than the current dropdown and scales better as more chart types are added.

### Statistics Chart

**Default view**: Mean line with a shaded band representing ± one standard deviation.

**Settings popover** (accessible via a small gear/settings icon): checkboxes to toggle additional overlays:

- [x] Mean ± Std Dev (shaded band)
- [ ] Median
- [ ] P25–P75 (shaded band)
- [ ] Min–Max (shaded band)

Each band uses a different color/opacity to distinguish layers. The chart Y-axis label should reflect the data type and unit (e.g., "Water Table Elevation (ft)", "Salinity (ppm)").

## Implementation Steps

1. **Add stats computation to `rasterAnalysis.ts`** — After temporal interpolation, before spatial interpolation, compute per-frame statistics from `wellInterp` values. Add `stats` array to the saved JSON.

2. **Update `RasterAnalysisResult` type** — Add optional `stats?: RasterFrameStats[]` to the type definition. Define `RasterFrameStats` interface with all stat fields.

3. **Replace dropdown with tab selector** — Refactor the chart panel in `App.tsx` to use narrow tabs instead of the current dropdown. Tabs are context-dependent based on selected wells, active rasters, and cross-section state.

4. **Build the statistics chart component** — Recharts `AreaChart` with mean line and shaded bands. Settings popover for toggling statistical overlays.

5. **Wire up the statistics tab** — Show the tab when a raster with `stats` is active. Load stats from the raster result and pass to the chart component.
