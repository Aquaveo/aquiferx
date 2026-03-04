# Cross-Section Analysis

Cross sections let you sample the raster surface along a line to create an elevation profile. This is useful for visualizing how the water table slopes across the aquifer or how it changes between two points of interest.

## Drawing a Cross Section

1. With a raster loaded on the map, click the **Cross Section** button in the raster controls. The button highlights in blue to indicate cross-section mode is active.
2. **Click on the map** to place the start point (**A**). A marker appears and a rubber-band line follows your cursor.
3. **Move the mouse** to position the end point. The rubber-band line shows the proposed cross section.
4. **Click again** to place the end point (**A'**).

<!-- screenshot: Map showing cross-section line with A/A' labels and sight arrows -->

The cross-section line appears on the map with:

- **"A" and "A'" labels** at the start and end points.
- **Perpendicular sight arrows** at both ends, indicating the orientation of the profile.
- A solid dark blue line connecting the two points.

Press <kbd>Escape</kbd> at any time to cancel and exit cross-section mode.

## The Profile Chart

Once a cross section is drawn, a profile chart appears showing the elevation along the line.

<!-- screenshot: Cross-section profile chart showing elevation vs. distance -->

### Sampling

The raster is sampled at **200 evenly spaced points** along the cross-section line. At each sample point, the value is determined by **bilinear interpolation** of the four surrounding grid cells. Sample points that fall outside the aquifer mask return null and are not plotted.

### Chart Features

- **X-axis** — Distance along the cross section, in the region's length unit (feet or meters).
- **Y-axis** — Interpolated value (e.g., water table elevation).
- **Fill area** — A light blue filled region below the profile curve.
- **Tooltip** — Hover to see the exact distance, value, and date at any point along the line.

### Animation Sync

The cross-section profile updates in sync with the raster animation. As you play through frames or scrub the timeline, the profile redraws to show the surface along the same line at each time step. This lets you observe how the cross-sectional shape changes over time — for example, watching a cone of depression form and recover.

## Tips

- Draw cross sections perpendicular to expected flow directions to see the hydraulic gradient.
- Place cross sections through well clusters to compare the interpolated surface with measured values.
- Use cross sections before and after pumping events to visualize drawdown effects.
- Draw multiple cross sections by repeating the drawing process — each new cross section replaces the previous one.
