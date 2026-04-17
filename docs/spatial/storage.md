# Storage Analysis

When a water-level raster is loaded, Aquifer Analyst computes a **cumulative storage change curve** that shows how the volume of groundwater in the aquifer has changed over time relative to the first frame of the raster. The curve is the integral of the frame-to-frame head changes, weighted by grid-cell area and scaled by a storage coefficient, summed across every cell inside the aquifer polygon. It's the natural diagnostic for answering "how much water has this aquifer gained or lost over the analysis window?"

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Storage Change chart showing cumulative volume curve with synchronization line</div>

The curve appears in the chart panel on a **Storage Change** tab that becomes available as soon as a raster is loaded. A vertical reference line tracks the currently displayed frame in the raster animation; scrubbing the frame slider moves the line along the curve in real time, making it easy to see how the spatial pattern on the map at any given moment corresponds to the cumulative volume change to that point.

## How the Curve Is Computed

For each grid cell inside the aquifer and each pair of consecutive frames, the change in water-table elevation is multiplied by the cell's area and by a storage coefficient to give the volume of water gained or lost at that cell between the two frames:

\[
\Delta V_i^{(t)} = \Delta h_i^{(t)} \cdot A_i \cdot S_s
\]

where \(\Delta h_i^{(t)} = h_i^{(t)} - h_i^{(t-1)}\) is the per-cell head change, \(A_i\) is the cell's area, and \(S_s\) is the storage coefficient. The total volume change at frame \(t\) is the sum across every cell, and the cumulative curve is built by running-summing these totals from the first frame:

\[
V^{(t)} = V^{(t-1)} + \sum_{i} \Delta V_i^{(t)}
\]

The first frame is the baseline, with \(V^{(0)} = 0\) by construction. All later volumes are read as changes from that baseline — positive values mean the aquifer has gained water since the baseline frame, negative values mean it has lost water.

Cell areas are computed using a latitude-dependent formula that accounts for the convergence of meridians at higher latitudes:

\[
A = \Delta x \cdot \Delta y \cdot \left(\frac{\pi}{180}\right)^2 \cdot R^2 \cdot \cos(\phi)
\]

where \(\Delta x\) and \(\Delta y\) are the grid spacing in degrees, \(R = 6{,}371{,}000\) m is Earth's radius, and \(\phi\) is the latitude. Without this correction, cells near the poles would be over-counted; with it, the areas are accurate at any latitude.

## The Storage Coefficient

The storage coefficient sets the scale of the computed volumes. It's the property of the aquifer that determines how much water is released from storage per unit decline in hydraulic head per unit area — the property that converts a purely geometric head change into a physical volume of water.

For unconfined aquifers, the appropriate coefficient is the **specific yield**, typically 0.1–0.3 depending on the porosity and drainage characteristics of the aquifer material. For confined aquifers, the appropriate coefficient is the **storativity**, typically much smaller (0.0001–0.001) because water released from a confined aquifer comes from aquifer compression and water expansion rather than gravitational drainage. Using a confined-aquifer coefficient on an unconfined aquifer produces volumes that are orders of magnitude too small, and vice versa.

The storage coefficient is a knob in the raster controls panel rather than a baked-in parameter of the raster itself, so you can adjust it and see the curve rescale immediately without rerunning the spatial analysis. Published specific yield or storativity values for your aquifer are the right starting point; if none are available, the literature range for the dominant aquifer material is a reasonable default. The shape of the curve doesn't depend on the coefficient — only the vertical scale does — so the qualitative story the curve tells is robust to your choice, even when the absolute volumes are uncertain.

## Volume Units

The curve displays volumes in units chosen from a dropdown in the raster controls panel. Unit choices depend on the region's length unit.

For regions in feet, the options are **cubic feet** (the native unit) or **acre-feet** (commonly used in U.S. water resources work, equal to about 43,560 cubic feet). Acre-feet is almost always the more readable option for regional aquifers — cumulative volumes on a typical aquifer run into billions of cubic feet, which are harder to interpret than the equivalent tens of thousands of acre-feet.

For regions in meters, the options are **cubic meters** (native), **million cubic meters (MCM)**, or **cubic kilometers**. MCM is the typical reporting unit for water-resource volumes in metric contexts; cubic kilometers is more convenient for very large aquifer systems where even MCM totals run into six or seven digits.

## Reading the Curve

The y-axis of the storage curve is cumulative volume change from the first frame, in whichever unit you've selected. The x-axis is time, matching the raster's frame schedule. Values above zero indicate storage has grown since the baseline; values below zero indicate storage has shrunk.

A **steady downward slope** across the window indicates persistent net withdrawal — over-pumping, sustained drought, or reduced recharge — where the rate of decline is proportional to the slope of the curve. A **steady upward slope** is the opposite: net recharge outpacing withdrawals across the window. **Seasonal oscillations** (an upward ramp each winter followed by a downward ramp each summer, or the reverse in winter-rainfall climates) reflect regular recharge-and-withdrawal cycles and are normal in most aquifers; the longer-term trend is what you read under the seasonal signal. **Abrupt changes** in slope — a curve that goes flat after declining for years, or sharply steepens — usually signal changes in pumping patterns, land use, or climate regime that are worth investigating directly.

A **curve that recovers** (declines during a stress period, then climbs back toward or past the baseline afterward) is the signature of an aquifer that has responded to management or climate forcing and returned to equilibrium. A **curve that doesn't recover** after a stress period suggests either ongoing stress or inelastic storage behavior — water released from long-term compaction, for instance, doesn't return to storage when pumping stops.

!!! tip
    The storage curve is sensitive to the storage coefficient but the *shape* of the curve isn't. If you're unsure what coefficient is right for your aquifer, try a few plausible values to see how the quantitative scale changes while the qualitative story stays the same. This is also a useful way to communicate uncertainty in the volume estimates — presenting a range of curves for a range of coefficients, rather than a single curve that implies a precision the underlying physics doesn't support.
