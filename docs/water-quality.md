# Water Quality Data

Aquifer Analyst was originally built around water-level measurements, where the only "data type" was water table elevation (WTE). The application now also handles a much broader set of water quality (WQ) parameters — pH, nitrate, arsenic, dissolved oxygen, and dozens more — through a separate but tightly integrated set of features. This page describes the model that makes WQ data work, the import paths that get it into a region, and the conventions that keep the data consistent across regions and across time.

WQ data is fundamentally different from water-level data in three ways that the application has to accommodate. **First**, every WQ measurement is keyed by a parameter (the substance being measured), where each parameter has its own unit, regulatory thresholds, and data conventions; a single value like `5.2` is meaningless without knowing whether it's mg/L of nitrate or μS/cm of conductivity. **Second**, WQ data is sparser and more irregular than water-level data — many wells have only a handful of WQ samples spread over decades, and the parameters measured at one well may differ entirely from the parameters measured at a neighbor. **Third**, public WQ data lives across many agencies (USGS, EPA, state programs, tribal nations), while water-level data in the United States is centralized at USGS. These three differences shape every design decision below.

## The Parameter Catalog

At the heart of the WQ feature set is a single file: `public/data/catalog_wq.json`. This file is the **global parameter catalog**, a curated list of standardized water quality parameters that every region implicitly inherits. It defines roughly 38 of the most commonly measured groundwater quality parameters, along with the metadata each one needs to be reported, plotted, and compared consistently across regions.

### Why the catalog exists

Before the catalog, every region maintained its own list of data types. If one region called the parameter "Nitrate" with units of `mg/L` and another called it "NO3-N" with units of `mg/L as N`, neither comparisons across regions nor any kind of bulk analysis worked cleanly. Worse, importing CSVs with the same chemistry but different column names produced fragmented data files in different regions. The catalog promotes the most common WQ parameters to a shared vocabulary so that nitrate is nitrate everywhere — same code, same name, same unit, same regulatory references.

### Anatomy of a catalog entry

Each catalog entry is an object keyed by a short code (e.g. `nitrate`, `arsenic`, `ph`). The shape is:

```json
{
  "name": "Nitrate",
  "unit": "mg/L",
  "group": "Nutrient",
  "mcl": 10,
  "who": 50,
  "wqp": {
    "characteristicName": "Nitrate",
    "sampleFraction": "Filtered"
  }
}
```

The fields serve distinct purposes. The **name** is what shows up in the user interface — it should match the chemistry community's preferred term. The **unit** is the canonical reporting unit; values are stored and displayed in this unit, and any download that arrives in a different unit is flagged for the user (the application does not silently convert, since unit conversion for some parameters depends on context like pH or temperature). The **group** organizes parameters into categories (Physical, Nutrient, Major Ion, Minor Metal, Microbiological, etc.) so the catalog browser and parameter picker can collapse them into manageable sections.

The **mcl** and **who** fields hold the U.S. EPA Maximum Contaminant Level and World Health Organization drinking-water guideline, when those exist for the parameter. They are reference values displayed in the catalog browser; future versions of the chart UI may overlay these as horizontal threshold lines. A `null` value means no formal threshold is published for that parameter (e.g. pH and temperature have no MCL, since the relevant question is a range rather than a maximum).

The **wqp** block is the bridge to the Water Quality Portal (WQP) data source, described in detail later on this page. It contains the exact `CharacteristicName` string WQP uses to identify the parameter and a preferred `sampleFraction` (typically `"Filtered"` for dissolved species like metals and major ions, `null` for parameters where filtration is irrelevant like pH and temperature). Catalog entries without a `wqp` block can still be used for CSV imports but cannot be downloaded from WQP.

### Catalog parameters versus custom parameters

The application recognizes two kinds of data types in any given region. **Catalog parameters** are the standardized entries described above; their definitions live in the catalog and cannot be overridden per region. **Custom parameters** are non-catalog data types specific to a region — typically chemistry that's either too specialized for the catalog (e.g. specific organic compounds like trichloroethane) or that uses a non-standard reporting convention (e.g. hardness reported as CaCO3 instead of as Ca, Mg). Custom parameters live in each region's `region.json` under a field called `customDataTypes`, and they appear alongside catalog parameters wherever data type pickers show up in the UI.

The split exists because the value proposition of catalog parameters is *consistency* (so cross-region work is meaningful) while custom parameters exist for *flexibility* (so a region can track whatever its data actually contains). The application enforces this split with a hard rule: a custom parameter's code cannot collide with a catalog code. If you try to add a custom called `nitrate`, the data type editor will reject it and suggest you import your data as the catalog parameter instead.

