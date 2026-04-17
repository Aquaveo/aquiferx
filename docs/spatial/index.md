# Spatial Analysis

Spatial analysis in Aquifer Analyst transforms point-based well measurements into continuous raster surfaces that cover an entire aquifer. This enables you to visualize spatial patterns, animate changes over time, compute storage volumes, and draw cross-section profiles.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Raster overlay on map showing interpolated water table surface</div>

## Launching the Wizard

Click the **Spatial Analysis** button in the toolbar. The wizard guides you through three steps:

1. **Temporal Options** — Define the time range, interval, and how measurements are interpolated over time.
2. **Spatial Options** — Choose an interpolation method (Kriging or IDW) and configure its parameters.
3. **Title & Run** — Name your analysis and execute.

## Step 1: Temporal Options

The temporal step controls how measurement time series at each well are sampled to produce values for spatial interpolation.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Spatial analysis wizard Step 1 showing temporal options</div>

### Date Range

Set the **Start Date** and **End Date** for the analysis. Use the year navigation buttons (±1 year) for quick adjustments. The wizard shows a data density chart — a histogram of wells per 6-month bin — to help you choose a range with good data coverage.

### Interval

Choose how frequently raster frames are generated:

| Interval | Description |
|----------|-------------|
| 3 months | Quarterly snapshots |
| 6 months | Semi-annual snapshots |
| 1 year | Annual snapshots |

### Resolution

The **Resolution (columns)** parameter sets the number of grid columns in the output raster. Valid range: 10–500. Higher values produce finer grids but take longer to compute. The number of rows is determined automatically by the aquifer's aspect ratio.

### Well Qualification

- **Min Observations / Well** — Minimum number of measurements a well must have to be included (default: 5, range: 2–100).
- **Min Time Span / Well** — Minimum temporal coverage in years (default: 5, range: 0–50). Wells with a measurement span shorter than this are excluded.

The wizard shows a real-time count of qualified wells based on your settings.

### Temporal Method

Choose how well measurements are interpolated across time:

| Method | Description |
|--------|-------------|
| **PCHIP** | Piecewise Cubic Hermite Interpolation — smooth, monotonicity-preserving. Default and recommended. |
| **Linear** | Straight-line interpolation between consecutive measurements. |
| **Moving Average** | Nadaraya-Watson kernel smoothing with a configurable window (1–60 months). |
| **Model** | Use an existing imputation model (ELM) to provide values. Select from the dropdown of available models. |

When "Model" is selected, a dropdown appears listing imputation models for the selected aquifer. Sub-options include using the model's combined output directly or its smoothed (MAvg) output.

### Preview

A PCHIP preview canvas at the bottom of the step visualizes the time series for all qualified wells, helping you verify that the date range and qualification criteria produce reasonable data coverage.

## Step 2: Spatial Options

Configure how point values at wells are interpolated across the aquifer's spatial extent. See [Interpolation Methods](interpolation.md) for detailed descriptions of each method and its parameters.

### Method Selection

- **Kriging** — Geostatistical method based on spatial covariance modeling. Best for data with spatial correlation patterns.
- **IDW (Inverse Distance Weighting)** — Deterministic method that weights nearby points more heavily. Faster and simpler.

### General Options

Both methods share these post-processing options:

| Option | Default | Description |
|--------|---------|-------------|
| Truncate Low | Off | Clamp values below a threshold |
| Truncate Low Value | 0 | Minimum allowed value |
| Truncate High | Off | Clamp values above a threshold |
| Truncate High Value | (max observed) | Maximum allowed value |
| Log Interpolation | Off | Interpolate in log-space (disabled if non-positive values exist) |

## Step 3: Title & Run

1. Enter a **Title** for the analysis. The title is auto-slugified to a filename: `raster_{dataType}_{slug}.json`.
2. Review the summary of all options.
3. Click **Run** to start the computation.

The analysis processes each time step, generating a raster frame at every interval. Progress is displayed as a percentage.

## After the Analysis

Once complete, the raster appears in the sidebar under the selected aquifer. Click it to load the raster overlay on the map. From there you can:

- [Visualize the raster](raster.md) — Playback animation, choose color ramps, toggle contour lines, and view per-frame raster statistics.
- [Analyze storage](storage.md) — View cumulative groundwater storage volume changes.
- [Draw cross sections](cross-section.md) — Sample elevation profiles along any line.
- [View active wells](active-wells.md) — See which wells contributed data at each time step.
