# Overview of the App

Aquifer Analyst organizes groundwater monitoring data around a natural hierarchy and gives you a coordinated set of visualization and analysis tools that operate on that data. This page describes the interface you see when you open the application, the data model behind it, and the conventions that tie the pieces together. The [Getting Started](getting-started.md) guide covers installation; later pages cover the specific workflows for preparing, importing, and analyzing data in depth.

## The Interface

The application opens with four elements sharing the screen. A toolbar runs along the top and holds global controls. A sidebar on the left organizes your data hierarchically. The map fills the center of the screen and shows where your wells are. A time series chart at the bottom shows the measurements at whichever wells you've selected. Each pane responds to selections made in the others, so the entire workspace stays in sync as you navigate.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Annotated full interface showing toolbar, sidebar, map, and chart</div>

The **toolbar** at the top has two halves. On the left is the data type selector, a dropdown that chooses which measurement parameter (water table elevation, nitrate, arsenic, and so on) the rest of the application displays. Changing this selection is the single action that ripples across everything else — the map re-colors its well markers by the number of observations of the new parameter, the chart switches to show that parameter's values, exports operate on it. On the right are the buttons that launch the major workflows: **Manage Data** opens the import hub; **Trend Analysis** toggles a region-wide linear-regression view on the map; **Spatial Analysis** launches the interpolation wizard that produces kriged or IDW raster surfaces; **Impute Data** launches the machine-learning gap-filling wizard; **Export CSV** saves the currently displayed time series; and **Expand Chart** pops the chart out into a floating, resizable window.

The **sidebar** on the left shows your data as a tree. Regions are listed at the top level, with aquifers nested inside each region and wells nested inside each aquifer. Any computed analyses — spatial rasters or imputation models — are listed under the aquifer they were computed for. Clicking an item selects it and drives what the map and chart display. Right-clicking any item opens a context menu for editing, renaming, downloading as a ZIP archive, or deleting. The tree expands and collapses as you navigate, with the currently relevant branch kept open and siblings folded away to keep the panel readable for large datasets.

The **map** takes up the center of the screen. It renders on top of a basemap of your choice — eight are built in, ranging from OpenStreetMap to satellite imagery to minimal light- or dark-gray canvases — and shows the boundaries of the selected region and aquifer along with every well in the current view as a colored circular marker. Marker color reflects how many observations that well has for the currently selected data type, so data-rich parts of an aquifer read as a dark cluster and data-sparse parts fade toward the basemap. Clicking a well selects it; shift-clicking additional wells or shift-dragging a rectangle adds them to the selection. Selected wells display a gold ring. When a spatial analysis is active, the interpolated raster surface appears as a semi-transparent overlay on top of the basemap.

The **time series chart** at the bottom of the screen plots the measurement history for whichever wells are currently selected. Each well appears as a distinct color drawn from an eight-color palette, with smooth PCHIP-interpolated curves tracing through the actual measurement points. A tab strip switches the chart between its different views: the default time series, a storage-volume-change plot (when a spatial raster is loaded), per-frame raster statistics, and cross-section profiles. The tabs appear only when their underlying data exists, so the chart doesn't clutter itself with views that aren't relevant.

## The Data Hierarchy

Data is organized in a four-level hierarchy, with computed analyses attaching at the aquifer level:

```
Region ─── boundary polygon, length unit (ft | m)
  │
  ├── Aquifer(s) ─── boundary polygon(s)
  │     │
  │     ├── Wells ─── coordinates, GSE, aquifer assignment
  │     │     │
  │     │     └── Measurements (per parameter)
  │     │            wte, nitrate, arsenic, pH, ...
  │     │
  │     ├── Raster analyses (per parameter)
  │     │
  │     └── Imputation models (per parameter)
```

A **region** is the top-level container for a study area. Each one has a name, a length unit (feet or meters, which controls how elevations and depths are displayed throughout the UI), and a boundary polygon. Multiple regions can be loaded at once and switched between in the sidebar.

A region contains one or more **aquifers**, each with its own boundary polygon. Single-aquifer regions are handled specially (covered below) so you don't have to set up a separate aquifer layer when the region has just one.

Each aquifer holds **wells** — coordinates, an optional ground surface elevation, and an aquifer assignment. In multi-aquifer regions the assignment is derived automatically by point-in-polygon against the aquifer boundaries, so you rarely tag wells by hand. A single well can carry any combination of data types — water level, nitrate, pH, whatever — all tied back to the same physical location.

**Measurements** are time-stamped values at a well for a specific parameter. They're stored by parameter, so switching between water level and nitrate in the data type selector swaps in a different set of values for the same well network.

**Spatial analyses and imputation models** attach at the aquifer level (not the region level), since both operate on the wells and measurements within a single aquifer. They're also parameter-specific — an interpolated nitrate surface is a separate analysis from an interpolated water-table surface over the same aquifer.

## Single-Aquifer vs. Multi-Aquifer Regions

When you create a region you choose, up front, whether it will have a single aquifer or multiple aquifers. The distinction is worth getting right from the start because switching later requires recreating the region.

A **single-aquifer region** treats the region boundary as the aquifer boundary. The sidebar and import wizards hide the aquifer level entirely in this mode: you go directly from region to wells, and every well gets the same aquifer assignment automatically.

