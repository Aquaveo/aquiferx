# Viewing Data

Most of the time you spend in Aquifer Analyst will be in the three visualization panes — the sidebar tree, the interactive map, and the time series chart — reading what's there and navigating between views rather than launching wizards. This page covers how those panes work, how selections propagate between them, and the controls that shape what each one displays.

## The Sidebar Tree

The sidebar is the application's primary index. Regions sit at the top level, with aquifers nested inside each region and wells nested inside each aquifer. Any computed analyses — spatial rasters, imputation models — are listed under the aquifers they were computed for. The tree expands and collapses as you navigate, keeping the currently relevant branch open and folding siblings away so the panel stays readable even with thousands of wells across many regions.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Sidebar showing an expanded region with aquifers, wells, rasters, and models</div>

Selection drives what the rest of the application displays. Clicking a region selects it and focuses the map on its boundary; clicking an aquifer selects it and brings up its wells; clicking a well adds it to the chart. If you click an aquifer whose parent region isn't currently selected, the application switches the selection to that region automatically (and makes the region visible if it was hidden), so the map and data follow the click without extra steps. Clicking an already-selected region or aquifer deselects it.

Each region entry has an eye icon that toggles the region's visibility on the map independently of selection. This lets you keep several regions loaded and only show the one you're currently working with. Rasters and models in the sub-tree work similarly — clicking loads them as overlays, clicking again unloads. When a raster or model is loaded, the data type selector in the toolbar automatically switches to match, so the map markers, chart, and overlay are always showing the same parameter.

Right-clicking any item opens a context menu. The available actions depend on what you right-clicked — regions support edit, show/hide, download, and delete; aquifers support rename and delete; rasters and models support rename, get info, and delete. The download action on a region packages the entire region folder as a ZIP, suitable for backup or sharing.

## The Interactive Map

The map fills the center of the screen and renders well markers and polygon boundaries on top of a basemap of your choice. It uses Leaflet underneath, which means panning and zooming work the way they do on every other web map: drag to pan, scroll to zoom, double-click to zoom in, use the +/− controls in the top-right corner for discrete zoom steps.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map showing a region with wells on satellite imagery</div>

### Basemaps

The basemap selector in the map's controls offers eight options: OpenStreetMap for streets and labels, Esri Topographic for terrain and contour features, Esri Imagery for satellite and aerial photos, Esri Streets for a simplified road map, Esri Light Gray and Dark Gray for minimal canvases (useful when you want the data to read without basemap competition), Esri Terrain for hillshade with land cover, and Esri National Geographic for a more editorial style. Each option shows a thumbnail preview in the selector so you can pick without flipping between them.

### Well markers

Wells appear as colored circular markers. Marker color reflects how many observations the well has for the currently selected data type — lighter colors mean few observations, darker colors mean many, and wells with no observations for the current parameter show in muted red. Switching the data type in the toolbar re-colors the markers immediately, so you can see at a glance which parts of the aquifer have which parameters measured.

A minimum-observations filter in the toolbar hides wells with fewer than a given number of readings for the current parameter. This is useful both for cleaning up maps of sparse water-quality parameters (where a threshold of 2 or 3 drops the single-sample wells that clutter the view) and for focusing analyses like trend regression that need multiple points to be meaningful. The default threshold is 0, which shows every well.

### Date filter

A **Filter dates** toggle in the map options panel narrows the display to wells whose measurement history overlaps a specified window. When enabled, two year inputs appear for the window's bounds. A well passes the filter if its measurement span — earliest to latest reading for the current data type — overlaps the window, not necessarily if it has a reading *inside* the window. A well with measurements in 2000 and 2008 passes a 2002–2005 filter, because the 2000–2008 span covers the filter range. This semantic avoids a common frustration where a useful well drops off the map because its samples happen to fall on either side of the chosen window.

The filter updates only after you enter a full four-digit year, so typing intermediate digits doesn't cause wells to flicker on and off. When the date filter is active and you have a well selected, the time series chart overlays a gray band covering the filter range so you can see how the filter relates to the individual well's data.

### Labels

Two label toggles in the toolbar control aquifer and well labels. Aquifer labels display each aquifer's name at its label point (a pole-of-inaccessibility calculation that picks a visually central location inside the polygon). Well labels display each well's ID or name next to its marker, with a font size setting (9–16 px) if the defaults are too large or too small for the zoom level you work at.

### Well search

When an aquifer is selected, a search bar appears in the top-left corner of the map. Type a partial well name or ID to filter matching wells; up to eight results appear in a dropdown. Arrow keys navigate the list, Enter selects, Escape dismisses. Selecting a well flies the map to that well's location and briefly highlights the marker with a shrinking red ring — useful both as a find-and-go shortcut and as a way to confirm visually that the right well got selected from an ambiguous name.