### The "data exists when the file exists" model

A subtle but important rule governs which parameters appear as "available" in any given region. The catalog defines roughly 38 standardized parameters globally, but only a handful are typically relevant to any one region. Aquifer Analyst resolves this by treating the catalog as a *menu of possibilities*: a catalog parameter is considered to "exist" in a region only when its data file is on disk. Concretely, if `public/data/oregon-coast/data_nitrate.csv` exists, then nitrate is part of Oregon Coast's effective data type list and appears in the parameter dropdown; if it doesn't, nitrate isn't shown.

This means there is **no way to pre-declare a data type**. You cannot tell the application "I'll be importing nitrate data soon" — the data type comes into existence when the CSV file does. This eliminates an entire class of stale-metadata bugs that the older model suffered from (where regions accumulated data type entries that pointed at empty or missing files). It also means the data type editor is now narrower in scope: it only manages custom (non-catalog) parameters, since catalog parameters are managed implicitly by file presence.

### Browsing the catalog

A read-only catalog browser is available from two places in the UI: the **Browse Catalog** link inside the data type editor, and the **View Catalog** link inside the measurement importer's column mapping panel. The browser groups parameters by category, supports search by name / code / WQP characteristic, and shows the MCL / WHO values alongside the `wqp` mapping for each row. The browser is informational — it doesn't have add or edit actions — because the catalog is checked into the codebase, not a per-region resource.

## Importing Water Quality Data

WQ data enters a region through the **Add Measurements** wizard, the same one that handles water-level imports. The wizard exposes up to three data source tabs at the top:

- **Upload CSV** — universally available; for ingesting any tabular data file you have on disk.
- **USGS Levels** — visible when the region overlaps the United States and at least one well already exists; downloads water-level data only.
- **Water Quality (WQP)** — visible when the region overlaps the United States; downloads water quality data from the Water Quality Portal.

The first and third sources can both produce WQ data; the second is water-level only. All three feed the same downstream save pipeline, which means the well-matching panel, the data quality cleanup, and the append/replace logic are shared infrastructure. The differences are mostly in how rows arrive at the wizard.

The remainder of this page covers the WQ-relevant import paths in depth: the smart well discovery system that makes any source work without requiring perfect well IDs, the column mapping editor that translates messy CSV headers into catalog codes, and the WQP download flow itself.

## Smart Well Discovery

A persistent friction point in earlier versions of Aquifer Analyst was the rule that wells had to exist in `wells.csv` *before* you could import measurements for them. In practice, real-world data rarely arrives that cleanly. A spreadsheet from a state monitoring program might list 200 wells by name and coordinates, most of which match wells you already have but with slightly different spellings or no shared identifier at all. Forcing the user to manually reconcile each name was tedious and error-prone, and it discouraged people from importing data they otherwise could use.

The smart well discovery pipeline solves this by accepting any combination of well identifiers (ID, name, latitude/longitude) on a per-row basis and resolving each row to either an existing well in the region or a new well that the importer creates on the fly. The pipeline is opt-in for CSV uploads (the **"Measurements file includes well locations"** checkbox at the top of the upload tab) and always-on for WQP downloads (since every WQP station carries lat/long).

### The matching pipeline

For every distinct well in your source data, the pipeline applies four matching strategies in order, stopping at the first hit:

**1. Exact ID match.** If your row has a well_id and that ID matches a `well_id` already in the region's `wells.csv`, the match is immediate and unambiguous. This is the common case for repeated USGS or WQP downloads, where every well carries a stable agency-assigned identifier like `USGS-06137570` or `21FLBFA-12345`.

**2. Exact name match.** If no ID match is found, the pipeline looks for a case-insensitive, trimmed match on `well_name`. Names in source data are notoriously inconsistent (`"Spring Garden Well #2"` vs `"Spring Garden Well 2"`), so this is a quick check that handles only the easy cases — substring and fuzzy matching aren't attempted at this stage because the next strategy handles those situations more reliably.

**3. Proximity match.** When neither ID nor name resolves the row, the pipeline falls back to spatial matching: it computes the haversine distance from the row's coordinates to every existing well in the region and accepts the nearest one within a configurable threshold (default 100 meters). This is what catches the "different spellings of the same physical well" case — two rows that label the same geographic location as `"Spring Grdn Well 2"` and `"Spring Garden Well #2"` will both proximity-match to the existing `"Spring Garden Well #2"` even though their names disagree.