A **multi-aquifer region** carries aquifer boundaries as a separate layer. You upload them as a GeoJSON or shapefile containing one polygon feature per aquifer, and the application assigns wells to aquifers via point-in-polygon as the wells are imported. Measurements inherit the assignment from their well. Spatial analyses, trend views, and most other aquifer-level operations run per aquifer, so multi-aquifer mode is what you want whenever you care about keeping hydrostratigraphic units separated in the analysis.

## Data Types

Every measurement in Aquifer Analyst belongs to a **data type** — the parameter being measured. Water table elevation is the default, and for water quality work the application ships with a built-in catalog of roughly 38 standardized parameters (nitrate, arsenic, pH, dissolved oxygen, and the rest of the parameters most groundwater programs track). The catalog keeps parameter definitions consistent across regions: nitrate in one region has the same name, same unit, and same regulatory reference values as nitrate in another, so cross-region comparison works without any manual reconciliation. Parameters specific to your region that aren't in the catalog — specialized organic compounds, or parameters reported using non-standard conventions like hardness expressed as CaCO3 — can be defined as custom data types scoped to that region.

The data type selector in the toolbar switches between every parameter that has data in the current region. Changing the selection updates every downstream view: the map re-colors well markers by the number of observations for the new parameter, the chart switches to show that parameter's values at the selected wells, any exports operate on the new parameter's data, and the tab strip on the chart relabels itself accordingly. Spatial analyses and imputation models are parameter-specific — a kriging surface of nitrate concentration is a separate analysis from a kriging surface of water table elevation, and loading one from the sidebar automatically switches the data type selector to match, keeping the entire interface coherent.

Parameters show up in the selector only when there's actual data behind them. Catalog parameters are globally standardized but don't appear in a region's dropdown until you've imported measurements for them in that region; custom types work the same way. Importing data is what brings a parameter into a region, and deleting its data is what removes it. The [Water Quality Data](water-quality.md) page covers the catalog model and parameter handling in detail.

## Coordinate Reference Systems

Aquifer Analyst works internally in WGS 84 latitude/longitude — the same coordinate system used by GPS and most web mapping services. All stored data is in WGS 84, and all visualizations use it. You don't generally have to think about coordinate systems when importing data, because the application handles reprojection automatically for the formats that carry their own coordinate metadata. GeoJSON files are reprojected using the `crs` property embedded in the file; shapefiles are reprojected using the `.prj` file packaged alongside in the ZIP archive. The reprojection itself uses the proj4 library and supports essentially every coordinate system in common use.

For CSV imports — wells or measurements with latitude and longitude columns — the import wizards include a coordinate system picker that defaults to WGS 84. If your CSV actually uses a projected system instead (UTM, State Plane, a national grid like JAD2001 for Jamaica), the picker offers every common option and an Auto-detect button that tries the most likely systems for the region and picks the one whose coordinates fall inside the region boundary. A small row preview shows what the first row's coordinates look like after conversion, with a green check or amber warning indicating whether the result lands inside the region. The application will also run Auto-detect automatically once per file when the WGS 84 default obviously fails, so most projected-coordinate CSVs simply work without your touching the picker at all.

The coordinate handling is most likely to trip you up when the source file is ambiguous — no `.prj` in the shapefile, no `crs` in the GeoJSON, and a CSV picker left on WGS 84 when the coordinates are actually in State Plane. In practice this situation shows up visually and quickly: wells appear in the wrong place on the map, or the row preview warns that the first row lands outside the region. The Auto-detect button is usually the quickest recovery.

## Where Data Comes From

Data reaches Aquifer Analyst through three main paths. The first and most general is **file import** — you upload CSV files for wells and measurements or a GeoJSON or shapefile for region and aquifer boundaries, and the import wizards walk through mapping your columns to the fields the application needs. Details are in the [Managing Data](managing-data.md) page.

For regions that overlap the United States, two additional paths are available as tabs inside the import wizards. The **USGS Water Data API** serves as a source for water-level measurements at USGS-monitored wells. You can pull both the well locations and their water-level histories directly, with the application converting USGS's depth-below-surface readings into water table elevations using each well's ground surface elevation. A quick-refresh mode pulls only records newer than your most recent existing measurement, which is useful for keeping a dataset current without re-downloading old data. The **Water Quality Portal** serves as a source for water quality data; it's a federated system that aggregates analytical results from USGS, EPA, USDA STEWARDS, and over 400 other public and private monitoring programs, so a single WQP download typically returns data from many agencies combined. Both remote sources are gated to U.S.-overlapping regions because that's where their coverage exists.

Whichever path you use, the imported data feeds the same downstream machinery. A smart well discovery pipeline resolves source rows to wells — matching by ID, by name, or by proximity — and creates new wells on the fly for source rows whose coordinates don't fall within any existing well's neighborhood. A column mapping editor translates measurement column names into standardized parameter codes, leaning on the parameter catalog to suggest targets automatically. Quality cleanup logic drops rows that can't be parsed, that fall outside the region, or that duplicate existing data. The [Managing Data](managing-data.md) and [Water Quality Data](water-quality.md) pages walk through these pieces in depth.
