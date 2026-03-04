# Managing Data

All data import, export, and deletion in AquiferX flows through the **Import Data Hub** — a central dialog accessed by clicking the **Manage Data** button in the toolbar.

<!-- screenshot: Import Data Hub showing region list and action buttons -->

## Import Data Hub

The hub follows a **hub-and-spoke** pattern. It displays a list of your existing regions along with summary statistics (aquifer count, well count, and measurement count per data type). From here, you launch focused sub-wizards for each type of import.

The workflow is hierarchical — you must have a region before you can add aquifers, aquifers before wells (in multi-unit regions), and wells before measurements:

1. **Region** — Create or import a region
2. **Aquifer** — Upload aquifer boundaries (multi-unit regions only)
3. **Well** — Upload well locations or download from USGS
4. **Measurement** — Upload measurement data or download from USGS
5. **Data Types** — Create and manage custom measurement types

Sections that are not yet available (e.g., measurements when no wells exist) appear dimmed in the hub.

## Region Import

### Creating a New Region

Click **New Region** in the Import Data Hub to launch the region creation wizard.

<!-- screenshot: New region wizard showing name, unit, and single-unit options -->

**Step 1: Region Details**

- **Name** — A descriptive name for the region (e.g., "High Plains Aquifer").
- **Length Unit** — Choose between feet (`ft`) or meters (`m`). This affects all elevation and depth displays.
- **Single-unit region** — Check this box if the region contains a single aquifer. The aquifer section will be hidden in the sidebar and import wizards, and an aquifer boundary is automatically created from the region boundary.

**Step 2: Upload Boundary**

Upload a GeoJSON file or shapefile (ZIP) containing the region boundary polygon. The app auto-detects the CRS and reprojects to WGS 84 if needed.

### Importing a Packaged Region

You can import a pre-packaged region from a ZIP file. The ZIP must contain at minimum:

- `region.json` — Region metadata (id, name, length unit, data types)
- `region.geojson` — Region boundary polygon

It may also include `aquifers.geojson`, `wells.csv`, and any `data_*.csv` files. If a region with the same ID already exists, you will be prompted to overwrite.

### Database Export & Import

The hub also supports full database operations:

- **Export Database** — Downloads a ZIP containing all regions and their data files.
- **Import Database** — Upload a ZIP to restore regions. Choose **Append** mode (skip existing regions by name) or **Replace** mode (delete all existing data first).

## Aquifer Import

For multi-unit regions, click the aquifer section in the hub to upload aquifer boundary polygons.

Upload a GeoJSON or shapefile (ZIP) containing one or more polygon features. Each feature should have an `id` or `name` attribute. The app reprojects coordinates to WGS 84 if a CRS is detected.

!!! note
    In single-unit regions, the aquifer section is dimmed. A single aquifer is automatically created from the region boundary with `aquifer_id = 0`.

## Well Import

Click the wells section in the hub to launch the Well Importer. Wells can be loaded from a CSV file or downloaded from the USGS Water Data API.

<!-- screenshot: Well importer showing CSV upload and USGS download options -->

### Uploading from CSV

1. Upload a CSV file containing well locations.
2. The **Column Mapper** modal opens (see below) where you map your CSV columns to the required fields: `well_id`, `lat`, `long`, and optionally `well_name`, `gse`, `aquifer_id`.
3. Choose an aquifer assignment method (for multi-unit regions):
    - **CSV field** — Use the `aquifer_id` column in your file.
    - **Single aquifer** — Assign all wells to one selected aquifer.
    - **By location** — Automatically assign each well to the aquifer whose boundary contains it (point-in-polygon test).
4. Choose an import mode:
    - **Append** — Add new wells, skip duplicates (by `well_id`).
    - **Replace** — Delete existing wells and import fresh. If scoped to an aquifer, only that aquifer's wells are replaced.

### GSE Interpolation

If your data does not include ground surface elevation (GSE), the app offers automatic elevation lookup:

- **US wells**: Queries the USGS 3DEP elevation service (~10m resolution).
- **Non-US wells**: Queries the Open-Meteo Copernicus DEM (~90m resolution).

Requests are batched with 5 concurrent fetches for performance.

### USGS Well Download

