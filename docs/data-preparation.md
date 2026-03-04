# Preparing Data

Before importing data into AquiferX, your files need to be in the correct format. This page covers the supported file types, required columns, and common formatting considerations.

## Supported File Formats

### CSV Files

AquiferX accepts **comma-separated** and **tab-separated** CSV files. The delimiter is auto-detected during import.

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

You can also import multiple data types from a single CSV file. In this case, each data type should be in its own column, and you will map each column to a data type during import.

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

AquiferX auto-detects dates in the following formats:

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

## Coordinate Reference Systems

All spatial data in AquiferX is stored in **WGS 84 (EPSG:4326)** — standard latitude and longitude. If your data uses a different CRS:

- **GeoJSON**: Include the `crs` property in the file. The app will detect and reproject automatically.
- **Shapefiles**: Include the `.prj` file in your ZIP archive. The app reads the projection definition and reprojects using the proj4 library.
- **CSV (wells)**: Latitude and longitude columns must already be in WGS 84 decimal degrees.

!!! warning
    If the app cannot detect the CRS from your file, it assumes WGS 84. Wells or boundaries will appear in the wrong location if the coordinates are actually in a projected system (e.g., UTM, State Plane).

## Common Pitfalls

- **Mixed delimiters** — Make sure your CSV uses a consistent delimiter (all commas or all tabs). Mixing delimiters will cause column misalignment.
- **Missing well IDs** — Every measurement must reference a `well_id` that exists in the wells file. Unmatched measurements are dropped during import.
- **Inconsistent date formats** — Mixing date formats within a single file (e.g., some ISO, some US) may cause incorrect parsing.
- **Non-numeric values** — Measurement values must be numeric. Text entries like "dry" or "N/A" will cause the row to be skipped.
- **Large files** — Very large CSVs (>100,000 rows) may slow down the import wizard. Consider splitting into smaller files if performance is an issue.