**4. New well.** If no existing well lies within the proximity threshold, the row is treated as a new well. New wells are created with an auto-generated identifier, point-in-polygon assignment to an aquifer (when the region has aquifer boundaries), and an estimated ground surface elevation pulled from the appropriate elevation API.

The match results are summarized in a five-cell counter at the top of the well matching panel — by ID, by name, by proximity, new, and unmatched — so you can see at a glance how the source data resolved against your existing wells. Proximity matches are flagged for review: an expandable list shows each proximity match with the distance and lets you reject individual matches if the spatial coincidence looks wrong (two distinct wells at the same address, for example).

### Auto-generated well IDs

When a new well is created from source data that has no usable ID column, the application generates one using an `aqx-` prefix:

```
aqx-{name_slug}-{lat}N{lon}W      (when a name is available)
aqx-{lat}N{lon}W                   (when no name is available)
```

For example, a CSV row labeled "Spring Garden Well" at (18.1234, −77.4567) would yield `aqx-spring-garden-18.12N77.46W`. The `aqx-` prefix is reserved for wells the application created — it's how you can distinguish locally-generated identifiers from agency-assigned ones (USGS, WQP) and from user-supplied IDs. The coordinate suffix ensures uniqueness even when names collide. Generated IDs are checked against the existing wells.csv to avoid accidental duplicates; if a collision occurs, a numeric suffix is appended.

This applies only to CSV imports without a well ID column. WQP downloads always carry the agency-assigned `MonitoringLocationIdentifier` (e.g. `21FLBFA-12345`) and use that directly as the well_id.

### Coordinate reference system handling

A common pitfall in well-matching is that source coordinates may be in a projected coordinate system (UTM, State Plane, a national grid like JAD2001 for Jamaica) rather than WGS 84 latitude/longitude. The application handles this transparently in two layers.

The well matching panel includes a **Coordinate System** picker that defaults to WGS 84. Below the picker, a single-row preview shows the first record's coordinates re-projected through the selected CRS, with a green check or amber warning indicating whether the result lands inside the region. If the WGS 84 default fails (preview is outside region), an **Auto-detect** function tries the most likely projected CRSes for the region and picks the one whose coordinates fall inside the region bounds. The auto-detect is also triggered automatically once per loaded file when the default WGS 84 preview fails — most projected-coordinate CSVs simply work without the user touching the picker.

### Per-row deduplication

A subtle correctness problem arises when the same well appears on multiple rows of the source data. The application deduplicates *before* matching, using an identity key that prefers ID, falls back to coordinates (rounded to ≈1 m precision), and finally falls back to name. The coordinate-before-name precedence is deliberate: it means that two rows labeled "Spring Grdn Well 2" and "Spring Garden Well #2" at identical coordinates collapse into one source well — and therefore one match decision and at most one new-well creation — even when no IDs are present. Without this rule, every spelling variant would become a separate new well at the same location.

## CSV Upload and the Column Mapping Editor

When you upload a CSV, the application has to translate columns whose names you didn't choose into data types it understands. The column mapping editor is the panel that does this translation. Its core job is to look at each unmapped column in your file (everything except the structural columns like `well_id`, `lat`, `date`) and propose a target — either a catalog parameter, an existing custom type in your region, or a new custom type to be created on the fly.

### How auto-detection works

The auto-matcher uses a layered strategy that prioritizes catalog hits over custom hits and exact matches over fuzzy ones. For each column, it normalizes the header (lowercasing, stripping non-alphanumeric characters) and then tries:

