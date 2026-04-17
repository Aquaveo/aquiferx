# Storage Analysis

When a raster analysis is loaded, Aquifer Analyst computes and displays a **cumulative storage change curve** showing how the volume of groundwater in the aquifer changes over time.

## How Storage Change Is Computed

The storage change calculation uses the raster frames to track changes in water level across the aquifer grid. For each time step, the change in head (water level) at each grid cell is multiplied by the cell area and a storage coefficient to estimate the volume of water gained or lost.

### The Storage Equation

For each grid cell \(i\) and time step \(t\):

\[
\Delta V_i^{(t)} = \Delta h_i^{(t)} \times A_i \times S_s
\]

where:

- \(\Delta h_i^{(t)} = h_i^{(t)} - h_i^{(t-1)}\) is the change in head from the previous frame
- \(A_i\) is the area of the grid cell (accounting for latitude-dependent convergence of meridians)
- \(S_s\) is the storage coefficient

The total storage change at each frame is the sum across all active grid cells, accumulated from the first frame:

\[
V^{(t)} = V^{(t-1)} + \sum_{i} \Delta V_i^{(t)}
\]

The first frame is the baseline (\(V^{(0)} = 0\)).

### Cell Area

Grid cell areas are computed using the latitude-dependent formula to account for the fact that longitude degrees represent shorter distances at higher latitudes:

\[
A = \Delta x \cdot \Delta y \cdot \left(\frac{\pi}{180}\right)^2 \cdot R^2 \cdot \cos(\phi)
\]

where \(\Delta x\) and \(\Delta y\) are the grid spacing in degrees, \(R = 6{,}371{,}000\) m is Earth's radius, and \(\phi\) is the latitude.

## Storage Coefficient

The **storage coefficient** (or storativity) is a dimensionless value between 0 and 1 that represents how much water is released from storage per unit decline in hydraulic head per unit area.

Typical values:

| Aquifer Type | Storage Coefficient Range |
|-------------|--------------------------|
| Unconfined | 0.1 – 0.3 |
| Confined | 0.0001 – 0.001 |

You can adjust the storage coefficient in the raster controls panel. Changing it immediately recalculates the storage curve.

## Volume Units

Choose the volume unit for the storage curve display:

| Unit | Description |
|------|-------------|
| ft³ | Cubic feet (for regions in feet) |
| acre-ft | Acre-feet (for regions in feet) |
| m³ | Cubic meters (for regions in meters) |
| MCM | Million cubic meters (for regions in meters) |
| km³ | Cubic kilometers (for regions in meters) |

## The Storage Curve

The storage curve is a line chart displayed below the map when a raster is loaded.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Storage analysis curve showing cumulative volume change over time with synch line</div>

### Reading the Curve

- **Y-axis** — Cumulative volume change from the baseline (first frame).
- **X-axis** — Date corresponding to each raster frame.
- **Positive values** — Net increase in storage (water levels rising).
- **Negative values** — Net decrease in storage (water levels declining).

### Synch Line

A vertical **red synch line** on the storage curve indicates the current time step in the raster animation. As you play the animation or scrub the frame slider, the synch line moves along the curve in sync, showing you the cumulative storage change at each point in time.

### Interpreting Changes

The storage curve integrates all spatial changes across the aquifer into a single time series. Look for:

- **Steady decline** — Persistent drawdown across the aquifer (over-pumping, drought).
- **Seasonal oscillation** — Regular cycles of recharge and withdrawal.
- **Abrupt changes** — May indicate changes in pumping patterns, land use, or extreme weather events.
- **Recovery** — An upward trend following a period of decline.

!!! tip
    Try different storage coefficient values to see how the magnitude of volume changes is affected. The shape of the curve stays the same — only the scale changes.
