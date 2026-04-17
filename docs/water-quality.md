# Water Quality Data

Aquifer Analyst was originally built around water-level measurements, where the only data type was water table elevation (WTE). The application now also handles a much broader set of water quality (WQ) parameters — pH, nitrate, arsenic, dissolved oxygen, and dozens more. This page describes how WQ data fits into the application, the import paths that bring it into a region, and the conventions that keep things consistent across the regions you work with.

WQ data behaves quite differently from water-level data. Every WQ measurement is keyed by a parameter — the substance being measured — where each parameter has its own unit, its own regulatory thresholds, and its own data conventions. A reading of `5.2` is meaningless without knowing whether it's mg/L of nitrate or μS/cm of conductivity. WQ data is also typically much sparser than water-level data: many wells have only a handful of WQ samples spread over decades, and the parameters measured at one well may be entirely different from the parameters measured at a neighbor. Finally, public WQ data in the United States is collected by hundreds of agencies — USGS, EPA, state programs, tribal nations — while water-level data is centralized at USGS. The features described on this page accommodate all three of those differences.

## Standardized Parameters

To keep parameter handling consistent across regions, the application uses a built-in catalog of standardized water quality parameters. Roughly 38 of the most commonly measured groundwater quality parameters are included — the major nutrients, ions, metals, microbiological indicators, and physical measurements. Each catalog parameter has a fixed name, a fixed reporting unit, a category for grouping in the UI, and (where applicable) U.S. EPA Maximum Contaminant Level (MCL) and World Health Organization (WHO) drinking-water reference values.

The catalog exists so that nitrate is nitrate everywhere. Without it, one region might report nitrate in mg/L and another in mg/L as N, with column headers ranging from "Nitrate" to "NO3" to "Nitrogen-N", and meaningful comparisons across regions would require constant manual reconciliation. By shipping a curated common vocabulary, the application removes that friction: when you import data for nitrate in any region, it lands under the same parameter name with the same unit, and the same MCL is shown in the catalog browser.

### Browsing the catalog

You can see the full list of standardized parameters at any time through the **Catalog Browser**, a read-only modal accessible from two places:

- The **Browse Catalog** link inside the data type editor.
- The **View Catalog** link inside the measurement importer's data column mapping panel.

The browser groups parameters by category (Physical, Nutrient, Major Ion, Minor Metal, Microbiological, etc.), supports search by name or code, and shows the MCL and WHO values alongside each entry. Clicking a row reveals additional detail useful when downloading from the Water Quality Portal — specifically the WQP characteristic name and the preferred sample fraction for that parameter. The browser is informational only; you cannot add, edit, or remove catalog parameters from the application.

### Custom (non-catalog) parameters

The catalog covers the parameters most groundwater work touches, but it can't anticipate every chemistry your region might track. For specialized parameters that aren't in the catalog — specific organic compounds like trichloroethane, parameters reported with non-standard conventions like hardness as CaCO3, or any region-specific chemistry — you can define **custom data types** through the data type editor. Custom types live alongside catalog parameters in the data type dropdown and in your data files; the difference is that they're scoped to one region and you choose the name and unit yourself.

The application enforces a clean separation between the two: a custom parameter cannot use a code that's already in the catalog. If you try to add a custom called `nitrate`, the editor will block it and remind you that nitrate is already a catalog parameter — so you should import your data as nitrate (it will land in the same place automatically) rather than creating a duplicate definition.

### When does a parameter "exist" in a region?

Aquifer Analyst takes a simple approach to deciding which parameters appear in a given region's data type dropdown: a parameter exists in the region if you have data for it. Catalog parameters are implicitly available globally, but they only appear in the dropdown for a specific region after you've actually imported some measurements for that parameter into that region. Custom parameters work the same way — defining one in the data type editor records it for the region, but it doesn't show up in the dropdown until you've imported measurements as well.

This means there's no separate "declare parameters first, then import data" step. Importing data is what brings a parameter into a region, and deleting a parameter's data is what removes it. This keeps the UI honest: every parameter you see in the dropdown has data behind it.

## Importing Water Quality Data

Water quality data enters a region through the **Add Measurements** wizard, the same one that handles water-level imports. Open it through **Manage Data** → click the measurements section for the region you want to work with. Across the top of the wizard you'll see up to three data source tabs:

- **Upload CSV** is always available and accepts any tabular file you have on disk.
- **USGS Levels** appears when the region overlaps the United States and at least one well already exists. It downloads water-level measurements from USGS and is not relevant to water quality.
- **Water Quality (WQP)** appears when the region overlaps the United States. It downloads water quality data directly from the federated Water Quality Portal.