1. An exact match against catalog codes, names, and `wqp.characteristicName` values.
2. A chemical-formula alias lookup (e.g. `NO3` → `nitrate`, `Ca` → `calcium`).
3. A Levenshtein-distance fuzzy match against catalog entries (catches typos like `Sulphate` → `sulfate` or `Flouride` → `fluoride`).
4. A substring match (for unusual column naming like "Total Nitrogen Concentration" → `nitrogen`).
5. A check against the region's existing custom types.
6. A check against custom types from *other* regions in the database (so a custom you've defined in one region is suggested when you import similar data in another).
7. As a final fallback, the column is offered as a "new custom type" that you can name and code yourself.

Catalog matches are pre-checked in the include column; new custom types are pre-unchecked. This behavior reflects the principle that catalog parameters are the safest target — you should usually accept them unless the column is mislabeled — while creating a new custom is a more deliberate choice that should require explicit opt-in.

### The mapping panel layout

Each row in the panel represents one CSV column and shows: an include checkbox, the column name as it appears in your file, a target dropdown (catalog parameter / existing custom / new custom / skip), and the unit. When you select a catalog target, the unit is locked to the catalog's canonical unit and the row displays a warning if your CSV header carried a different unit hint (e.g. the column header says `Nitrate (μg/L)` but the catalog unit is `mg/L`). The application does not auto-convert in this case — it imports the values as-is and surfaces the discrepancy so you can decide whether the values are correct or whether you need to clean the CSV before re-importing.

Bulk toggles at the top of the panel (**Include all**, **Only catalog matches**, **None**) make the 20-column case fast: you can flip every row at once and then unflip the few you don't want.

The custom-type creation flow is inline. When a row's target is "new custom", three input fields appear (code, name, unit) so you can fill them out without leaving the panel. The application validates that the code doesn't collide with the catalog and that it follows the lowercase-alphanumeric-plus-underscores convention.

## Water Quality Portal (WQP) Download

The Water Quality Portal at [waterqualitydata.us](https://www.waterqualitydata.us/) is a federated data warehouse maintained by USGS, EPA, and the National Water Quality Monitoring Council. It aggregates analytical results from over 400 public and private data providers — USGS NWIS, EPA STORET/WQX, USDA STEWARDS, state programs, tribal nations — into a single API. Aquifer Analyst's WQP integration brings water quality measurements into a region directly from this source, without requiring any intermediate file download or manual reformatting.

The WQP tab in the Add Measurements wizard appears only for regions whose bounding box overlaps the United States, since WQP's geographic coverage is U.S.-centric. (The WQP API is technically open to any bounding box anywhere in the world, but its data density outside the United States is negligible, so the tab is gated to avoid suggesting a workflow that won't return useful results.)

### Background: how WQP queries work

WQP exposes two main endpoints relevant to the application: `/Result/search` returns analytical measurements (one row per characteristic per sampling event), and `/Station/search` returns station metadata including coordinates and site type. Both endpoints accept the same filter parameters — geographic bounding box, characteristic names, date range, provider — and return CSV bodies plus useful response headers like `Total-Result-Count` and `Total-Site-Count` that disclose how many rows match a query without requiring the rows themselves.

Aquifer Analyst calls both endpoints during a typical download: stations to discover where the wells are, results to get the measurements, then a join in the browser to assemble the final dataset. The application proxies WQP requests through a small server-side middleware (`/api/wqp-proxy`) for two reasons. First, WQP's CORS configuration doesn't expose count headers to browser JavaScript even though they're present in the HTTP response; the proxy re-emits them with the proper expose header. Second, the proxy gives a single place to apply timeouts, content negotiation, and any future caching without scattering that logic across the client.

### Choosing parameters

The first step in a WQP download is to pick the parameters you want. Click **Pick parameters** to open a multi-select modal that shows every catalog entry with a `wqp.characteristicName` mapping, grouped by category. Tri-state group checkboxes let you bulk-select an entire category (e.g. all nutrients) with one click, and a search box filters by name, code, or WQP characteristic. Custom (non-catalog) parameters are intentionally absent from this picker because they have no `wqp.characteristicName` and therefore can't be queried.

Selected parameters appear as removable chips back in the WQP panel. The catalog mapping is applied at three points in the workflow: when constructing the WQP query (each chip's WQP characteristic name is sent to the API), when filtering the response (the `sampleFraction` preference for each parameter is enforced — see below), and when writing the output (each measurement is routed to its `data_{code}.csv` file using the catalog code, not the WQP characteristic name).

### Date range, providers, and scope

Three additional inputs shape the query.

**Date range.** Both start and end dates default to a 10-year window ending today, which is a sensible default for "what's been measured here recently". You can extend backward to capture historical data or shorten the window to refresh only the most recent records. WQP requires the date format `MM-DD-YYYY` in queries; the application converts your ISO-formatted picker values automatically.

**Sources.** Two radio buttons select the data providers. **All agencies** sends no provider filter and pulls from every WQP-participating organization. **USGS only** adds `providers=NWIS` to the query so only USGS National Water Information System results come back. The "all agencies" option is usually what you want — the broader coverage catches state and EPA programs that hold data USGS doesn't have — but USGS-only can be useful when you specifically want to keep your dataset compatible with older USGS-only workflows.

**Scope.** For multi-aquifer regions, a scope picker lets you choose between **All aquifers in region** (the default — uses the union bounding box of every aquifer polygon) and **Specific aquifer** (uses just that one aquifer's bounding box, accompanied by a dropdown to pick which). In both cases, a polygon clip is applied after the WQP fetch returns: stations whose coordinates fall outside the chosen polygon(s) are dropped, and their results are dropped along with them. This matters because WQP only accepts a rectangular bounding box as a spatial filter — it has no concept of polygons — so a query for an irregularly-shaped aquifer's bbox will pull in a lot of stations that are technically inside the rectangle but outside the actual aquifer. The post-fetch polygon clip is what keeps the final dataset focused on the aquifer you care about.

### Estimate before downloading

Before pulling actual data, click **Estimate** to run a count query. The application makes two HEAD-equivalent requests (using GET with the body discarded, since WQP's CORS rejects HEAD) and reads the `Total-Result-Count` and `Total-Site-Count` headers. The result appears as a small blue panel: *"Estimated: 12,400 results at 340 sites (bounding box). Stations outside the aquifer polygons are dropped after download — actual count will be lower."*

The estimate is always greater than or equal to the actual import count for two reasons. First, the count reflects the bounding box, not the polygon clip — a bbox enclosing an irregularly-shaped aquifer can be substantially larger than the aquifer itself, so the bbox-count over-reports. Second, the post-fetch deduplication (described below) drops some result rows whose sample fractions don't match the catalog preference. Both reductions happen client-side after the download, so they can't be reflected in the pre-download estimate.

If the estimated result count is unusually large (over 500,000), an amber warning suggests narrowing the date range, fewer parameters, or a smaller area. The application doesn't block large downloads, but the warning is a nudge to think about what you're committing to — half a million rows can take a while to fetch and process in the browser.

### The download itself

Click **Download** to fetch stations and results in parallel. Both endpoints return CSV bodies that the application parses in memory; for typical regional queries this happens in a few seconds. Once both responses are in:

1. Each station is geometrically tested against the chosen aquifer polygon(s); stations outside are discarded and counted in the data quality report.
2. Result rows for discarded stations are dropped.
3. The remaining results are deduplicated according to the catalog's per-parameter preferences (see next section).
4. The deduped results are pivoted into a wide-format table — one row per (station, date), with one column per selected catalog parameter — that mimics the shape of an uploaded CSV.
5. The wide-format table is fed into the same well-matching panel that CSV uploads use.

After the download, the WQP tab transitions to the same "file ready" state that the upload tab uses: a green file-loaded banner shows the row count, the well-matching panel takes over the rest of the screen, and a quality report panel summarizes what was filtered out.

### Sample fraction filtering and deduplication

A single physical sampling event at a well can produce multiple rows in WQP for the same characteristic. The reasons range from procedural (lab-measured vs. field-measured) to chemical (filtered vs. unfiltered for dissolved metals) to administrative (different reporting agencies counting the same event). If left unprocessed, these duplicates would all end up in the imported data, and time-series plots would show suspicious vertical clusters of points at single dates.

The catalog encodes the appropriate handling per parameter via the `wqp.sampleFraction` field. For dissolved species like nitrate, calcium, and most metals, the catalog specifies `"Filtered"` — these parameters are reported in two forms (filtered and unfiltered), and the dissolved/filtered fraction is the standard for groundwater chemistry. For parameters where filtration is irrelevant (pH, temperature, conductivity), the catalog specifies `null`, meaning "accept any fraction".

The dedup logic works in two passes:

1. **Sample fraction filter.** For parameters with a non-null preference, rows whose `ResultSampleFractionText` doesn't match the preference are dropped.
2. **Take-first.** Of what survives, the first row per (siteId, date, characteristic) is kept and the rest are dropped. There is no attempt at averaging or quality-weighting — that would require parameter-specific logic and could obscure analytically meaningful differences.

The data quality report shows how many rows were dropped at each stage: *"34,000 raw rows → 12,400 kept; 18,200 dropped — sample fraction didn't match catalog preference; 3,400 duplicates collapsed (same site + date + parameter)."* The breakdown is informational; the dedup choices are not user-configurable from the UI. If you find that the catalog's fraction preference doesn't match your data's reality (for example, if a region only reports unfiltered nitrate), the right fix is to discuss adjusting the catalog rather than working around it per-import.

### Why WQP isn't in the Add Wells flow

The well import wizard (separate from the measurement importer) offers a USGS download option that pulls well locations from USGS's monitoring-locations registry. There is no analogous "WQP wells" option, even though the WQP API would technically support it. This is a deliberate design choice for two reasons.

First, WQP has no equivalent of USGS's generic groundwater-well registry. To get wells from WQP you have to query the Station endpoint with at least one filter — typically a characteristic name — which means "WQP wells" is always *"WQP wells that have data for some specific parameter"*, not "all WQP wells". This makes a wells-only WQP flow less useful than it sounds: you'd still need to pick parameters first, at which point you might as well import the measurements too.

Second, water-level data is the foundation of a typical Aquifer Analyst dataset — it's denser, more uniform, and forms the spatial backbone of most analyses. New wells are best discovered by USGS water-level downloads (which are hand-shaped for that purpose), with WQP filling in additional sites as a side effect of measurement imports. The current architecture supports that workflow well: every WQP measurement download creates the underlying wells if they don't already exist, so the user doesn't have to think about wells as a separate step.

If you find yourself wanting WQP wells without measurements, the practical workaround is to do a tiny WQP import (one parameter, narrow date range) and let the wells come through as a side effect. The wells stay in `wells.csv` even if you later delete the measurement file.

## Append vs. Replace

Whether you're uploading a CSV or downloading from WQP, the wizard offers an **Import Mode** toggle when the region already has data of the same type. The two modes have very different semantics:

**Append** (the default) is non-destructive. The importer compares each incoming measurement's `well_id + date` key against existing records; matches are skipped, and new records are added. This is the safe choice for refreshing a dataset with newer records or adding a parameter that wasn't previously imported. Existing data is never modified or lost.

**Replace** is destructive at the data-type level. For each parameter being imported, the existing `data_{code}.csv` is deleted and rewritten from the import. Other parameters are untouched. This is useful when you want to start over with fresh data — for example, if you've corrected a CRS error and want to reimport from scratch — but it permanently removes the existing data for the affected parameters. The wizard requires a confirmation click before executing a replace.

Note that wells are always handled additively: the importer never deletes wells, even in replace mode. New wells discovered during the import are appended to `wells.csv`; existing wells are kept regardless of whether they appear in the new dataset. If you want to remove wells, do it from the well editor or by deleting the region.

## Data Quality Considerations

A few practical tips for getting clean imports:

- **Date conventions.** WQP returns dates in ISO `YYYY-MM-DD` format, so no conversion is needed for downloaded data. CSV uploads are auto-detected (ISO, US slash, EU slash, year-only, etc.), but two-digit years are pivoted at 50 — values 50–99 map to 1900s and 00–49 to 2000s. If your historical data uses two-digit years across the pivot boundary, double-check after import.
- **Censored values.** WQP often reports values below detection limits with a string like `"<0.05"` instead of a number. The application drops these rows during parsing rather than guessing at a substitute value. If you need to track non-detects, consider preserving them in a separate workflow.
- **Unit consistency.** The catalog's canonical unit is the system of record. CSV uploads with mismatched units are imported as-is with a warning; WQP downloads use whatever unit WQP reports per row. If a parameter's reporting unit varies meaningfully across your data sources, you may want to normalize externally before importing.
- **Sparse parameters.** WQ parameters at any one well are often sparse — perhaps a handful of samples spread over decades. The minimum-observations filter on the map (in the toolbar) is useful for hiding wells with too few measurements to be meaningful for the parameter you're viewing.
- **Aquifer assignment.** New wells discovered during import are assigned to aquifers by point-in-polygon test against the region's `aquifers.geojson`. Wells that don't fall inside any aquifer polygon get an empty `aquifer_id`; you can fix these manually in `wells.csv` or by re-importing the wells with an explicit aquifer_id column.

## Viewing Water Quality Data

Once imported, water quality data is selected through the data type dropdown at the top of the application. The dropdown shows every effective data type in the current region — water table elevation plus any catalog or custom parameter that has data on disk. Selecting a parameter switches the entire UI: well markers on the map are color-coded by the number of measurements available for that parameter, the time series chart shows samples for the selected parameter at the selected wells, and download / export operations operate on that parameter's data file.

WQ visualization works the same way as water-level visualization. The chart's Y-axis adopts the parameter's catalog unit (e.g. mg/L for nitrate), and the title shows the parameter's catalog name. Multi-well selection, PCHIP smoothing, and date filtering all carry over without modification. Spatial analyses (kriging, IDW, raster animations) are also data-type-aware and operate on whichever parameter is currently selected.

The current chart UI does not yet overlay MCL or WHO thresholds as horizontal reference lines, although those values are stored in the catalog and shown in the catalog browser. If this becomes a needed feature, the catalog already has the data to drive it.