If your region overlaps the United States, the well importer offers a **Download from USGS** option:

1. Choose the download scope:
    - **Entire region** — Downloads all USGS groundwater monitoring sites within the region bounds.
    - **Selected aquifer** — Downloads sites within the selected aquifer bounds.
2. Wells are auto-assigned to aquifers by point-in-polygon matching.
3. If USGS wells already exist, a **Refresh** option appears that identifies new wells not yet in your dataset and appends only the new ones.

## Measurement Import

Click the measurements section in the hub to launch the Measurement Importer. Like wells, measurements can be uploaded from CSV or downloaded from USGS.

<!-- screenshot: Measurement importer showing file upload and options -->

### Uploading from CSV

1. Upload a CSV file with measurement data.
2. Map columns using the **Column Mapper**: `well_id`, `date`, `value`, and optionally `aquifer_id`.
3. Select the target data type (e.g., Water Table Elevation).
4. Choose an import mode:
    - **Append** — Add new records, skip duplicates (by `well_id` + `date` + `aquifer_id`).
    - **Replace** — Delete all existing data for the selected type and import fresh.

### Multi-Type Import

Check **"Import multiple data types from one CSV"** to import several measurement types from a single file. Select the types you want to import and map each to its own CSV column. The app saves each type to its own `data_{code}.csv` file.

### Depth-to-Elevation Conversion

If your measurements are depth below ground surface rather than elevation, check **"Values are depth below ground surface"**. The app converts each value:

```
elevation = gse - depth
```

using the GSE from the wells file, looked up by `well_id`.

### USGS Measurement Download

For regions with USGS wells, the measurement importer can download water-level measurements directly:

- **Quick Refresh** (default when appending to existing data) — Fetches all records but keeps only those newer than the latest existing measurement date.
- **Full Refresh** — Fetches all records and merges with existing data, updating matching dates and backfilling new ones.

USGS data undergoes automatic quality processing:

- Partial dates (e.g., `2020` or `2020-06`) are completed to full dates.
- Invalid dates and extreme values are flagged and dropped.
- A **Quality Report** summarizes how many records were kept, fixed, or dropped, with reasons.

After download, you can optionally trim the date range before importing.

!!! tip
    USGS measurements are reported as depth below land surface. The importer automatically converts these to water table elevation using each well's GSE.

## Column Mapper

The Column Mapper modal appears during well and measurement imports. It presents your CSV's detected columns alongside the expected fields.

<!-- screenshot: Column mapper modal showing dropdown mapping -->

For each required field (marked with a red asterisk), select the matching column from your CSV using the dropdown. The mapper auto-detects common column names (e.g., `latitude` maps to `lat`), but you can override any mapping.

For measurement imports, a **Date Format** selector lets you manually specify the date format if auto-detection picks the wrong one.

## Data Type Editor

The Data Type Editor lets you create and manage custom measurement types beyond the built-in Water Table Elevation (WTE).

<!-- screenshot: Data Type Editor showing list of types with add/edit/delete -->

### Adding a Data Type

1. Enter a **Name** (e.g., "Salinity").
2. A **Code** is auto-generated from the name (e.g., `salinity`). You can override it manually. Codes must be lowercase alphanumeric plus underscores, max 20 characters.
3. Enter the **Unit** (e.g., `ppm`, `mg/L`).
4. Click Save. A new `data_{code}.csv` file will be created when you import measurements for this type.

The `wte` code is reserved and cannot be deleted or reassigned.

### Cross-Region Suggestions

If other regions in your database have custom data types, the editor shows **quick-add buttons** for types not yet defined in the current region.

## Delete and Download Operations

### Deleting Data

From the sidebar context menu or the Import Data Hub, you can:

- **Delete a measurement file** — Removes a single `data_{code}.csv` file.
- **Delete an aquifer** — Removes the aquifer and reassigns or deletes associated wells.
- **Delete a region** — Removes the entire region folder and all its contents (boundaries, wells, measurements, analyses). A confirmation dialog warns about this irreversible action.

### Downloading Data

- **Download a region** — Right-click a region in the sidebar and select "Download". This generates a ZIP containing all files for that region.
- **Export database** — From the Import Data Hub, export all regions as a single ZIP archive.
