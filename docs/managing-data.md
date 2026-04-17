# Managing Data

All data import, export, and deletion in Aquifer Analyst flows through the **Import Data Hub** — a central dialog accessed by clicking the **Manage Data** button in the toolbar.

<!-- screenshot: Import Data Hub showing region list and action buttons -->

## Import Data Hub

The hub follows a **hub-and-spoke** pattern. It displays a list of your existing regions along with summary statistics (aquifer count, well count, and measurement count per data type). From here, you launch focused sub-wizards for each type of import.

The workflow is hierarchical, but not as rigid as it once was. You must have a region before adding aquifers, and aquifers before wells in multi-unit regions, but the **measurement importer can now create wells on the fly** when source data carries lat/long — see [Smart Well Discovery](water-quality.md#smart-well-discovery). The hub shows the steps in their typical order:

1. **Region** — Create, import, edit, or delete a region
2. **Aquifer** — Upload, edit, or delete aquifer boundaries (multi-unit regions only)
3. **Well** — Upload well locations or download from USGS
4. **Measurement** — Upload from CSV, download water levels from USGS, or download water quality data from the Water Quality Portal (WQP)
5. **Data Types** — Manage custom (non-catalog) measurement types for the region

Sections that aren't applicable to the current state (e.g., the aquifer card in single-unit regions) appear dimmed in the hub. The measurements card is always available — when no wells exist, the importer can bootstrap them from a CSV with lat/long columns or from a WQP download.

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

- `region.json` — Region metadata (id, name, length unit, single-unit flag, custom data types)
- `region.geojson` — Region boundary polygon

It may also include `aquifers.geojson`, `wells.csv`, and any `data_*.csv` files. If a region with the same ID already exists, you will be prompted to overwrite.

### Database Export & Import

The hub also supports full database operations:

- **Export Database** — Downloads a ZIP containing all regions and their data files.
- **Import Database** — Upload a ZIP to restore regions. Choose **Append** mode (skip existing regions by name) or **Replace** mode (delete all existing data first).

## Editing Regions

Click **Edit Regions** next to the Add Region button to open the region editor. This button appears when at least one region exists.

The editor displays a table of all regions with editable fields:

- **Name** — Edit the region's display name. Names must be non-empty and unique.
- **Length Unit** — Switch between feet and meters.
- **Delete** — Click the red trash can icon to delete a region. A confirmation dialog warns that this is irreversible and will permanently remove all aquifers, wells, and measurements associated with the region. A progress bar is shown while the deletion runs.

Name and unit changes are not applied until you click **Save**. Deletions take effect immediately upon confirmation. Click **Cancel** to discard unsaved name and unit changes.

!!! note
    Renaming a region changes its display name only. The internal folder ID (derived from the original name) is not affected.

## Aquifer Import

For multi-unit regions, click the aquifer section in the hub to upload aquifer boundary polygons.

Upload a GeoJSON or shapefile (ZIP) containing one or more polygon features. Each feature should have an `id` or `name` attribute. The app reprojects coordinates to WGS 84 if a CRS is detected.

!!! note
    In single-unit regions, the aquifer section is dimmed. A single aquifer is automatically created from the region boundary with `aquifer_id = 0`.

## Editing Aquifers

For multi-unit regions, click the pencil icon in the aquifer card to open the aquifer editor. This button appears when the selected region has at least one aquifer.

The editor displays a table of aquifers for the current region:

- **Name** — Edit the aquifer's display name. Names must be non-empty and unique.
- **Delete** — Click the red trash can icon to delete an aquifer. A confirmation dialog warns that this is irreversible and will permanently remove all wells and measurements associated with the aquifer. A progress bar is shown while the deletion runs.

Name changes are not applied until you click **Save**. Deletions take effect immediately upon confirmation.

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

Click the measurements section in the hub to launch the Measurement Importer. The importer offers up to three data sources at the top, depending on the region:

- **Upload CSV** — universally available; ingests any tabular file you have on disk.
- **USGS Levels** — visible when the region overlaps the United States and at least one well exists; downloads water-level measurements only.
- **Water Quality (WQP)** — visible when the region overlaps the United States; downloads water quality data from the Water Quality Portal.

The remainder of this section covers the upload path in summary form. For the catalog model, smart well discovery, the column mapping editor, and the WQP download flow in detail, see [Water Quality Data](water-quality.md).

<!-- screenshot: Measurement importer showing the three data source tabs -->

### Uploading from CSV

1. Upload a CSV file with measurement data.
2. If your file carries per-row well locations (lat/long or well names), check **"Measurements file includes well locations"** to enable smart well discovery. The importer will match rows to existing wells by ID, name, or proximity, and create new wells on the fly for unmatched coordinates. See [Smart Well Discovery](water-quality.md#smart-well-discovery).
3. Map structural columns (`well_id`, `date`, optionally `lat`, `long`, `well_name`, `aquifer_id`) in the **Map Structural Columns** panel.
4. Use the **Map Data Columns** panel to assign each remaining column to a data type. The importer suggests a target for each — a catalog parameter, an existing custom type, a new custom type, or skip — using exact, fuzzy, and chemical-formula matching against the catalog. Bulk toggles (Include all / Only catalog matches / None) make the multi-column case fast.
5. Choose an import mode:
    - **Append** — Add new records, skip duplicates (by `well_id` + `date`).
    - **Replace** — Delete all existing data for the included types and import fresh.

The column mapping editor reverses the older "pick types first, then map columns" flow. You no longer need to declare data types in advance — every catalog parameter is implicitly available, and new custom types are created on the fly when you assign a column to them.

### Depth-to-Elevation Conversion

If WTE values in your file are depth below ground surface rather than elevation, check **"WTE values are depth below ground surface"** in the data column mapping panel. The app converts each value:

```
elevation = gse - depth
```

using the GSE from the wells file, looked up by `well_id`.

### USGS Water Level Download

For regions with USGS wells, the **USGS Levels** tab downloads water-level measurements directly:

- **Quick Refresh** (default when appending to existing data) — Fetches all records but keeps only those newer than the latest existing measurement date.
- **Full Refresh** — Fetches all records and merges with existing data, updating matching dates and backfilling new ones.

USGS data undergoes automatic quality processing:

- Partial dates (e.g., `2020` or `2020-06`) are completed to full dates.
- Invalid dates and extreme values are flagged and dropped.
- A **Quality Report** summarizes how many records were kept, fixed, or dropped, with reasons.

After download, you can optionally trim the date range before importing.

!!! tip
    USGS measurements are reported as depth below land surface. The importer automatically converts these to water table elevation using each well's GSE.

### Water Quality Portal Download

For regions overlapping the United States, the **Water Quality (WQP)** tab downloads analytical water quality results — nitrate, arsenic, pH, and dozens more — from the federated Water Quality Portal. The flow is built around the global parameter catalog: you pick the parameters you want from a catalog-backed multi-select, set a date range, choose a scope (all aquifers in the region or a specific one), and the importer fetches stations and results in parallel. A polygon clip after fetch keeps only stations inside the chosen aquifer polygon(s), and a per-parameter sample-fraction filter plus take-first deduplication produces clean rows ready for the well-matching pipeline. See [Water Quality Portal Download](water-quality.md#water-quality-portal-wqp-download) for the full workflow.

## Column Mapper

The Column Mapper modal appears during well and measurement imports. It presents your CSV's detected columns alongside the expected fields.

<!-- screenshot: Column mapper modal showing dropdown mapping -->

For each required field (marked with a red asterisk), select the matching column from your CSV using the dropdown. The mapper auto-detects common column names (e.g., `latitude` maps to `lat`), but you can override any mapping.

For measurement imports, a **Date Format** selector lets you manually specify the date format if auto-detection picks the wrong one.

## Data Type Editor

The Data Type Editor manages **custom (non-catalog) data types** for the current region. Standard water quality parameters — nitrate, arsenic, pH, and ~35 others — live in the global catalog (`public/data/catalog_wq.json`) and appear automatically in the data type dropdown once you import a column matching one of them; they are not managed here.

The editor includes a **Browse Catalog** link that opens a read-only viewer of every catalog entry, so you can check whether a parameter you're about to add as a custom is already covered.

<!-- screenshot: Data Type Editor showing list of customs with add/edit/delete -->

### Adding a Custom Type

1. Enter a **Name** (e.g., "BOD5", "Trichloroethane").
2. A **Code** is auto-generated from the name. You can override it manually. Codes must be lowercase alphanumeric plus underscores, max 20 characters, and **cannot collide with any catalog code**. The editor blocks collisions with a suggestion to import the column as the catalog parameter instead.
3. Enter the **Unit** (e.g., `mg/L`, `ppm`, `μg/L`).
4. Click Save. The custom type is recorded in `region.json`. It will appear in the data type dropdown once a `data_{code}.csv` file exists for it — created automatically when you import measurements for this type.

The `wte` code is reserved and cannot be used.

### Cross-Region Suggestions

If other regions in your database have custom data types, the editor shows **quick-add buttons** for types not yet defined in the current region. This is useful for keeping codes consistent across regions when a region-specific parameter applies to several places (e.g. one region's `tce` becomes a one-click add in another).

## Delete and Download Operations

### Deleting Data

From the sidebar context menu or the Import Data Hub, you can:

- **Delete a measurement file** — Removes a single `data_{code}.csv` file.
- **Delete an aquifer** — Removes the aquifer and reassigns or deletes associated wells.
- **Delete a region** — Removes the entire region folder and all its contents (boundaries, wells, measurements, analyses). A confirmation dialog warns about this irreversible action.

### Downloading Data

- **Download a region** — Right-click a region in the sidebar and select "Download". This generates a ZIP containing all files for that region.
- **Export database** — From the Import Data Hub, export all regions as a single ZIP archive.
