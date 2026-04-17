# Preparing Data

Before importing data into Aquifer Analyst, your files need to be in the correct format. This page covers the supported file types, required columns, and common formatting considerations.

## Supported File Formats

### CSV Files

Aquifer Analyst accepts **comma-separated** and **tab-separated** CSV files. The delimiter is auto-detected during import.

- Files must include a header row with column names.
- Column names are case-insensitive during mapping (e.g., `Well_ID` and `well_id` are treated the same).
- Encoding should be UTF-8. Other encodings may cause parsing issues.

### GeoJSON Files

GeoJSON files are used for region and aquifer boundaries. They should contain **Polygon** or **MultiPolygon** geometries.

- If the file includes a `crs` property, the app will auto-detect and reproject the coordinates to WGS 84.
- If no `crs` property is present, WGS 84 is assumed.

### Shapefiles

Shapefiles must be uploaded as a **ZIP archive** containing at minimum:

- `.shp` — Geometry
- `.dbf` — Attributes
- `.shx` — Index

Optionally include:

- `.prj` — Projection definition (used for CRS detection and reprojection)

If no `.prj` file is included, WGS 84 is assumed.

## Wells File

The wells file is a CSV with one row per well. Required and optional columns:

| Column | Required | Description |
|--------|----------|-------------|
| `well_id` | Yes | Unique identifier for the well |
| `lat` | Yes | Latitude in decimal degrees |
| `long` | Yes | Longitude in decimal degrees |
| `well_name` | No | Human-readable name for the well |
| `gse` | No | Ground surface elevation at the well |
| `aquifer_id` | No | Aquifer assignment (required for multi-unit regions if assigning by field) |

!!! note
    If the `gse` (ground surface elevation) column is not provided, the app can automatically look up elevations using the USGS 3DEP service (~10m resolution for US locations) or the Open-Meteo Copernicus DEM (~90m resolution for international locations).

### Example Wells CSV

```
well_id,well_name,lat,long,gse,aquifer_id
W001,North Field Well,42.3601,-71.0589,25.4,aquifer_1
W002,South Monitoring,42.3550,-71.0620,22.1,aquifer_1
W003,East Bank Well,42.3580,-71.0510,28.7,aquifer_2
```

## Measurement Files

Measurement files are CSV files with one row per observation. Each data type is stored in a separate file named `data_{code}.csv` (e.g., `data_wte.csv` for water table elevation).

| Column | Required | Description |
|--------|----------|-------------|
| `well_id` | Yes | Must match a well_id in the wells file |
| `date` | Yes | Observation date (see Date Formats below) |
| `value` | Yes | Measured value |
| `aquifer_id` | No | Aquifer assignment (can also be inferred from the wells file) |

### Example Measurement CSV

```
well_id,date,value,aquifer_id
W001,2020-01-15,18.3,aquifer_1
W001,2020-04-22,17.9,aquifer_1
W002,2020-01-20,15.6,aquifer_1
W002,2020-05-10,14.8,aquifer_1
```

### Multi-Type Import

You can import multiple data types from a single CSV file. Each measurement column should hold values for one data type, and the importer's column mapping editor will offer a target for each — a catalog parameter (nitrate, arsenic, pH, etc.), an existing custom type, a new custom type, or "skip". The mapper auto-suggests a target for each column using exact, fuzzy, and chemical-formula matching against the catalog. Bulk toggles let you include all suggested matches, only catalog matches, or none. See [Water Quality Data — CSV Upload](water-quality.md#csv-upload-and-the-column-mapping-editor) for details on the auto-detection logic.

### Depth-to-Elevation Conversion

If your measurements are recorded as **depth below ground surface** rather than elevation, the import wizard can convert them automatically. Check the "Values are depth below ground surface" option during import, and the app will compute:

```
elevation = gse - depth
```

where `gse` is the ground surface elevation from the wells file.

## Region Boundary

The region boundary defines the geographic extent of your study area. It is used for:

- Clipping the map view
- Constraining USGS well downloads
- Defining the interpolation domain

Upload as a GeoJSON file or shapefile (ZIP) containing a single Polygon or MultiPolygon geometry.

## Aquifer Boundaries

For multi-unit regions, aquifer boundaries define the subdivisions within your region. Upload as a GeoJSON or shapefile containing one or more polygons. Each feature should include an `id` or `name` attribute for identification.

For single-unit regions, the aquifer boundary is automatically generated from the region boundary.

## Date Formats

Aquifer Analyst auto-detects dates in the following formats:

| Format | Example |
|--------|---------|
| ISO 8601 | `2020-01-15` |
| US (slash) | `01/15/2020` |
| US (dash) | `01-15-2020` |
| EU (slash) | `15/01/2020` |
| EU (dash) | `15-01-2020` |
| Year-Month | `2020-01` |
| Year only | `2020` |

!!! tip
    For best results, use ISO 8601 format (`YYYY-MM-DD`). This avoids ambiguity between US and European date conventions, especially for dates where the day is 12 or less (e.g., `03/04/2020` could be March 4th or April 3rd).

If auto-detection picks the wrong format, you can manually select the correct format in the column mapper during import.

### Two-Digit Years

CSV dates with two-digit years (e.g. `01/15/86`, `15/01/24`) are pivoted at 50: years 50 through 99 map to the 1900s, and years 00 through 49 map to the 2000s. So `86` becomes 1986, `24` becomes 2024, and `49` becomes 2049. This handles the typical groundwater data range without requiring a manual format hint, but if your historical data straddles the pivot in unusual ways, double-check the parsed dates after import.

## Coordinate Reference Systems

All spatial data in Aquifer Analyst is stored in **WGS 84 (EPSG:4326)** — standard latitude and longitude. If your data uses a different CRS:

- **GeoJSON**: Include the `crs` property in the file. The app will detect and reproject automatically.
- **Shapefiles**: Include the `.prj` file in your ZIP archive. The app reads the projection definition and reprojects using the proj4 library.
- **CSV (wells and measurements with coordinates)**: The well importer and the smart-well-discovery pipeline in the measurement importer both expose a CRS picker that defaults to WGS 84. A row preview shows the first record's coordinates re-projected through the selected CRS, with a green check or amber warning indicating whether the result lands inside the region. If the WGS 84 default fails, an **Auto-detect** function tries the most likely projected CRSes for the region; the application also runs auto-detect once automatically per loaded CSV when the default WGS 84 preview lands outside the region.

!!! warning
    Auto-detection compares the first row's reprojected coordinates against the region bounds. If your CSV is empty or its first rows don't have valid coordinates, you may need to pick the CRS manually.

## Common Pitfalls

- **Mixed delimiters** — Make sure your CSV uses a consistent delimiter (all commas or all tabs). Mixing delimiters will cause column misalignment.
- **Missing well IDs** — Every measurement must reference a `well_id` that exists in the wells file. Unmatched measurements are dropped during import.
- **Inconsistent date formats** — Mixing date formats within a single file (e.g., some ISO, some US) may cause incorrect parsing.
- **Non-numeric values** — Measurement values must be numeric. Text entries like "dry" or "N/A" will cause the row to be skipped.
- **Large files** — Very large CSVs (>100,000 rows) may slow down the import wizard. Consider splitting into smaller files if performance is an issue.
