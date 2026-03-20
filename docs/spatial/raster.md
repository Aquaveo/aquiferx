# Raster Visualization

After running a spatial analysis, the resulting raster is loaded as a color-mapped overlay on the map. This page covers the visualization controls and how to interpret the display.

## Loading a Raster

In the sidebar, expand the selected aquifer to see the list of computed raster analyses. Click on a raster name to load it onto the map. The active raster is highlighted in the sidebar.

<!-- screenshot: Map with raster overlay showing color-coded water table surface -->

## Color Ramps

AquiferX provides six color ramps for visualizing raster data. Select a color ramp from the dropdown in the raster controls panel.

| Color Ramp | Description | Best For |
|------------|-------------|----------|
| **BGYR** (default) | Blue → Green → Yellow → Red | Sequential data (blue=low, red=high) |
| **Viridis** | Purple → Green → Yellow | General-purpose, colorblind-friendly |
| **Plasma** | Purple → Orange → Yellow | High-contrast sequential data |
| **Turbo** | Red → Yellow → Green → Cyan → Blue | Smooth spectral, fine detail |
| **Inferno** | Black → Red → Yellow → White | Dark background friendly |
| **Blues** | Light Blue → Dark Blue | Water-themed, monochromatic |

Each color ramp uses a 64-step lookup table for smooth color transitions.

## Color Range

The color scale is computed automatically using the **2nd to 98th percentile** of all values across all raster frames. This percentile clipping prevents extreme outliers from compressing the useful color range. The colorbar on the map shows the value range and corresponding colors.

## Contour Lines

Toggle the **Contour Lines** option to overlay isolines on the raster. Contour lines are generated using the marching squares algorithm with 8 evenly spaced levels across the value range.

Contour lines help identify:

- **Gradients** — Closely spaced lines indicate steep changes.
- **Flat areas** — Widely spaced lines indicate gentle slopes.
- **Highs and lows** — Closed contour loops mark local extremes.

## Animation Playback

If the raster contains multiple time frames (i.e., the temporal interval is less than the full date range), you can animate through them.

<!-- screenshot: Raster playback controls showing play/pause, frame slider, and date display -->

### Playback Controls

- **Play / Pause** — Start or stop the animation.
- **Frame Slider** — Drag to scrub to any frame.
- **Current Date** — Displays the date of the current frame.

Frames advance at approximately 500ms intervals. The animation loops by stopping and resetting to the first frame when the last frame is reached.

### Frame Navigation

The frame slider lets you jump to any time step. As you scrub, the raster overlay, storage curve, and cross-section profiles (if active) all update to reflect the current frame.

## Cursor Value Tooltip

Hover over the raster to see the interpolated value at that location. A tooltip displays the value with one decimal place. The tooltip only appears over cells that are within the aquifer boundary (masked cells show nothing).

## Raster Management

### Raster Info

Right-click a raster in the sidebar or click the info icon to view a summary of the analysis parameters:

- Interpolation method and settings
- Date range and interval
- Resolution and well count
- Creation date

### Rename

Right-click a raster in the sidebar and select "Rename" to change its display title.

### Delete

Right-click a raster and select "Delete" to remove it. This deletes the raster JSON file from disk. A confirmation dialog is shown before deletion.

## Raster Statistics

When a raster is loaded, a **Raster Statistics** tab becomes available in the chart panel. This chart displays summary statistics computed from the well values at each raster time step, giving you a compact view of how the distribution of values across the aquifer changes over time.

<!-- screenshot: Raster statistics chart showing mean line with std dev band -->

### What Is Computed

During raster generation, the following statistics are computed from the well values at each frame (not from the interpolated grid — from the actual well measurements used as input):

| Statistic | Description |
|-----------|-------------|
| **Mean** | Average value across all contributing wells |
| **Std Dev** | Standard deviation of well values |
| **Median** | 50th percentile (middle value) |
| **P25 / P75** | 25th and 75th percentiles (interquartile range) |
| **Min / Max** | Extreme values across all contributing wells |
| **Count** | Number of wells with data at that time step |

### Chart Display

The chart shows a solid **blue mean line** by default, with a light blue **±1 standard deviation band** shaded around it. A settings popover (gear icon in the top-right corner) lets you toggle additional overlays:

| Overlay | Color | Default |
|---------|-------|---------|
| **Mean ± Std Dev** | Blue band | On |
| **Median** | Purple dashed line | Off |
| **P25–P75 (IQR)** | Teal band | Off |
| **Min–Max** | Orange band | Off |

### Synch Line

When animating a raster, a vertical **red reference line** on the statistics chart tracks the current frame, keeping it in sync with the map overlay and other chart tabs.

### Tooltip

Hover over the chart to see the exact date, well count, and all active statistics at that time step.
