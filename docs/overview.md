# Overview of the App

AquiferX is a single-page web application built with React and TypeScript. It runs entirely in the browser with a lightweight Vite development server that also provides file-based API endpoints for reading and writing data. There is no separate backend database — all data is stored as files on disk.

## Interface Layout

The application is organized into four main areas:

<!-- screenshot: Annotated full interface showing all four areas -->

1. **Toolbar** — The top bar contains action buttons and selectors:
    - **Data Type Selector** — Switch between measurement types (e.g., Water Table Elevation, salinity).
    - **Manage Data** — Open the Import Data Hub.
    - **Trend Analysis** — Toggle trend analysis mode.
    - **Spatial Analysis** — Launch the spatial analysis wizard.
    - **Impute Data** — Launch the imputation wizard.
    - **Export CSV** — Download the current time series data as CSV.
    - **Expand Chart** — Open the time series chart in a floating, resizable window.

2. **Sidebar** — A hierarchical tree on the left displaying:
    - **Regions** at the top level
    - **Aquifers** nested under each region
    - **Wells** nested under each aquifer
    - **Raster Analyses** listed under the selected aquifer
    - **Imputation Models** listed under the selected aquifer
    - Right-click context menus for editing, renaming, deleting, and downloading.

3. **Map** — An interactive Leaflet map in the center showing:
    - Region and aquifer boundaries
    - Well locations as colored markers
    - Raster overlays when a spatial analysis is active
    - Eight basemap options (OpenStreetMap, Esri Imagery, Topographic, and more)

4. **Time Series Chart** — A Recharts-based chart below the map displaying:
    - Measurement data for selected well(s)
    - PCHIP or linear interpolation curves
    - Optional trend lines, ground surface elevation, and smoothing overlays

## Data Hierarchy

AquiferX organizes data in a four-level hierarchy:

```
Region
├── Aquifer(s)
│   ├── Well(s)
│   │   └── Measurement(s)
│   ├── Raster Analyses
│   └── Imputation Models
```

- **Region** — A geographic area of interest defined by a boundary polygon. Contains metadata such as the name, length unit (feet or meters), and whether it uses a single aquifer or multiple aquifers.
- **Aquifer** — A subdivision within a region, defined by a boundary polygon. In single-unit regions, one aquifer is created automatically and the aquifer level is hidden in the UI.
- **Well** — A monitoring well with a geographic location (latitude/longitude), optional ground surface elevation (GSE), and an aquifer assignment.
- **Measurement** — A time-stamped value recorded at a well (e.g., water table elevation, salinity).

## Data Types

Every measurement in AquiferX belongs to a **data type**. The app ships with one built-in type:

| Code | Name | Description |
|------|------|-------------|
| `wte` | Water Table Elevation | The primary measurement type — water level relative to a datum |

You can create additional custom data types (e.g., `salinity`, `ph`, `nitrate`) through the Data Type Editor. Each data type has:

- **Code** — A unique identifier (lowercase alphanumeric + underscore, max 20 characters). The code determines the data file name: `data_{code}.csv`.
- **Name** — A human-readable label displayed in the UI.
- **Unit** — The measurement unit (e.g., `ft`, `m`, `ppm`, `mg/L`).

The toolbar's data type selector lets you switch between types. The map, chart, and sidebar all update to reflect the selected data type.

## File Storage

All data lives in the `public/data/` directory, organized by region:

```
public/data/
└── {region-id}/
    ├── region.json          # Region metadata
    ├── region.geojson       # Region boundary polygon
    ├── aquifers.geojson     # Aquifer boundary polygons
    ├── wells.csv            # Well locations
    ├── data_wte.csv         # Water table elevation measurements
    ├── data_salinity.csv    # Custom data type measurements
    ├── {aquifer-slug}/
    │   ├── raster_wte_*.json    # Spatial analysis results
    │   └── model_wte_*.json     # Imputation model results
```

Each region folder is self-contained. You can back up, share, or delete a region by working with its folder directly.

## Single-Unit vs. Multi-Unit Regions

When creating a region, you choose between:

- **Multi-unit** — The region contains multiple aquifer subdivisions. You upload aquifer boundaries separately and assign wells to aquifers during import.
- **Single-unit** — The region is treated as a single aquifer. An aquifer is created automatically from the region boundary. The aquifer level is hidden in the sidebar and import wizards to simplify the workflow.

## Coordinate Reference Systems

AquiferX works in WGS 84 (EPSG:4326) — standard latitude/longitude coordinates. When you upload spatial data in a different coordinate reference system, the app automatically detects and reprojects:

- **GeoJSON** — CRS detected from the `crs` property in the file.
- **Shapefiles** — CRS detected from the `.prj` file included in the ZIP archive.

Reprojection uses the [proj4](https://github.com/proj4js/proj4js) library. If the CRS cannot be detected, the app assumes WGS 84.
