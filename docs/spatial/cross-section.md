# Cross-Section Analysis

A cross section samples the loaded raster along an arbitrary line on the map, producing a profile of the surface values as a function of distance along the line. For a water-table raster this is effectively a potentiometric profile — the water table's elevation plotted against distance from one end of the section to the other — and it's the standard view for reading hydraulic gradients, drawdown geometry around pumping centers, or the effect of a confining boundary on a particular transect through the aquifer.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map showing a cross-section line with A/A' labels and the corresponding profile chart below</div>

## Drawing a Section

With a raster loaded, clicking the **Cross Section** button in the raster controls enters cross-section mode; the button highlights in blue to indicate the mode is active. The first click on the map places the start point of the section, labeled **A**. A rubber-band line then tracks your cursor until the second click places the end point, labeled **A'**. The final section appears as a solid dark blue line between the two points, with the A and A' labels at each end and perpendicular sight arrows indicating the section's orientation.

Drawing a new section replaces any section previously drawn — the application supports one active cross section at a time rather than multiple simultaneous profiles. Pressing Escape during drawing cancels and exits cross-section mode without placing the section; pressing Escape after the section is placed keeps the section drawn but exits the mode so subsequent map clicks return to their usual well-selection behavior.

## Reading the Profile

The profile chart appears on a **Cross Section** tab in the chart panel as soon as the section is drawn. Its x-axis is distance along the section (in the region's length unit), starting at zero at point A and running to the full length at point A'. Its y-axis is the interpolated raster value at each sample point — water-table elevation for a WTE raster, concentration for a water-quality raster, whatever the underlying data type is. The profile is drawn as a continuous line with a light blue fill below it, which helps it read as a surface rather than an arbitrary curve.

The raster is sampled at 200 evenly-spaced points along the section line. At each sample point, the value comes from a bilinear interpolation of the four surrounding grid cells in the raster — the same interpolation scheme used for the cursor tooltip on the map overlay, so the profile values at specific distances match what the tooltip shows when you hover over the map at the corresponding location. Sample points that fall outside the aquifer polygon return null values and are skipped in the chart, producing visible gaps in the profile where the section crosses out-of-aquifer territory (between two disjoint aquifer lobes, for instance).

Hovering over the profile chart shows a tooltip with the exact distance along the section, the interpolated value at that distance, and the date of the current frame, so you can read specific values off the profile precisely.

## Animation

Like the map overlay and the other chart tabs, the cross-section profile updates live as the raster animation plays or the frame slider is scrubbed. Each frame's profile is computed from that frame's raster, so you see the section's shape evolve through time. Playing the animation with a cross section active turns into a compact visualization of how the section has changed — watching a cone of depression deepen or a recharge front migrate, for example, plays out as a moving vertical signature in the profile.

## Practical Placement

A few patterns for placing useful cross sections:

**Perpendicular to expected flow directions.** The hydraulic gradient reads as the slope of the profile curve, so a section perpendicular to flow lines shows the gradient in the flow direction at every point along the section. This is the default orientation for most diagnostic work.

**Through well clusters.** A section that passes through a row of wells lets you compare the interpolated surface directly with the underlying observations (visible on the map as markers). Mismatches between the profile and a well's actual value at the well's location indicate either that the interpolation is under-constrained in that area or that the well's value is an outlier relative to its neighbors.

**Across pumping centers.** Placing a section across an active pumping well and extending it outward in each direction captures the drawdown cone's cross-sectional shape. Running the animation reveals how the cone has developed over time and whether it's deepening, widening, or recovering.

**Across confining boundaries.** A section that crosses a known confining feature — a fault, an impermeable contact, a lithologic boundary — reveals whether the water-table surface shows a discontinuity there. A visible step in the profile at a known boundary is itself a useful validation of the interpolation; a smooth profile across a known boundary may indicate that the well network is too sparse to resolve the feature.
