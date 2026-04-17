# Spatial Analysis

Spatial analysis turns the scattered point measurements at your wells into continuous raster surfaces that cover an entire aquifer and evolve over time. The primary output is an animated sequence of raster frames — one frame per time step you've chosen (quarterly, semi-annual, or annual) — that shows how the parameter's surface has changed across the aquifer. From that output, several derived analyses are available: cumulative storage volume change, cross-section profiles along arbitrary lines, per-frame summary statistics, and a record of which wells contributed data at each time step.

This page covers the shared workflow for launching a spatial analysis. The [Interpolation Methods](interpolation.md) page describes the kriging and IDW methods in detail; the [Raster Visualization](raster.md) page covers the animation controls and display options for the resulting surfaces; and [Storage Analysis](storage.md), [Cross Section](cross-section.md), and [Active Wells](active-wells.md) cover the derived analyses.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Animated raster overlay on the map with color ramp and date slider visible</div>

## Launching the Wizard

The **Spatial Analysis** button in the toolbar opens a three-step wizard. The first step collects the temporal parameters — date range, output frame interval, how measurements are interpolated in time. The second step picks the spatial method (kriging or IDW) and its parameters. The third step names the analysis and runs it.

The analysis is scoped to the currently selected aquifer, so select the aquifer first (either from the sidebar or by clicking its polygon on the map). The wizard uses the aquifer's boundary polygon as the clipping region for the output raster, so the computed surface is defined only where the aquifer is defined.

## Step 1: Temporal Options

The temporal step controls two things: what time period the analysis covers, and how each well's measurements are sampled to produce an input value at each output frame.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Wizard step 1 showing the date range, interval selector, and PCHIP preview</div>

The **Start Date** and **End Date** bracket the analysis. A data-density chart below the date controls shows the number of qualifying wells in each six-month bin across the chosen range, which helps you pick a window where the aquifer actually has measurement coverage. Dates can be nudged by a year at a time using the ±1-year buttons next to each field.

The **Interval** controls how frequently raster frames are produced. Quarterly (3 months), semi-annual (6 months), and annual (1 year) are the available choices. Shorter intervals produce more frames and finer-grained animations at the cost of longer computation; annual is a good starting point for most regional analyses, with shorter intervals reserved for specific questions about seasonal behavior.

The **Resolution** parameter sets the number of grid columns in the output raster. The number of rows is determined automatically from the aquifer's aspect ratio. Valid values range from 10 to 500 columns; 50–100 is a typical sweet spot for interactive work, higher for publication-quality figures where you plan to render once and view many times.

### Well qualification

Two thresholds decide which wells contribute data to the analysis. **Min Observations / Well** excludes wells with fewer than the specified number of measurements — the default of 5 requires a well to have at least five readings in total, which is a practical minimum for any temporal interpolation to produce something useful. **Min Time Span / Well** excludes wells whose first-to-last-measurement span is shorter than the specified number of years, which keeps wells with a dense cluster of measurements over a short window from being extrapolated across a much longer analysis window.

A live count of qualifying wells updates as you adjust the thresholds, alongside a PCHIP preview canvas at the bottom of the step that shows each qualifying well's measurement coverage across the analysis window. The preview is a quick visual check that the thresholds haven't excluded too many wells.

### Temporal method

Each frame of the output raster needs a single value per qualifying well at the frame's date. The **Temporal Method** controls how that value is derived from the well's actual measurements:

**PCHIP** interpolation produces a smooth, monotonicity-preserving curve through the well's measurements and samples it at each frame date. This is the default and works well for most cases — it follows the data closely without overshoot.

**Linear** interpolation connects consecutive measurements with straight lines. This is sometimes preferable when the data are noisy and PCHIP's smoothing obscures a point-to-point pattern you want to preserve.

**Moving Average** applies a Nadaraya-Watson Gaussian kernel smoothing with a configurable window (1–60 months) before sampling at frame dates. This dampens short-term fluctuations that would otherwise appear as frame-to-frame flickering in the output animation.

**Model** uses an existing imputation model's output instead of interpolating directly from raw measurements. This is useful when the aquifer has sparse or gappy data that a pure interpolation handles badly — the imputation model has already blended measurements with climate-driven predictions to produce a continuous series at every qualifying well. Selecting Model opens a dropdown listing the available imputation models for the current aquifer, along with sub-options to use the model's combined output or its smoothed variant.

## Step 2: Spatial Options

Step 2 picks the interpolation method used to turn the per-well values from step 1 into a raster surface at each frame. Two methods are available: **Kriging**, a geostatistical approach that models spatial covariance with a variogram and produces optimal unbiased predictions; and **IDW**, a simpler distance-weighted average that's faster and more forgiving of unusual data layouts. Each method has its own parameter set, described in detail on the [Interpolation Methods](interpolation.md) page.

Both methods share a small set of post-processing options at the bottom of the step:

**Truncation** clamps output values to a physical range. Truncate Low caps values below a threshold (default 0, useful for parameters that can't physically be negative) and Truncate High caps values above a threshold (default is the maximum observed value across the dataset). Both are off by default; turning them on is useful when an interpolation produces obviously non-physical extremes in data-sparse areas.

**Log interpolation** does the interpolation in log-transformed space. This is useful for parameters that span several orders of magnitude and have lognormal-ish distributions — nitrate concentrations, conductivity values, and the like. The option is disabled automatically when the dataset contains non-positive values, since the logarithm isn't defined there.

## Step 3: Title and Run

The final step takes a title for the analysis and shows a summary of every parameter chosen in the previous two steps. The title becomes the analysis's display name in the sidebar and is incorporated into the stored filename. Clicking **Run** executes the analysis; a progress indicator tracks the computation, which typically takes from a few seconds to a few minutes depending on the number of frames, resolution, and number of qualifying wells.

Once the run completes, the analysis appears in the sidebar under the aquifer. Clicking it loads the raster overlay on the map and enables all the derived analyses — the animation controls, the cross-section tool, the storage analysis, and the rest.
