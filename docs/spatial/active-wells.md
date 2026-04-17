# Active Wells

The **Active Wells** feature shows which wells contributed data to the spatial interpolation at each time step. This helps you understand data coverage and identify where the raster is well-supported by measurements versus where it relies more heavily on interpolation.

## Using Active Wells

With a raster loaded on the map, click the **Active Wells** button in the raster controls. The display changes to highlight only the wells that had valid measurements (or interpolated values) at the current time step.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map showing active wells highlighted for a specific time step</div>

## What "Active" Means

A well is considered active at a given time step if it had a valid value after temporal interpolation (PCHIP, linear, moving average, or model — depending on the method chosen during the spatial analysis). Wells that:

- Had no measurements near that date
- Were outside the temporal coverage of their measurement record
- Were excluded by the minimum observation or time span filters

appear dimmed or hidden, indicating they did not contribute to that frame's interpolation.

## Animation Sync

The active wells display updates as you play or scrub through the raster animation. This lets you see how data coverage changes over time:

- **Early frames** may have fewer active wells if monitoring only started at some wells later.
- **Recent frames** may have gaps where monitoring was discontinued.
- **Seasonal patterns** may appear if wells are measured at irregular intervals.

## Interpreting Coverage

- **Areas with many active wells** — The interpolated surface is well-constrained by data. You can have high confidence in the raster values here.
- **Areas with few active wells** — The surface depends more on the interpolation method's assumptions. Kriging or IDW may produce smoother estimates, but they are less reliable in data-sparse regions.
- **Temporal gaps** — If the number of active wells drops significantly at certain time steps, the corresponding raster frame may be less reliable.

!!! tip
    Use the active wells view to assess the reliability of your spatial analysis. If you notice significant drops in well coverage for certain periods, consider adjusting the date range or temporal method to improve data density.
