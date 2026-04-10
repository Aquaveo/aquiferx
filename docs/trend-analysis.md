# Trend Analysis

Trend analysis in Aquifer Analyst computes linear regression slopes for well measurements and visualizes the results on the map with color-coded markers. This gives you a quick overview of which areas are experiencing rising, declining, or stable water levels.

## Activating Trend Analysis

Click the **Trend** button in the toolbar to toggle trend analysis mode. When activated:

1. A linear regression slope is computed for every well in the selected aquifer.
2. Well markers on the map change color to reflect the trend category.
3. A color-coded legend appears showing the trend categories.
4. The time series chart for selected wells displays trend lines.

<!-- screenshot: Map in trend mode showing color-coded wells with legend -->

## How Trends Are Computed

For each well, the app fits a simple linear regression to its measurement data:

\[
y = mx + b
\]

where \(x\) is time (in years) and \(y\) is the measurement value. The slope \(m\) represents the average rate of change per year in the region's length unit (ft/year or m/year).

Wells with fewer than **2 measurements** within the trend window cannot produce a reliable trend and are marked as "Insufficient Data."

### Trend Window

The trend is computed over the **most recent X years** from the current date. For example, with the default 30-year window and a current year of 2026, only measurements from 1996–2026 are used. You can adjust the window in 5-year increments using the controls next to the Trend button.

When trend analysis is active, the time series chart automatically adjusts its x-axis to display the entire trend window, and the trend line extends across the full window period.

## Trend Categories

Wells are classified into five categories based on their slope value. The thresholds differ depending on the region's length unit:

### Thresholds for Regions in Feet

| Category | Color | Slope Range (ft/year) |
|----------|-------|-----------------------|
| Extreme Decline | Red | < −2.0 |
| Decline | Orange | −2.0 to −0.5 |
| Static | Yellow | −0.5 to +0.5 |
| Increase | Light Blue | +0.5 to +2.0 |
| Extreme Increase | Blue | > +2.0 |
| Insufficient Data | Dark Gray | Fewer than 2 measurements in window |

### Thresholds for Regions in Meters

| Category | Color | Slope Range (m/year) |
|----------|-------|-----------------------|
| Extreme Decline | Red | < −0.6 |
| Decline | Orange | −0.6 to −0.15 |
| Static | Yellow | −0.15 to +0.15 |
| Increase | Light Blue | +0.15 to +0.6 |
| Extreme Increase | Blue | > +0.6 |
| Insufficient Data | Dark Gray | Fewer than 2 measurements in window |

## Aquifer-Level Trends

In addition to individual well trends, the app computes an aggregate trend for each aquifer using the **median slope** across all wells in the aquifer. Aquifer-level trends use tighter thresholds:

### Aquifer Thresholds (Feet)

| Category | Slope Range (ft/year) |
|----------|----------------------|
| Extreme Decline | < −1.0 |
| Decline | −1.0 to −0.25 |
| Static | −0.25 to +0.25 |
| Increase | +0.25 to +1.0 |
| Extreme Increase | > +1.0 |

### Aquifer Thresholds (Meters)

| Category | Slope Range (m/year) |
|----------|---------------------|
| Extreme Decline | < −0.3 |
| Decline | −0.3 to −0.075 |
| Static | −0.075 to +0.075 |
| Increase | +0.075 to +0.3 |
| Extreme Increase | > +0.3 |

Aquifer-level trends are displayed as color-coded aquifer polygons on the map when trend mode is active.

## Interpreting Trends

- **Declining trends** (red/orange) indicate falling water levels, which may suggest over-pumping, drought, or reduced recharge.
- **Static trends** (yellow) indicate relatively stable conditions.
- **Increasing trends** (blue/light blue) indicate rising water levels, which may reflect increased recharge, reduced pumping, or recovery.
- **Insufficient data** (dark gray) means the well has fewer than 2 measurements within the trend window and a reliable trend cannot be determined.

!!! tip
    Use the trend window to focus on recent conditions. A well might show a long-term decline but a recent increase, or vice versa. Adjusting the window length lets you distinguish between these patterns.

## Trend Lines on the Chart

When trend mode is active and a well is selected, the time series chart overlays a straight trend line spanning the full trend window. The regression is fit using only the measurements within the window, and the line extends from the window start to the current date.
