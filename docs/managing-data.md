# Managing Data

Every import, export, and deletion in Aquifer Analyst flows through the **Import Data Hub**, a single dialog that opens when you click the Manage Data button in the toolbar. The hub is organized around the same four-level hierarchy the application uses internally — regions, aquifers, wells, measurements — with a separate card for each level and a pair of database-wide controls at the bottom for full exports and imports. This page walks through what each card does and when to reach for it.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Import Data Hub with region list on the left and action cards on the right</div>

The hub lists your existing regions down the left side, with summary statistics for the selected region — aquifer count, well count, measurement counts per data type — displayed alongside each action card on the right. Cards that don't apply to the current state appear dimmed: the aquifer card is hidden in single-aquifer regions where it isn't needed, and the measurement card's well-matching panel only kicks in if your source data carries location information.

The workflow follows the hierarchy loosely rather than strictly. You do need a region before you can add anything else to it, and multi-aquifer regions need their aquifer boundaries in place before the wells are imported so the point-in-polygon assignment has something to check against. Beyond that, the measurement importer can create new wells on the fly from lat/long-bearing source data (see [Smart Well Discovery](water-quality.md#smart-well-discovery)), so the old rule that "wells must exist before measurements" no longer holds.

## Regions

The region card has three entry points: a **New Region** button for creating a region from scratch, an **Import Region** button for loading a packaged region from a ZIP file, and an **Edit Regions** button for renaming or deleting existing regions. The card also exposes the **Export Database** and **Import Database** controls for bulk operations across every region you've loaded.

### Creating a new region

The new-region wizard takes two pieces of input: the region's metadata (a name, a length unit, and the single-vs-multi-aquifer flag) and a boundary polygon uploaded as GeoJSON or shapefile. The metadata is fixed at creation: the name becomes the folder identifier internally, the length unit determines whether elevations and depths display in feet or meters throughout the application, and the single-aquifer flag decides whether the region needs a separate aquifer layer later. The boundary file defines the extent of the region and becomes the outer clip for every map view and interpolation domain downstream.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> New region wizard showing the name, length unit, and single-aquifer options</div>

If the boundary file is already in WGS 84, it imports as-is; if it's in a projected system, the application reads the `crs` property from the GeoJSON or the `.prj` file from the shapefile ZIP and reprojects automatically. A region without an explicit CRS is assumed to be WGS 84, which is usually correct but occasionally places the boundary in the wrong part of the world if the source data was actually projected. A quick glance at the map after import catches the mistake quickly.

### Importing a packaged region

A **packaged region** is a ZIP file containing one region's worth of files — the region metadata, the boundary GeoJSON, and any aquifer boundaries, wells, and measurement files you have for it. This is the format the Download action produces when you right-click a region in the sidebar, so it's also the format you'd share with a colleague or restore from a backup. At minimum, the ZIP must contain a region metadata file and a region boundary GeoJSON; anything else is optional. If a region with the same identifier already exists, the import wizard prompts before overwriting.

### Editing regions

The region editor displays every region in a table with editable name and length-unit columns, plus a delete button. Renaming a region updates only the display name — the internal folder identifier stays on whatever it was when the region was created, since renaming that would break references in saved analyses. Length-unit changes take effect immediately in every display throughout the application. Deletion removes the region's entire folder — boundaries, wells, measurements, computed analyses — and is irreversible; the confirmation dialog is explicit about that.

### Database export and import

The two database-wide buttons operate on every region at once. **Export Database** packages every region's folder into a single ZIP for backup or transfer; **Import Database** accepts that kind of ZIP and restores the regions inside. The import offers two modes: Append skips any regions whose names already exist, and Replace deletes everything in the current database before writing the incoming regions. Replace is destructive and the confirmation dialog makes that clear.

## Aquifers

For multi-aquifer regions, the aquifer card uploads the boundary polygons that divide the region into geologic units. You provide a GeoJSON or shapefile containing one polygon feature per aquifer, with each feature carrying an `id` or `name` attribute that the application uses as the aquifer's label. The polygons don't need to tile the region perfectly — small gaps or overlaps are tolerated — but wells that fall in gaps between aquifers will end up with an empty aquifer assignment and need manual fixup later.

In single-aquifer regions, the aquifer card is dimmed and the region's one aquifer is generated automatically from the region boundary with a canned identifier. If you later discover that a region you created as single-aquifer actually needs to be split, the cleanest path is to recreate it as multi-aquifer and re-import the data; switching modes on an existing region is not supported.

The aquifer editor, opened from the pencil icon on the aquifer card, works the same way as the region editor. You can rename aquifers in place and delete them, with the same caveat that deletion is irreversible and cascades to every well and measurement assigned to the deleted aquifer.

## Wells

The wells card opens the Well Importer, which offers two paths: upload a CSV or download from the USGS Water Data API. Both produce rows in the same shared `wells.csv` file at the end, and both run through the same CRS picker and the same optional ground-surface-elevation lookup.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Well importer showing the CSV upload and USGS download options</div>

### Uploading wells from CSV

The CSV path opens a column mapper that lets you associate your file's columns with the fields the application expects: well identifier, latitude, longitude, name, ground surface elevation, and (for multi-aquifer regions) aquifer identifier. Common column names are auto-detected — a column called `Latitude` maps to `lat`, `Well_ID` to `well_id`, and so on — but you can override any mapping. For multi-aquifer regions you also choose how to assign wells to aquifers: from an `aquifer_id` column in the file, all wells to a single aquifer you select from a dropdown, or automatically by point-in-polygon against the region's aquifer boundaries. The point-in-polygon option is the most common choice because it handles the assignment without requiring the source CSV to know your region's internal aquifer coding.

The import mode toggle controls what happens when wells already exist. Append adds new wells and silently skips any whose `well_id` matches something already in the region. Replace deletes the existing wells and writes fresh from the import; if the import is scoped to a single aquifer, only that aquifer's wells are affected by the replacement.

If the source CSV doesn't carry ground surface elevations, the importer offers to fetch them from a public elevation service. U.S. wells are resolved against USGS 3DEP (~10 m resolution); wells elsewhere use the Open-Meteo Copernicus DEM (~90 m resolution). The lookups are batched for speed and the status of each batch is shown as the import runs. Automatic GSE is good enough for the ground-surface-elevation overlay on time series charts and for depth-to-elevation conversions on imported measurements, but where surveyed elevations exist, including them in the source CSV is always preferable.

### Downloading wells from USGS

For regions that overlap the United States, the **Download from USGS** option pulls well metadata directly from the USGS Water Data API's monitoring-locations registry, filtered to groundwater sites within the region's bounding box. The wizard offers two scopes: the entire region, which pulls every groundwater well USGS monitors inside the region boundary, or a single aquifer, which narrows to that aquifer's bounding box. In both cases the returned wells are auto-assigned to aquifers by point-in-polygon and import in Append mode by default.

When USGS wells already exist in the region, the wizard offers a **Refresh** option that identifies only sites USGS has added since your last download and appends them, so re-running the download periodically keeps your well inventory current without duplicates.

## Measurements

The measurements card opens the Measurement Importer, which offers up to three data-source tabs across the top depending on what the region supports:

- **Upload CSV** is always available.
- **USGS Levels** appears when the region overlaps the United States and at least one well exists. It downloads water-level measurements only.
- **Water Quality (WQP)** appears when the region overlaps the United States and downloads water quality data from the Water Quality Portal.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Measurement importer with the three data source tabs visible</div>

All three paths feed the same downstream machinery — the smart well discovery pipeline, the data quality cleanup, the append/replace logic — so once you've learned the workflow for one, the others differ mainly in where the rows come from. The [Water Quality Data](water-quality.md) page walks through the WQP download and the column mapping editor that CSV uploads rely on. What follows is a summary.

### Uploading measurements from CSV

The CSV path starts with the upload itself and an optional checkbox labeled **"Measurements file includes well locations."** If your file carries per-row latitude and longitude (or at least a well name), checking the box enables smart well discovery: the importer matches rows to existing wells by ID, by name, or by proximity (100 m by default, adjustable), and creates new wells on the fly for rows whose coordinates don't match anything. Leaving the box off is appropriate when the source file uses only `well_id` and expects those IDs to already exist in the region.

The wizard then guides you through two mapping panels. The **Map Structural Columns** panel handles well ID, date, coordinates, name, and aquifer ID; the **Map Data Columns** panel handles the measurement columns themselves. For each measurement column, the mapper proposes a target — a catalog parameter like nitrate, an existing custom type in your region, a new custom type you create on the fly, or "skip" — using a mix of exact, fuzzy, and chemical-formula matching against the parameter catalog. Catalog matches are pre-checked because they're usually safe; new custom types are pre-unchecked because creating one is a deliberate decision. Bulk toggles at the top of the panel (**Include all**, **Only catalog matches**, **None**) make the 20-column case fast.

The import mode controls what happens when the region already has data for a parameter being imported. Append adds new records and skips duplicates by well-and-date match, preserving existing data; Replace deletes the existing data for each parameter being imported and rewrites it from the file, leaving other parameters untouched.

If the values in a water-level column are actually depth below ground surface rather than elevation, a checkbox on the WTE mapping row converts them during import using each well's ground surface elevation.

### Downloading water levels from USGS

The USGS Levels tab downloads water-level measurements for wells that have a USGS site identifier, using the same API as the USGS well download but operating on the measurements side. The depth-below-surface readings that USGS reports are converted to water-table elevations on the way in using each well's stored ground surface elevation.

When water-level data already exists in the region, the tab offers two refresh modes. **Quick Refresh** fetches everything but keeps only records newer than your most recent existing measurement, which is the fast way to pick up the last few weeks or months of new readings without redownloading history. **Full Refresh** fetches everything and merges it with your existing data, overwriting matching dates; this catches backfills where USGS posted corrected values for old records after the fact. A quality report after the download summarizes how many records were kept, how many partial dates were filled in to a full date, and how many were dropped as invalid.

### Downloading water quality from WQP

The Water Quality (WQP) tab downloads analytical results from the Water Quality Portal — a federated source that aggregates data from USGS, EPA, and 400+ other public and private monitoring programs. The workflow differs from USGS Levels in that you pick *which* parameters to download from a catalog-backed multi-select (the "USGS Levels" flow only handles water-level data, so there's nothing to pick). You also choose a date range, a source filter (all agencies or USGS-only), and a spatial scope (all aquifers in the region or a specific one), and an **Estimate** button runs a count query so you can see how much data WQP is about to return before committing.

The full WQP workflow — the parameter picker, the polygon clip, the sample-fraction filter, the Estimate-vs-actual discrepancy, the cleanup report — is covered in depth on the [Water Quality Data](water-quality.md#downloading-from-the-water-quality-portal) page.

## Custom Data Types

The data types card opens the Data Type Editor. Its scope is narrower than the name suggests: it manages only the **custom, non-catalog** data types for the current region. Standard water quality parameters — nitrate, arsenic, pH, dissolved oxygen, and the rest of the roughly 38 parameters in the built-in catalog — appear automatically in the data type dropdown once you've imported data for them and cannot be edited here.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Data Type Editor showing the customs table, the add-custom form, and the Browse Catalog link</div>

A custom type is appropriate for parameters that aren't in the catalog — specialized organic compounds like trichloroethane, parameters reported using non-standard conventions like hardness expressed as CaCO3, or any region-specific chemistry. Adding one takes a name (e.g. "BOD5"), a short code that becomes the parameter's identifier (auto-generated from the name, editable, must be lowercase alphanumeric plus underscores), and a unit. The editor blocks any custom code that collides with a catalog code with a prompt suggesting you import the column as the catalog parameter instead — it's almost always the right move, since the catalog's global standardization is what keeps cross-region work coherent.

A **Browse Catalog** link on the editor opens the read-only catalog viewer so you can check whether a parameter you're about to add as a custom is already covered by a catalog entry. When other regions in your database have custom types that the current region doesn't, quick-add buttons appear alongside the form — useful for keeping codes consistent across regions for parameters like TCE or region-specific indicator species.

A custom type recorded in the editor doesn't appear in the data type dropdown until you actually import data for it; the convention that "a parameter exists when data exists" applies equally to catalog and custom types.

## Deleting and Downloading

Deletion and download controls appear in the context menus that open when you right-click an item in the sidebar tree. The available actions depend on what you right-clicked:

On a **region**, the context menu offers rename, show/hide, download, and delete. The download action packages the region's entire folder into a ZIP file named after the region and streams it to your browser's downloads folder. Delete removes the region and all of its contents with a confirmation prompt; a progress bar shows while the deletion runs because regions with many measurement files can take a few seconds.

On an **aquifer**, the context menu offers rename and delete. Delete removes the aquifer and cascades to every well and measurement assigned to it.

On a **computed raster or imputation model**, the context menu offers rename, get info, and delete. Rename and delete are self-explanatory; get info opens a modal with the parameters the analysis was run with (date range, interpolation method, number of source observations, and so on).

The hub also provides a deletion path for individual measurement files — the trash icon on each entry in the region's measurement breakdown — in case you want to drop one parameter from a region without touching the rest.