The CSV upload and the WQP download both produce water quality data. They feed into the same downstream machinery: the well-matching panel, the data quality cleanup, and the append/replace logic are shared across both sources. The differences are in how rows arrive at the wizard. The next two sections cover each source in detail, with a separate section in between on the well-matching pipeline that both share.

## Smart Well Discovery

Earlier versions of Aquifer Analyst required every well to exist before you could import measurements for it — a strict prerequisite that often made imports painful. Real-world datasets rarely arrive that cleanly. A spreadsheet from a state monitoring program might list 200 wells by name and coordinates, most of which match wells you already have but with slightly different spellings or no shared identifier at all. Forcing manual reconciliation row by row was tedious and error-prone, and it discouraged people from importing data they could otherwise use.

The smart well discovery pipeline solves this by accepting any combination of well identifiers — ID, name, latitude/longitude — on a per-row basis and resolving each row to either an existing well in the region or a new well that the importer creates on the fly. For CSV uploads, you turn the pipeline on by checking **"Measurements file includes well locations"** at the top of the upload tab. For WQP downloads, the pipeline is always on, since every WQP station carries lat/long.

### How rows match wells

For each distinct well in your source data, the pipeline tries four strategies in order, stopping at the first one that succeeds:

**An exact ID match** is tried first. If the row has a well ID and that ID matches a well already in your region, the match is immediate. This is the common case for repeated downloads from USGS or WQP, where every well carries a stable agency-assigned identifier.

**An exact name match** is the second fallback. If the IDs don't agree (or there's no ID at all), the pipeline looks for an exact, case-insensitive match on the well name. This handles only the easy cases — minor spelling differences and substring matches are deliberately not attempted at this stage, because the next strategy is better suited to ambiguous matches.

**A proximity match** is tried when neither ID nor name resolves the row. The pipeline computes the great-circle distance from the row's coordinates to every existing well in the region and accepts the nearest one within a configurable threshold (100 meters by default). This is how the importer recognizes that "Spring Grdn Well 2" at one set of coordinates and "Spring Garden Well #2" at the same coordinates are the same physical well, even when the names disagree. You can tighten or loosen the threshold from the well matching panel.

**A new well** is created when no existing well lies within the proximity threshold. The new well gets an automatically generated identifier (more on that below), an aquifer assignment derived by checking which aquifer polygon contains its coordinates, and an estimated ground surface elevation pulled from a public elevation service.

The well matching panel summarizes the result of all this in a five-cell counter at the top: how many rows matched by ID, how many by name, how many by proximity, how many became new wells, and how many couldn't be resolved at all (rows without any usable identifier or coordinates). Proximity matches are flagged for your review — an expandable list shows each one with the distance, and you can reject individual matches if a spatial coincidence looks wrong. Two genuinely different wells at the same address, for example, would proximity-match to each other; clicking **Reject** treats the source row as a new well instead.

### Identifiers for new wells

When a new well is created from source data that has no usable ID column, the application generates one with an `aqx-` prefix. The format combines a slug of the well name (when one is available) with a coordinate suffix:

- `aqx-spring-garden-18.12N77.46W` — when a name is available
- `aqx-18.12N77.46W` — when no name is available

The `aqx-` prefix is reserved for IDs the application generated. It's how you can distinguish locally-created identifiers from agency-assigned ones (USGS, WQP) and from IDs you supplied yourself in your source data. The coordinate suffix ensures uniqueness even when names collide; if a generated ID would conflict with one already in the region, a numeric suffix is appended.

This only matters for CSV imports without a well ID column. WQP downloads always carry the agency-assigned identifier (e.g. `USGS-06137570` or `21FLBFA-12345`) and use that directly.

### Coordinate reference systems

A common surprise in well matching is that source coordinates may be in a projected coordinate system — UTM, State Plane, or a national grid like JAD2001 for Jamaica — rather than in WGS 84 latitude/longitude. The well matching panel includes a **Coordinate System** picker for exactly this case. It defaults to WGS 84, and a small preview underneath shows what the first row's coordinates look like after conversion through the selected system, with a green check or amber warning telling you whether the result lands inside the region.

If the WGS 84 default doesn't work — meaning the preview indicates the coordinates land outside the region — an **Auto-detect** button tries the most likely projected systems for the region and picks the one that fits. The application also runs auto-detect automatically once per loaded file when the default fails, so most projected-coordinate CSVs simply work without your touching the picker.

### Same well on multiple rows

