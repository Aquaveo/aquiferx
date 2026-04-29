# Aquifer Analyst

Aquifer Analyst is a web-based groundwater data visualization and analysis application designed for hydrogeologists, water resource engineers, and researchers working with monitoring data. It brings together the data sources, visualization tools, and analytical methods that come up most often in groundwater work — water-level measurements, water quality samples, well networks, and aquifer boundaries — in a single browser-based interface that runs locally with no separate server to install.

The application is built around a familiar four-pane workflow: a sidebar tree that organizes your data hierarchically (regions, aquifers, wells, computed analyses), an interactive map showing well locations and aquifer boundaries, a time series chart for the wells you select, and a toolbar for switching between data types and launching analyses. Beneath that surface, it supports two broad classes of work — the day-to-day exploration and reporting that monitoring programs depend on, and the more involved analytical work (spatial interpolation, trend regression, machine-learning gap-filling) that turns raw observations into something that informs decisions.

Aquifer Analyst handles both **water levels** and **water quality** data through the same interface. The same map, time series chart, and spatial-analysis tools work for nitrate, arsenic, pH, dissolved oxygen, and dozens of other water quality parameters as they do for water table elevation. Data can come from your own files (CSV, GeoJSON, shapefile), from the USGS Water Data API for water levels, or from the Water Quality Portal — a federated source that aggregates water quality results from over 400 public and private monitoring programs, including USGS, EPA, and many state and tribal agencies.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Main application interface showing map with wells, sidebar, and time series chart</div>

## Key Features

- **Interactive Map** — Explore well locations on a Leaflet map with eight basemap options, including satellite imagery and topographic views. Click wells to view their time series; shift-click or box-drag to select multiple wells for comparison.

- **Time Series Visualization** — View measurement history with smooth PCHIP interpolation curves. Edit individual measurements, zoom into date ranges, and overlay ground surface elevation. Multi-well selection produces color-coded comparison plots automatically.

- **Hub-and-Spoke Data Management** — Import regions, aquifer boundaries, well locations, and measurements through guided wizards. CSV, GeoJSON, and shapefile formats are all supported, with automatic coordinate reference system detection and reprojection.

- **Smart Well Discovery** — Match imported measurement rows to wells by ID, name, or proximity (default 100 m). New wells with usable coordinates are created on the fly, with automatic aquifer assignment and ground surface elevation lookup, so you don't have to maintain a perfect well roster before importing measurements.

- **USGS Water Level Integration** — Download well locations and water-level measurements directly from the USGS Water Data API for any region overlapping the United States, with quick-refresh and full-refresh modes for keeping a dataset current.

- **Water Quality Data** — Import water quality measurements from CSV files or download them directly from the Water Quality Portal. A built-in catalog of roughly 38 standardized parameters keeps definitions consistent across regions, with U.S. EPA Maximum Contaminant Levels and World Health Organization guideline values stored alongside each one. Region-specific custom parameters (specialized chemistry not in the catalog) are supported as well.

- **Trend Analysis** — Compute linear regression trends for every well and aquifer, with color-coded map markers indicating the rate of change.

- **Spatial Analysis** — Interpolate well data across an aquifer using Kriging or Inverse Distance Weighting (IDW). Animate the resulting raster surfaces over time, draw cross sections, and compute storage volume changes.

- **Data Imputation** — Fill gaps in sparse measurement records using Extreme Learning Machines (ELM) trained on GLDAS climate variables, with PCHIP interpolation for the segments between modeled and measured intervals.

## Who Is This For?

Aquifer Analyst is designed for hydrogeologists, water resource engineers, researchers, and students who work with groundwater monitoring data. Whether you are managing a regional monitoring network, conducting aquifer characterization, monitoring water quality compliance, or teaching groundwater concepts, the application provides an accessible, browser-based interface for the analysis workflows that come up most often in the field. It scales from a single well's measurements to regional networks of thousands.

## Getting Started

Head to the [Getting Started](getting-started.md) guide to install the app and load your first dataset. For a broader overview of the interface and the data model, see the [Overview](overview.md) page. If you're focused on water quality features specifically — the parameter catalog, smart well discovery, and the Water Quality Portal download flow — the [Water Quality Data](water-quality.md) page walks through them in detail.

## License

Aquifer Analyst is released under the [MIT License](../LICENSE).
