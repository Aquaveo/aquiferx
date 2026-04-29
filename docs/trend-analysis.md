# Trend Analysis

The trend analysis view gives you a region-wide read on whether water levels (or any other parameter) are rising, falling, or holding steady. It does this by fitting a linear regression through each well's measurements, categorizing the resulting slope against a set of thresholds, and re-coloring both the well markers and the aquifer polygons on the map accordingly. Toggled on, the trend view turns the map into a quick visual diagnostic for the study area — the red-and-orange wells mark where drawdown is steepest, the blue wells mark where levels are recovering, and the yellow-dominated aquifers mark areas where conditions are roughly stable.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map in trend mode showing color-coded wells and aquifer polygons with the legend visible</div>

Trend mode toggles on via the **Trend** button in the toolbar. Activating it computes a regression per well, a median-of-slopes aggregate per aquifer, and re-colors the map to match. Activating it again turns it back off and returns the map to its default well-count-based coloring. The trend window — the time interval the regression uses — is configurable via controls next to the Trend button and defaults to the most recent 30 years.

## How the Trends Are Computed

For each well, the application fits a simple least-squares regression of measurement value against time:

\[
y = m \cdot t + b
\]

where `t` is time in years from a fixed origin and `y` is the measurement in the region's length unit. The slope `m` is the average rate of change per year (ft/yr or m/yr, matching the region's unit). The intercept `b` is unused for the map view but is available when the trend line is overlaid on the time series chart.

Only measurements within the trend window contribute to the fit. With a 30-year window and a current year of 2026, the regression uses measurements from 1996 through 2026, even if the well has earlier history. Wells with fewer than two measurements inside the window can't produce a meaningful regression and are categorized as "insufficient data" instead — they show on the map in dark gray so you can see which parts of the aquifer don't have enough recent observations to be classified.

## Trend Categories

Each well's slope is placed into one of five categories — extreme decline, decline, static, increase, or extreme increase — based on thresholds calibrated to the region's length unit. The thresholds are tighter in meters than in feet because 0.5 ft/yr and 0.15 m/yr are roughly comparable rates.

### Well thresholds (feet)

| Category | Color | Slope (ft/yr) |
|----------|-------|---------------|
| Extreme Decline | red | below −2.0 |
| Decline | orange | −2.0 to −0.5 |
| Static | yellow | −0.5 to +0.5 |
| Increase | light blue | +0.5 to +2.0 |
| Extreme Increase | blue | above +2.0 |
| Insufficient Data | dark gray | fewer than 2 measurements in window |

### Well thresholds (meters)

| Category | Color | Slope (m/yr) |
|----------|-------|--------------|
| Extreme Decline | red | below −0.6 |
| Decline | orange | −0.6 to −0.15 |
| Static | yellow | −0.15 to +0.15 |
| Increase | light blue | +0.15 to +0.6 |
| Extreme Increase | blue | above +0.6 |
| Insufficient Data | dark gray | fewer than 2 measurements in window |

## Aquifer-Level Trends

Alongside the per-well slopes, the application computes an aggregate trend for each aquifer using the **median slope** across the wells inside it. The median is more robust than the mean to the handful of extreme-decline wells that often sit on the edge of a pumping cone — a single steeply declining well doesn't swing the aquifer-level classification. Aquifers with fewer than two qualifying wells are categorized as insufficient data and shown in gray.

The thresholds for aquifer-level trends are half those used for individual wells, on the reasoning that an aquifer-wide decline of 0.5 ft/yr — every well in the aquifer dropping at that rate on average — is already a significant regional signal, while a single well declining at that rate is more commonplace.

### Aquifer thresholds (feet)

| Category | Slope (ft/yr) |
|----------|---------------|
| Extreme Decline | below −1.0 |
| Decline | −1.0 to −0.25 |
| Static | −0.25 to +0.25 |
| Increase | +0.25 to +1.0 |
| Extreme Increase | above +1.0 |

### Aquifer thresholds (meters)

| Category | Slope (m/yr) |
|----------|--------------|
| Extreme Decline | below −0.3 |
| Decline | −0.3 to −0.075 |
| Static | −0.075 to +0.075 |
| Increase | +0.075 to +0.3 |
| Extreme Increase | above +0.3 |

Aquifer polygons in trend mode are colored to match their aggregate category using the same palette as the well markers, so a glance at the map reads both the individual well picture and the aquifer-wide picture simultaneously.

## Trend Lines on the Chart

When trend mode is active and you have one or more wells selected, the time series chart overlays a straight trend line per well alongside the usual PCHIP curve. Each trend line spans the full trend window — from the window start to the current date — and the chart's x-axis expands to match, regardless of whether the individual well has data across the entire window. This makes it easy to see how a given well's measurements fit its computed regression: a cluster of recent points well below the trend line, for example, suggests a recent acceleration beyond the long-term rate.

The trend lines use the same color as the well's measurement curve, just drawn in a different line style so the two aren't confused visually.

## Interpreting the View

Trend categories are a coarse summary and are meant to support rather than replace the underlying time series. A region full of orange and red wells signals drawdown that's worth investigating, but whether that's over-pumping, a multi-year drought, or reduced recharge is a question the categories can't answer on their own. Similarly, blue wells may reflect genuine recovery, a shift to managed aquifer recharge, or simply the post-rebound after a historical stress event has passed. The categories point at questions; the underlying measurements answer them.

The **trend window** is the main knob for shifting what the view emphasizes. A 30-year window captures long-term behavior and smooths over cyclical drought-wet-drought patterns; a 10-year window captures recent conditions and is more responsive to current pumping or climate regimes; a 5-year window foregrounds only the last few years of activity and can pick up reversal signals that get lost in longer windows. Running the same map through two or three window lengths is a common workflow — a well that shows long-term stability at 30 years but steep decline at 5 years is telling a different story than a well that's been steadily declining across every window.

!!! tip
    Trend analysis works on any data type, not just water table elevation. Running it on a water-quality parameter like nitrate shows which wells have rising, falling, or stable concentrations over the trend window — useful for contamination tracking or compliance monitoring. Switch the data type in the toolbar before toggling trend mode to shift the analysis to the parameter you care about.