A subtle but important detail: when the same well appears on multiple rows of your source data (common in WQP downloads, where each row is a separate measurement event), the pipeline deduplicates *before* matching. The deduplication uses an identity key that prefers the well ID, falls back to coordinates (rounded to roughly one-meter precision), and finally falls back to the name. Coordinates win over names so that two rows labeled differently but at identical coordinates collapse into one source well — and therefore one match decision and at most one new-well creation. Without this rule, every spelling variant would become a separate new well at the same location.

## Uploading from CSV

When you upload a CSV, the application has to translate columns whose names you didn't choose into data types it understands. This happens in three panels that the wizard shows in sequence after you pick the file: a panel for the structural columns, a panel for data columns, and the well matching panel described above.

### Structural columns

The **Map Structural Columns** panel handles the columns that describe each measurement's context: well ID, date, latitude, longitude, well name, aquifer ID. The mapper auto-detects common column names — `Latitude` maps to lat, `Sample_Date` maps to date, and so on — but you can override any mapping from a dropdown. A date format selector appears once a date column is mapped, in case auto-detection picks the wrong format for ambiguous dates.

### Data columns

The **Map Data Columns** panel is where the actual measurement columns get assigned to data types. For each unmapped column in your file, the panel shows a row with a checkbox, the column name as it appears in your file, a target dropdown, and the unit. The target dropdown offers four kinds of targets: any catalog parameter, an existing custom type in your region, a new custom type to be created on the fly, or "skip" if you don't want to import that column.

The application proposes a target for each row using a layered matching strategy — exact match against catalog codes and names, chemical-formula aliases (so "NO3" maps to nitrate and "Ca" maps to calcium), fuzzy matching that catches typos like "Sulphate" → sulfate or "Flouride" → fluoride, substring matches for unusual headers, and finally a check against your existing customs and customs from other regions you've worked with. Catalog matches are pre-checked in the include column; new custom types are pre-unchecked because creating one is a deliberate decision rather than something you want to happen by default.

When you select a catalog target, the unit is locked to the catalog's standard unit. If your CSV header carried a different unit hint — for example, the column header says `Nitrate (μg/L)` but the catalog standard for nitrate is `mg/L` — the row displays a warning. The application does not silently convert units; it imports the values as you supplied them and surfaces the discrepancy so you can decide whether the values are correct (and the header was just inconsistent) or whether you need to fix the CSV before re-importing.

For a CSV with many measurement columns, three bulk toggles at the top of the panel make the choice fast: **Include all** checks every row, **Only catalog matches** checks just the rows the matcher confidently mapped to a catalog parameter, and **None** unchecks everything. You can then flip individual rows from the bulk state.

When a row's target is "new custom type", three input fields appear inline (code, name, unit) so you can fill them in without leaving the panel. The application validates that the code doesn't collide with the catalog and that it follows the lowercase-alphanumeric-plus-underscores convention required for filenames.

## Water Quality Portal Download

