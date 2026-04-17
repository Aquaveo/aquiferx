# Preparing Data

Most data coming into Aquifer Analyst arrives in one of three forms: CSV files for wells and measurements, GeoJSON for region and aquifer boundaries, or shapefile ZIP archives for boundaries in organizations that standardized on the shapefile format long ago. The import wizards walk through each format with sensible defaults and column auto-detection, but they still need the source file itself to be well-formed. This page describes what well-formed looks like for each input, calls out the conventions the application enforces, and flags the edge cases that come up in practice.

## CSV Files

Aquifer Analyst accepts both comma-separated and tab-separated CSVs; the delimiter is detected from the first line of the file. Files must have a header row, values should be UTF-8 encoded, and column names are treated case-insensitively during mapping, so `Well_ID` and `well_id` map to the same field. Mixing delimiters within a single file (some commas, some tabs) is the most common cause of column misalignment on import.

### Wells

A wells CSV carries one row per physical well. Two columns are required — a unique identifier and a pair of coordinates — and three more are optional:

| Column | Required | Description |
|--------|----------|-------------|
| `well_id` | yes | Unique identifier for the well |
| `lat` | yes | Latitude |
| `long` | yes | Longitude |
| `well_name` | no | Human-readable name |
| `gse` | no | Ground surface elevation |
| `aquifer_id` | no | Aquifer assignment for multi-aquifer regions |

Coordinates may be in WGS 84 decimal degrees or in any common projected coordinate system — the import wizard's CRS picker handles the conversion (see [Coordinate Reference Systems](#coordinate-reference-systems) below). When `gse` is missing, the application fetches an estimate from the USGS 3DEP service for U.S. wells (around 10 m resolution) or the Open-Meteo Copernicus DEM elsewhere (around 90 m resolution); these values are good enough for the ground-surface-elevation overlay on time series charts but are not a substitute for surveyed elevations where those exist. For multi-aquifer regions, `aquifer_id` can be included explicitly or derived automatically during import by point-in-polygon against the aquifer boundaries.

A small example:

```
well_id,well_name,lat,long,gse,aquifer_id
W001,North Field Well,42.3601,-71.0589,25.4,aquifer_1
W002,South Monitoring,42.3550,-71.0620,22.1,aquifer_1
W003,East Bank Well,42.3580,-71.0510,28.7,aquifer_2
```

### Measurements

Measurement CSVs are more flexible. The application stores measurements as one file per parameter internally, but the import wizards accept either format: a single file with one parameter per column (the common case for water-quality exports), or a separate file per parameter with the parameter's values in a `value` column. The columns you need depend on whether the file also carries well-location information.

For the simplest case — a file with `well_id`, `date`, and `value`, where every `well_id` already exists in your region — three columns are required:

| Column | Required | Description |
|--------|----------|-------------|
| `well_id` | yes | Matches a well already in the region |
| `date` | yes | Sample date (see [Date Formats](#date-formats)) |
| `value` | yes | Measured value |
| `aquifer_id` | no | Optional override for the well's aquifer assignment |

When the file also carries well metadata — latitude, longitude, well name — the import wizard's smart well discovery pipeline can match rows to existing wells by ID, name, or proximity, and can create new wells on the fly for rows whose locations don't match anything. In that mode, well_id is optional as long as name or coordinates are present. The columns the wizard can use, beyond the three above, are `well_name`, `lat`, `long`, and `gse`.

The wide-format case — multiple parameters in one file — is useful for water-quality data where a sampling event measures many analytes at once:

```
well_id,date,lat,long,nitrate,arsenic,ph,conductivity
W001,2020-03-15,42.3601,-71.0589,4.2,0.0018,7.3,480
W002,2020-03-15,42.3550,-71.0620,2.1,0.0009,7.1,395
```

The column mapping editor treats each unmapped column as a candidate data type, suggests a catalog parameter or custom type for each, and lets you include or skip columns individually. The [Water Quality Data](water-quality.md#mapping-data-columns) page walks through the mapper in detail.

### Long-format water-level example

Here's a narrow example suitable for a single-parameter import where the wells already exist in the region:

```
well_id,date,value,aquifer_id
W001,2020-01-15,18.3,aquifer_1
W001,2020-04-22,17.9,aquifer_1
W002,2020-01-20,15.6,aquifer_1
W002,2020-05-10,14.8,aquifer_1
```

If your water-level values are depth below ground surface rather than elevation, the import wizard can convert them during import: the "WTE values are depth below ground surface" checkbox subtracts each depth from the corresponding well's ground surface elevation, so the stored value is always a true elevation.

## GeoJSON and Shapefiles

Region and aquifer boundaries come in as spatial data rather than tabular data, which means GeoJSON or shapefile. Both should contain polygon geometries — a single Polygon or MultiPolygon feature for a region boundary, one or more polygon features for aquifer boundaries, with each aquifer feature carrying an `id` or `name` attribute so the application has something to label it with.

GeoJSON is the simpler format. If the file includes a `crs` property, the application reprojects the coordinates into WGS 84 automatically; if the property is missing, the application assumes WGS 84. Shapefiles, which are really a small collection of files, must be uploaded as a ZIP archive containing at minimum the `.shp`, `.dbf`, and `.shx` components. Including a `.prj` file is strongly recommended even when the shapefile is already in WGS 84, because it makes the coordinate system explicit and removes any ambiguity on import. Without a `.prj`, the application falls back to WGS 84 and may place the geometry in the wrong location if the shapefile actually uses a projected system.

## Coordinate Reference Systems

All spatial data is stored internally in WGS 84 (EPSG:4326), and all visualizations use it. For GeoJSON and shapefiles the reprojection happens automatically using the coordinate metadata carried inside the file. For CSV imports — wells or measurements with latitude and longitude columns — the import wizards include a CRS picker that defaults to WGS 84 but covers every common projected system. A single-row preview under the picker shows what the first record's coordinates look like after conversion, with a green check or amber warning indicating whether the reprojected point lands inside the region.

If the WGS 84 default fails (meaning the first row reprojects to somewhere outside the region), an **Auto-detect** button tries the most likely projected systems for the region and picks the one that lands the first row inside the region boundary. The application also runs Auto-detect automatically when it detects that the default is obviously wrong, so in most cases you never touch the picker — the projected-coordinate CSV simply imports correctly.

The one case where the handling can't help you is when the source data itself is ambiguous: no coordinate metadata in the file, no `.prj` alongside the shapefile, and a CSV whose coordinates could plausibly be in two different systems. The row preview catches most of these — the point lands outside the region and a warning appears — but it's always worth a glance at the map after import to confirm the wells ended up where you expected.

## Date Formats

Dates in measurement CSVs are auto-detected. The application recognizes ISO 8601, U.S. slash (`MM/DD/YYYY`), European slash (`DD/MM/YYYY`), short-form variants of both, year-month (`YYYY-MM`), and year-only (`YYYY`) formats. Partial dates — a row that's just `2020` or `2020-06` — are filled in with January 1 or the first of the month as appropriate, since some public data sources report only the sampling year or month.

| Format | Example |
|--------|---------|
| ISO 8601 | `2020-01-15` |
| U.S. slash | `01/15/2020` |
| European slash | `15/01/2020` |
| Short U.S. | `1/15/20` |
| Short European | `15/1/20` |
| Year-month | `2020-01` |
| Year only | `2020` |

The one place auto-detection stumbles is on dates where every value has a day number of 12 or less — a format like `03/04/2020` can't be disambiguated between March 4 and April 3 without more context. When the detector falls back to the wrong guess, the column mapper offers an explicit format selector that you can override manually.

Two-digit years are pivoted at 50: `50` through `99` map to the 1900s, and `00` through `49` map to the 2000s. So `86` becomes 1986, `24` becomes 2024, and `49` becomes 2049. The pivot covers the typical groundwater data range cleanly, but if your historical data uses two-digit years across that boundary in unusual ways, it's worth spot-checking the parsed dates after import.

## Common Pitfalls

The following tend to come up more than once in practice:

**Mixed delimiters.** CSVs that use a mix of commas and tabs confuse the delimiter auto-detector and produce columns that don't align. Save from your source tool with a consistent delimiter.

**Well IDs with whitespace.** Leading or trailing spaces in `well_id` values prevent measurements from matching wells that look identical visually. The importer trims these during import, but cleaning them in the source file first avoids noise in the row preview.

**Non-numeric measurement values.** Cells containing `dry`, `N/A`, `<0.05`, or any other non-numeric value are dropped row by row during parsing. The application does not attempt to substitute detection-limit values for censored readings or zero for "dry" — if tracking those cases matters for your analysis, record them in a separate workflow.

**Projection mismatches.** When a shapefile's `.prj` is missing or a CSV's CRS picker is set wrong, the geometry lands in the wrong place on the map. The row preview and the post-import map view catch most of these; a quick visual check after any new import is a cheap safeguard.

**Very large files.** CSVs with more than a hundred thousand rows slow the import wizards' in-browser parsing noticeably. For a first-time import of a large historical dataset, consider splitting the file by year or by parameter and importing in smaller batches.