## Well Selection

Clicking a well on the map or in the sidebar selects it and brings its time series into the chart. A selected well shows a gold ring around its marker, which is visible regardless of the underlying color.

Multi-well selection uses Shift:

- **Shift-click** adds a well to (or removes it from) the current selection, so you can build up a list of wells to compare.
- **Shift-drag** defines a rectangular selection; every well inside the box joins the current selection at once. The cursor switches to a crosshair during the drag so it's clear that the click is being used for selection rather than map panning.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map with shift-drag rectangle and gold-ringed selected wells</div>

When multiple wells are selected, the chart shows each as a separate line in a distinct color drawn from an eight-color palette. A legend identifies each well by name. Selections persist across data type changes — if you switch from water levels to nitrate, the same wells remain selected and the chart shows their nitrate history.

## The Time Series Chart

The chart panel at the bottom of the screen plots the measurement history for whichever wells are currently selected. Each well appears as a smooth curve through its actual measurement points, with the curve drawn in the well's assigned color and the raw measurement points drawn on top as dots. The dots distinguish the actual recorded values from the interpolated curve between them.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Time series chart with PCHIP curves and measurement dots</div>

### Curve shapes

By default, the curves use **PCHIP** (Piecewise Cubic Hermite Interpolating Polynomial) interpolation, which produces a smooth line that respects the monotonicity of the data and doesn't overshoot between points the way cubic splines often do. This is the right choice for most groundwater work — it gives a visually readable trend without inventing features that aren't in the data. A toggle switches to **linear** interpolation, which draws straight segments between consecutive measurements, useful when you want to see the raw point-to-point shape without any smoothing.

### Ground surface elevation overlay

For water-level data, a **Show GSE** toggle overlays each selected well's ground surface elevation as a brown dashed horizontal line. This is useful for reading the water table's depth relative to the surface rather than its absolute elevation — a water level 10 feet below the GSE reads clearly regardless of the absolute elevation number.

### Trend lines

A **Trend** toggle overlays a linear regression line on each well. The regression uses the most recent N years of data (default 30 years, configurable), and both the chart x-axis and the trend line span that full window regardless of whether the well has data across the whole window. Wells with fewer than two measurements in the window get skipped; the trend line requires at least two points to compute. This pairwise "every well gets its own trend" view complements the region-wide trend map covered on the [Trend Analysis](trend-analysis.md) page.

### Smoothing

A **Smoothing** toggle applies a Nadaraya-Watson kernel regression with a Gaussian kernel and a user-configurable window in months. This dampens short-term fluctuations so a long-term seasonal or decadal pattern reads through more clearly. The smoothing line is drawn in a distinct style so it's never confused with the raw curve.

### Zoom and pan

Horizontal drag across the chart zooms into a date range. Double-clicking or pressing the reset button returns the chart to the full date range. The y-axis auto-scales to fit whatever data is currently visible, so zooming in on a tight range fills the vertical space productively.

### Editing and deleting measurements

Clicking a measurement dot selects it, and a right-click (or the context menu on the dot) offers **Edit** or **Delete**. Edits update the value on the dot in place; deletions remove the measurement. Both operations write back to the underlying measurement file immediately, so there's no separate save step.

### Export

The Export CSV button in the toolbar writes the currently displayed time series — including the interpolated curve points, not just the measurement dots — to a CSV that downloads through the browser. The file is named after the first selected well and the active data type, so `W123_wte.csv` and the like.

### Expanded chart window

For detailed analysis where the chart's normal footprint is too small, the **Expand Chart** button in the toolbar opens the time series in a floating, resizable window that you can drag around and resize to fill the screen. The expanded window is a live view of the same data — selections, data type changes, and edits all propagate immediately. Closing the window with the X button or the Escape key returns the chart to its inline position.

## Chart Panel Tabs

The chart panel uses a tabbed interface that surfaces different views of the currently loaded data. Tabs appear only when their underlying data exists, so the chart stays focused on what's relevant.

The **time series** tab is always present and is the default. Its label reflects the active data type — it reads "Water Level" for WTE data, or the data type's name for other parameters ("Nitrate", "Chloride", "pH", and so on).

The **Storage Change** tab appears when a spatial raster is loaded, and plots the cumulative volume change over time implied by the raster's animated surfaces. This is the primary output of the storage analysis workflow covered on the [Storage Analysis](spatial/storage.md) page.

The **Raster Statistics** tab also appears when a spatial raster is loaded, and plots per-frame statistics — mean, median, standard deviation, interquartile range — computed across every pixel in each frame of the raster.

The **Cross Section** tab appears when a cross-section line has been drawn on the map. It shows an elevation profile along the line, extracted from the currently loaded raster. Details are on the [Cross Section](spatial/cross-section.md) page.