The Water Quality Portal (WQP) at [waterqualitydata.us](https://www.waterqualitydata.us/) is a federated data warehouse maintained by USGS, EPA, and the National Water Quality Monitoring Council. It pulls together analytical results from over 400 public and private data providers — USGS NWIS, EPA STORET, USDA STEWARDS, state programs, tribal nations — into a single source. Aquifer Analyst's WQP integration brings water quality measurements into a region directly from this source, with no intermediate file download or manual reformatting.

The **Water Quality (WQP)** tab in the Add Measurements wizard appears for any region whose bounding box overlaps the United States. The application treats WQP as U.S.-centric since that's where the data density actually exists, even though the API is technically open worldwide.

### Picking parameters

The first step is to choose what to download. Click **Pick parameters** to open a multi-select modal. The modal shows the catalog parameters that can be downloaded from WQP, grouped by category (Physical, Nutrient, Major Ion, etc.). You can select individual parameters with the row checkboxes, or use the tri-state group checkboxes to select an entire category (all nutrients, all major ions) with one click. A search box at the top filters by name. **Select all** and **None** buttons make starting from one extreme or the other quick.

Custom (non-catalog) parameters are intentionally absent from the picker. The Water Quality Portal organizes data by its own list of standardized characteristic names, and only the catalog parameters know how to map back and forth. If you have data for a custom parameter that WQP also tracks, the right path is usually to advocate for adding it to the catalog rather than working around the constraint per-import.

After you click **Apply**, the selected parameters appear as removable chips back on the WQP panel, where you can fine-tune by clicking the small ✕ on any chip to drop it.

### Date range, sources, and scope

Three more inputs shape the query.

**Date range.** Both start and end dates default to a 10-year window ending today, which is a sensible starting point for "what's been measured here recently". You can extend the start date backward to capture historical data or shorten the window if you only need a recent refresh. The date pickers use your local date format; the application converts to whatever WQP requires internally.

**Sources.** Two radio buttons select which data providers WQP queries. **All agencies** is the default and pulls from every WQP-participating organization — USGS, EPA, state, tribal, the lot. **USGS only** restricts the query to USGS data. The "all agencies" option is usually what you want, since the broader coverage catches data from state and EPA programs that USGS doesn't hold. The USGS-only option is useful if you specifically want to keep your dataset compatible with older USGS-only workflows or if you want to avoid integrating data from a particular non-USGS source.

**Scope.** For multi-aquifer regions, a scope picker chooses between **All aquifers in region** (the default) and **Specific aquifer** with a dropdown to pick which one. WQP only accepts a rectangular bounding box as a spatial filter — it has no concept of polygons — so under the hood the query is run against either the union bounding box of every aquifer in your region or the bounding box of the specific aquifer you picked. After the WQP results come back, the application clips the stations against the actual aquifer polygons: stations whose coordinates fall outside the chosen polygon(s) are dropped, and their measurements go with them. This is what keeps the imported dataset focused on the aquifer geometry you care about, not the rectangular envelope around it.

### Estimating before downloading

Before pulling actual data, click **Estimate** to see how much WQP is about to give you. The application asks WQP for a count and reports back something like:

> Estimated: 12,400 results at 340 sites (bounding box). Stations outside the aquifer polygons are dropped after download — actual count will be lower.

The estimate counts what the bounding-box query would return, so two reductions happen later that the estimate can't reflect. First, the polygon clip described above usually drops some stations that were inside the rectangle but outside the actual aquifer geometry. Second, the deduplication step described in the next section drops some result rows whose sample fractions don't match the standard for their parameter. Both reductions happen on your machine after the data arrives, so they can't be previewed — your actual import count will be lower than the estimate, sometimes substantially.

If the estimated result count looks unusually large (over 500,000), an amber warning suggests narrowing the date range, picking fewer parameters, or working with a smaller area. The application doesn't block the download — sometimes a large pull is what you want — but the warning is a nudge to think about what you're committing to. Half a million rows can take a while to fetch and process in the browser.

### Running the download

Click **Download** to fetch the data. The application asks WQP for the matching stations and the matching results in parallel. For typical regional queries the data arrives in a few seconds; for large queries it may take longer.

Once the data is in, the application does a few things in sequence behind the scenes: it clips stations to the aquifer polygon(s) you chose, drops any results whose station was clipped, deduplicates the surviving results (next section), pivots them into a wide-format table that looks like a multi-column CSV, and hands the result to the well matching panel. From there, the workflow is identical to a CSV upload: you review well matches, optionally adjust the proximity threshold, and confirm the import.

A green file-loaded banner shows the row count, and a cleanup panel above the well-matching panel summarizes what was filtered out — how many stations were dropped by the polygon clip, how many measurement rows were dropped because their sample fraction didn't match the catalog standard for the parameter, and how many duplicates were collapsed.

### Filtering duplicates and sample fractions

A single physical sampling event at a well can produce multiple rows in WQP for the same parameter. The reasons range from procedural (lab-measured vs. field-measured) to chemical (filtered vs. unfiltered for dissolved metals) to administrative (different reporting agencies counting the same event). Without cleanup, all of these would land in your imported data, and time-series plots would show suspicious vertical clusters of points at single dates.

For each parameter in the catalog, the application records a preferred sample fraction. For dissolved species like nitrate, calcium, and most metals, the standard is **filtered** — these parameters are typically reported in two forms (filtered and unfiltered), and the dissolved/filtered fraction is the one used in groundwater chemistry. For parameters where filtration is irrelevant (pH, temperature, conductivity), the application accepts any fraction.

Cleanup runs in two passes. First, rows whose sample fraction doesn't match the catalog standard for that parameter are dropped. Second, of what remains, the first row per (well, date, parameter) combination is kept and the rest are dropped. There's no averaging or quality-weighting — that would require parameter-specific logic and could mask analytically meaningful differences. The cleanup panel shows you exactly how many rows were affected at each stage so you can see whether the result matches your expectations.

If you find that the catalog's fraction preference doesn't match your data — for example, if a region only reports unfiltered nitrate where the standard is filtered — your entire import for that parameter could come back empty. The right fix is usually to revise the catalog preference for the parameter, not to work around it per-import. If you encounter this and think the catalog has it wrong, that's worth raising as a bug.

### Why WQP isn't in the Add Wells flow

The well import wizard offers a USGS download option that pulls well locations directly from USGS, but there's no analogous "WQP wells" option even though the WQP API technically supports station queries. This is a deliberate choice for two reasons.

WQP has no equivalent of USGS's generic groundwater-well registry. To get wells from WQP you have to query for stations that have data for some specific parameter — there is no "give me all WQP wells" endpoint. So a hypothetical wells-only WQP flow would still need to ask you which parameters you care about, at which point you might as well import the measurements at the same time.

Beyond that, water-level data is the foundation of a typical Aquifer Analyst dataset — it's denser, more uniform, and forms the spatial backbone of most analyses. New wells are best discovered by USGS water-level downloads (which are designed for that purpose), with WQP filling in additional sites as a side effect of measurement imports. The current architecture supports that workflow naturally: every WQP measurement import creates the underlying wells if they don't already exist, so wells aren't a separate step you have to think about.

If you find yourself wanting WQP wells without measurements, the practical workaround is to do a tiny WQP import — one parameter, narrow date range — and let the wells come through as a side effect. The wells stay in your region even if you later delete that parameter's data.

## Append vs. Replace

Whether you're uploading a CSV or downloading from WQP, when the region already has data for the same parameter, the wizard offers an **Import Mode** toggle. The two modes have very different semantics.

**Append** is the default and is non-destructive. The importer compares each incoming measurement's well-and-date combination against existing records; matches are skipped, and only genuinely new records are added. This is the safe choice for refreshing a dataset with newer records or for adding a parameter that wasn't previously imported. Existing data is never modified or lost.

**Replace** is destructive at the parameter level. For each parameter being imported, the existing data is deleted and rewritten from the import. Other parameters in the region are untouched. This is useful when you want to start over with fresh data — for example, if you've corrected a coordinate error and want to reimport from scratch — but it permanently removes the existing measurements for the parameters you're importing. The wizard requires a confirmation click before executing a replace.

Wells are always handled additively, regardless of which mode you pick. The importer never deletes wells. New wells discovered during the import are added to the region; existing wells stay even if they don't appear in the new dataset. To remove wells, use the well editor or delete the region.

## Practical Notes

A few things to keep in mind as you import water quality data:

**Date conventions.** WQP returns ISO dates (`YYYY-MM-DD`), so no conversion is needed for downloaded data. CSV uploads support a wider range of formats (ISO, US-style slash dates, EU-style slash dates, year-only, etc.) that the importer auto-detects. Two-digit years are pivoted at 50: years 50–99 map to 1900s and 00–49 to 2000s. If your historical data uses two-digit years across that pivot in unusual ways, double-check the parsed dates after import.

**Censored values.** WQP often reports values below detection limits with strings like `<0.05` instead of numeric values. The application drops these rows during parsing rather than guessing at a substitute value. If tracking non-detects matters for your analysis, you'll need to preserve them through a separate workflow.

**Unit consistency.** The catalog's standard unit is the system of record for catalog parameters. CSV uploads with mismatched units are imported as supplied with a warning shown on the affected mapping rows; WQP downloads use whatever unit WQP reports per row. If a parameter's reporting unit varies meaningfully across your data sources, normalize externally before importing.

**Sparse data is the norm.** Water quality parameters at any one well are usually sparse — perhaps a handful of samples spread over decades. The minimum-observations filter on the map (in the toolbar) is useful for hiding wells with too few measurements to be analytically meaningful for the parameter you're viewing.

**Aquifer assignment of new wells.** New wells discovered during import are assigned to aquifers by checking which aquifer polygon contains their coordinates. Wells that don't fall inside any aquifer polygon get an empty aquifer assignment. You can fix these manually in the well editor, or by re-importing the wells with an explicit aquifer ID column.

## Viewing Water Quality Data

Once water quality data is imported, you select it through the data type dropdown at the top of the application. The dropdown shows every data type that has data in the current region — water table elevation plus any catalog or custom parameter you've imported. Selecting a parameter switches the entire UI: the well markers on the map are color-coded by the number of measurements available for that parameter, the time series chart shows samples for the selected parameter at the selected wells, and the export tools operate on that parameter's data.

WQ visualization works the same way as water-level visualization. The chart's vertical axis adopts the parameter's standard unit (mg/L for nitrate, μS/cm for conductivity, and so on), and the chart title shows the parameter's name. Multi-well selection, smoothing, and date filtering all carry over without modification. Spatial analyses — kriging, IDW, raster animations — are also data-type-aware and operate on whichever parameter is currently selected.

The chart UI does not currently overlay MCL or WHO thresholds as horizontal reference lines, although the catalog browser shows those values for parameters that have them. If this becomes a needed feature, the underlying data is already in place to support it.
