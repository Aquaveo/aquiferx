# Water Quality Download Integration (WQP)

## Background

Aquifer Analyst already downloads **groundwater levels** from the USGS via the OGC API (`api.waterdata.usgs.gov/ogcapi/v0`), using parameter code `72019` (depth to water below land surface). The existing integration includes well discovery by bounding box, batched CQL2 POST measurement queries, retry/rate-limit handling, and data validation.

This plan explores extending the app to also download **water quality** data at wells.

---

## Water Quality API — DECIDED: Water Quality Portal (WQP)

**Base URL:** `https://www.waterqualitydata.us/data/`
**Docs:** `https://www.waterqualitydata.us/webservices_documentation/`

### Why WQP only

Two APIs were evaluated: the USGS Samples Data API (USGS-only data) and the Water Quality Portal (USGS + EPA + 400+ state/tribal/local agencies). WQP is a **superset** — it includes all USGS data plus everything else. Rather than maintaining two API integrations, we use WQP exclusively with an optional `providers=NWIS` filter when the user wants USGS-only results.

| Aspect | WQP |
|--------|-----|
| Data sources | USGS + EPA (STORET/WQX) + USDA + 400+ agencies |
| USGS-only mode | `providers=NWIS` query parameter |
| API key | **Not required** (simpler than USGS Samples API) |
| CORS | Enabled — works from browser `fetch()` |
| Rate limits | No published limits |
| Output formats | CSV, TSV, XML, XLSX, GeoJSON, KML |
| Date format in queries | `MM-DD-YYYY` |
| Bounding box | `bBox=west,south,east,north` |
| Site type filter | `siteType=Well` |
| Parameter filter | `characteristicName` (specific) or `characteristicType` (group) |
| Multi-value delimiter | Semicolons |

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /data/Result/search?` | Analytical results (measurements) |
| `GET /data/Station/search?` | Monitoring locations / well info |
| `GET /data/Activity/search?` | Sampling activities |
| `GET /data/summary/monitoringLocation/search?` | Summary statistics per site |

### Key Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `bBox` | string | `west,south,east,north` (WGS84) |
| `siteid` | string | Agency-site ID (e.g. `USGS-06137570`); semicolon-delimited |
| `siteType` | string | `Well`, `Spring`, etc.; semicolon-delimited |
| `characteristicName` | string | Specific parameter; semicolon-delimited |
| `characteristicType` | string | Parameter category; semicolon-delimited |
| `sampleMedia` | string | `Water`, `Sediment`, etc. |
| `startDateLo` / `startDateHi` | string | Date range in `MM-DD-YYYY` |
| `providers` | string | `NWIS` (USGS only) or `STORET` (EPA only); omit for all |
| `countrycode` | string | FIPS country code |
| `statecode` | string | e.g. `US:06` (California) |
| `huc` | string | 8-digit HUC; semicolon-delimited |
| `lat` + `long` + `within` | number | Radial search (decimal degrees + miles) |
| `mimeType` | string | `csv`, `tsv`, `xml`, `xlsx`, `geojson` |
| `zip` | string | `yes` to compress response |

### Key CSV Columns (Result endpoint)

- `MonitoringLocationIdentifier` — site ID (e.g. `USGS-06137570`)
- `MonitoringLocationName`
- `ActivityStartDate` — sample date
- `CharacteristicName` — e.g. `Nitrate`, `Arsenic`
- `ResultMeasureValue` — the numeric value
- `ResultMeasure/MeasureUnitCode` — e.g. `mg/l`, `ug/l`
- `ResultSampleFractionText` — `Filtered`, `Unfiltered`

Well locations come from the **Station endpoint** (separate call):
- `MonitoringLocationIdentifier`, `MonitoringLocationName`
- `LatitudeMeasure`, `LongitudeMeasure`
- `MonitoringLocationTypeName` — `Well`, `Spring`, etc.

### Data source toggle in UI

The user sees a simple choice, not two APIs:

```
Data source:
(•) USGS only         → adds providers=NWIS to WQP query
( ) All agencies      → no provider filter (USGS + EPA + state + tribal)
```

Both options use the same WQP API, same code path, same response parsing. One query parameter difference.

### Note: USGS Samples Data API (not used, kept for reference)

The USGS Samples Data API (`api.waterdata.usgs.gov/samples-data/`) was also evaluated. It shares the same API key infrastructure as the existing OGC water-level API and uses `YYYY-MM-DD` date format. However, since WQP is a superset and doesn't require an API key, there's no advantage to maintaining a separate integration. If WQP ever becomes unreliable or rate-limited, the Samples Data API could serve as a fallback. See OpenAPI spec: `https://api.waterdata.usgs.gov/samples-data/openapi.json`

---

## Available Water Quality Parameter Categories

These are the `characteristicType` (WQP) values most relevant to groundwater:

| Category | Examples | Typical Units |
|----------|----------|---------------|
| **Nutrient** | Nitrate, nitrite, phosphorus, ammonia, Kjeldahl nitrogen | mg/L |
| **Inorganics, Major, Metals** | Calcium, magnesium, sodium, potassium | mg/L |
| **Inorganics, Major, Non-metals** | Chloride, sulfate, alkalinity, dissolved oxygen | mg/L |
| **Inorganics, Minor, Metals** | Arsenic, iron, manganese, lead, copper, zinc, chromium | ug/L |
| **Inorganics, Minor, Non-metals** | Fluoride, boron, selenium | ug/L |
| **Physical** | Temperature, pH, specific conductance, turbidity, TDS, hardness | varies |
| **Microbiological** | E. coli, fecal coliform, total coliform | CFU/100mL |
| **Organics, Pesticide** | Atrazine, glyphosate, DDT | ug/L |
| **Organics, PFAS** | PFAS / "forever chemicals" (USGS only) | ng/L |
| **Radiochemical** | Radon, radium, uranium, gross alpha/beta | pCi/L |
| **Stable Isotopes** | Deuterium, oxygen-18 | per mil |

---

## Key Differences from Water Level Downloads

| Aspect | Water Levels (current) | Water Quality (new) |
|--------|----------------------|---------------------|
| API | OGC API (`/ogcapi/v0`) | WQP (`waterqualitydata.us`) |
| Query style | CQL2 POST filter | REST GET with query params |
| Parameters | Single (72019) | Dozens — user must choose |
| Values per sample | One value per date | Multiple characteristics per sample event |
| Units | Feet (always) | Varies by characteristic (mg/L, ug/L, deg C, etc.) |
| Sampling frequency | Often daily/weekly | Typically quarterly or annual |
| Sample fractions | N/A | Filtered (dissolved) vs. Unfiltered (total) |
| Data volume | High (many dates, one param) | Wide (many params, fewer dates) |

---

## Current Data Type Architecture

### How it works today

Data types are defined **per-region** inside each `region.json` as a simple array:

```typescript
interface DataType {
  code: string;   // lowercase alnum + underscore, max 20 chars
  name: string;   // display name
  unit: string;   // e.g. "mg/L", "m", ""
}
```

Each data type gets its own CSV file: `data_{code}.csv`. The `DataTypeEditor` component lets users add/edit/delete types per region, and already has a **cross-region suggestion** feature that scans other regions and offers their types as one-click additions.

### What regions currently have

| Region | Data Types |
|--------|-----------|
| **Jamaica** | 19 — wte + 18 water quality (pH, conductivity, BOD5, TDS, hardness, chloride, fluoride, sulphate, calcium, iron, magnesium, manganese, potassium, sodium, ammonia, nitrate, fecal coliform, total coliform) |
| **Dominican Republic** | 3 — wte + trichloroethane + salinity |
| **All others** | wte only |

### Strengths of per-region approach
- Different regions genuinely have different parameters (Jamaica has BOD5 and fecal coliform; DR has trichloroethane)
- Units can vary by region convention (e.g. `mgCaCO3/L` vs `mg/L` for hardness)
- Codes are user-defined and flexible
- No wasted metadata for parameters a region will never use

### Problems that emerge with WQP integration
- No mapping from WQP characteristic names to local codes
- Inconsistency risk — Jamaica has `flouride` (typo) as a code; another region could create `fluoride`
- Cross-region comparison is fragile when codes/units don't match
- Every WQP download would force manual data type creation before importing

---

## Proposed Architecture: Hybrid Catalog + Per-Region Types

> **Superseded by Phase 3.5** (see "Phase 3.5: Catalog becomes the global default" further down). The hybrid design landed first, then the catalog was promoted to the implicit default for every region. The diagrams and rationale below are kept for historical context, but the live model is: catalog parameters exist in a region exactly when their `data_{code}.csv` is on disk; only non-catalog customs live in `region.customDataTypes`. No per-region overrides for catalog entries.

**Keep per-region data types** for flexibility, but add a **shared parameter catalog** that provides standardized defaults and USGS mapping.

### The Catalog: `public/data/catalog_wq.json`

A global lookup table of well-known water quality parameters:

```json
{
  "parameters": {
    "nitrate": {
      "name": "Nitrate",
      "unit": "mg/L",
      "group": "Nutrient",
      "mcl": 10,
      "who": 50,
      "wqp": {
        "characteristicName": "Nitrate",
        "sampleFraction": "Filtered"
      }
    },
    "arsenic": {
      "name": "Arsenic",
      "unit": "ug/L",
      "group": "Inorganics, Minor, Metals",
      "mcl": 10,
      "who": 10,
      "wqp": {
        "characteristicName": "Arsenic",
        "sampleFraction": "Filtered"
      }
    },
    "ph": {
      "name": "pH",
      "unit": "",
      "group": "Physical",
      "mcl": null,
      "who": null,
      "wqp": {
        "characteristicName": "pH",
        "sampleFraction": null
      }
    },
    "conductivity": {
      "name": "Specific Conductance",
      "unit": "uS/cm",
      "group": "Physical",
      "mcl": null,
      "who": null,
      "wqp": {
        "characteristicName": "Specific conductance",
        "sampleFraction": null
      }
    },
    "tds": {
      "name": "Total Dissolved Solids",
      "unit": "mg/L",
      "group": "Physical",
      "mcl": null,
      "who": null,
      "wqp": {
        "characteristicName": "Total dissolved solids",
        "sampleFraction": null
      }
    },
    "chloride": {
      "name": "Chloride",
      "unit": "mg/L",
      "group": "Inorganics, Major, Non-metals",
      "mcl": 250,
      "who": null,
      "wqp": {
        "characteristicName": "Chloride",
        "sampleFraction": "Filtered"
      }
    }
  }
}
```

### What the catalog provides

1. **WQP download mapping** — When results come back with `CharacteristicName = "Nitrate"`, the catalog maps it to code `nitrate`, unit `mg/L`, etc.
2. **Standardized defaults for the DataTypeEditor** — Instead of (or in addition to) cross-region suggestions, show catalog entries as "standard" options. This prevents typos and inconsistency.
3. **Parameter picker for WQP downloads** — The catalog groups parameters by category, making it easy to build a grouped checkbox UI for selecting what to download.
4. **Region-level override** — A region still owns its `dataTypes` array. If Jamaica wants to call it "Sulphate" instead of "Sulfate", or use `mgCaCO3/L` for hardness, that's fine. The catalog provides defaults; the region has final say.
5. **Regulatory reference lines** — `mcl` (EPA Maximum Contaminant Level) and `who` (WHO guideline) values per parameter. When viewing a WQ time series, the chart offers toggles to show these as horizontal reference lines. Values are in the parameter's native unit (e.g. `mcl: 10` for nitrate means 10 mg/L). Null when no standard exists (e.g. pH, conductivity).

### How per-region types and the catalog interact

```
┌─────────────────────────────────┐
│       catalog_wq.json           │  Global, shared, checked in
│  (standardized parameters       │  Provides: code, name, unit,
│   with WQP mapping + MCL/WHO)   │  WQP characteristic mapping
└──────────┬──────────────────────┘
           │
           │  "Add from catalog" or
           │  auto-created during USGS download
           ▼
┌─────────────────────────────────┐
│    region.json → dataTypes[]    │  Per-region, user-editable
│  (code, name, unit)             │  Can override name/unit
│                                 │  Can add custom types not
│                                 │  in catalog (e.g. BOD5, TCE)
└──────────┬──────────────────────┘
           │
           │  One file per type
           ▼
┌─────────────────────────────────┐
│    data_{code}.csv              │  Measurement data
│  (wellId, date, value, ...)     │
└─────────────────────────────────┘
```

### TypeScript interface for catalog entries

```typescript
interface CatalogParameter {
  name: string;
  unit: string;
  group: string;         // e.g. "Nutrient", "Physical", "Inorganics, Minor, Metals"
  mcl: number | null;    // EPA Maximum Contaminant Level (in parameter's unit), null if none
  who: number | null;    // WHO guideline value (in parameter's unit), null if none
  wqp?: {
    characteristicName: string;       // WQP CharacteristicName value
    sampleFraction: string | null;    // "Filtered", "Unfiltered", or null
  };
}

interface ParameterCatalog {
  parameters: Record<string, CatalogParameter>;  // keyed by code
}
```

### Impact on existing features

| Feature | Change needed |
|---------|--------------|
| `DataTypeEditor` | Redesign: catalog becomes the primary way to add types (see below) |
| `DataType` interface | No change — stays as `{ code, name, unit }` |
| `region.json` | No change — catalog codes are just used as defaults |
| USGS well download | No change to well discovery |
| WQP measurement download | New flow: query WQP, map results through catalog to data types |
| Time series chart | Add toggleable EPA MCL and WHO guideline reference lines for WQ data types (values from catalog) |

### DataTypeEditor redesign

The catalog becomes the **primary** way to add data types — not just for USGS downloads but for any region. This handles most parameters in most regions with one click, regardless of data source.

Current add options:
1. Manual (type name/code/unit)
2. Cross-region suggestions (one-click from other regions)

New add options:
1. **Browse catalog** (primary) — grouped collapsible list, one-click add with standardized code/name/unit
2. **From other regions** — still shown, but only for custom types not already in the catalog
3. **Custom type** (fallback) — manual entry for region-specific parameters

```
Add Data Type:
┌──────────────────────────────────────┐
│ ▼ Nutrient                           │
│   + Nitrate (mg/L)                   │
│   + Nitrite (mg/L)                   │
│   + Ammonia (mg/L)                   │
│ ▶ Physical                           │
│ ▶ Major Ions                         │
│ ▶ Minor Metals                       │
│                                      │
│ From other regions:                  │
│   + BOD5 (mg/L)  + TCE (PPM)        │
│                                      │
│ [+ Custom type...]                   │
└──────────────────────────────────────┘
```

Types already in the region are shown as disabled/checked so the user can see what they have. The catalog handles ~30–50 common parameters; anything unusual (BOD5, trichloroethane) is still added via cross-region suggestions or manual entry.

The same catalog-backed picker is reused in the USGS WQ download flow for parameter selection — same component, different context.

### Catalog scope and maintenance

The catalog should cover the **most common groundwater quality parameters** — roughly 30–50 entries. It does not need to be exhaustive; users can always add custom types manually. Initial population would cover:

- **Physical** (6): pH, temperature, specific conductance, turbidity, TDS, hardness
- **Nutrients** (6): nitrate, nitrite, ammonia, phosphorus, total nitrogen, total phosphorus
- **Major ions** (8): calcium, magnesium, sodium, potassium, chloride, sulfate, bicarbonate, carbonate
- **Minor metals** (8): arsenic, iron, manganese, lead, copper, zinc, chromium, selenium
- **Minor non-metals** (3): fluoride, boron, silica
- **Microbiological** (3): E. coli, fecal coliform, total coliform
- **Other** (2–4): dissolved oxygen, alkalinity, BOD, COD

Custom/region-specific parameters (like Jamaica's BOD5, DR's trichloroethane) stay as manual additions outside the catalog.

---

## Design Considerations

### 1. What does the user select? — DECIDED: Individual parameters

The user picks **specific characteristics** (e.g. "Nitrate", "pH", "Arsenic"), not broad groups. Groups are used only as visual organization in the picker UI.

**Rationale:** Each selected parameter becomes one data type → one `data_{code}.csv` → one selectable item in the app's data type dropdown. Since the app views one data type at a time, downloading by broad group would dump parameters the user doesn't need — adding clutter to the data types list with no benefit. The user should choose exactly what they want before anything is downloaded.

**UI approach:** A grouped checkbox picker using the catalog's `group` field for collapsible sections. Group headers can have a "select all" toggle for convenience, but the selection granularity is individual parameters.

```
▼ Nutrient
  ☑ Nitrate (mg/L)
  ☐ Nitrite (mg/L)
  ☑ Ammonia (mg/L)
  ☐ Phosphorus (mg/L)
▶ Physical (collapsed)
▶ Major Ions (collapsed)
▼ Minor Metals
  ☑ Arsenic (ug/L)
  ☐ Iron (mg/L)
  ...
```

### 2. How does it map to Aquifer Analyst data types?
Each characteristic (e.g. Nitrate, Arsenic, pH) becomes its own `DataType` in the region's `dataTypes` array, with its own `data_{code}.csv` file. The catalog provides the code/name/unit mapping automatically.
- Nitrate → `data_nitrate.csv`
- Arsenic → `data_arsenic.csv`
- pH → `data_ph.csv`

### 3. Filtered vs. Unfiltered
The same characteristic can be measured as "Filtered" (dissolved fraction) and "Unfiltered" (total). These are essentially different parameters. Options:
- Default to Filtered and note it
- Let user choose
- Create separate data types (e.g. `arsenic_f` vs `arsenic_t`)

**Recommendation:** The catalog specifies a preferred `sampleFraction` per parameter (usually "Filtered" for dissolved species, null for things like pH/temperature). During download, use the catalog's preference by default. Advanced users could override if needed.

### 4. Unit handling
Water levels are always in feet (converted to meters). Water quality units vary. The `DataType` already has a `unit` field — the catalog populates this automatically during USGS downloads.

### 5. Smart well discovery during measurement import — DECIDED

This is a general workflow problem, not just a USGS WQ issue.

#### The problem

The current app flow is strictly sequential:

```
Region → Aquifers → Wells → Measurements
```

The MeasurementImporter assumes all wells already exist in `wells.csv`. But in practice, measurement data often comes bundled with well identities — and some of those wells may not exist yet:

- **WQP water quality download**: The WQP Station endpoint returns well locations alongside results. Some wells may not be in `wells.csv`.
- **CSV upload (e.g. Jamaica)**: The Excel files had well name + lat/lon + WQ columns. Some wells were new — not in the water-level well set. User had to manually add wells first, then come back to import measurements.
- **USGS water level download**: Currently works around this by requiring wells to be downloaded first (separate step). But it's the same underlying issue.

#### Use cases

**UC1: User has wells, imports measurements for those wells**
- All well IDs match existing `wells.csv`. Simplest case — works today.

**UC2: User imports measurements referencing wells that don't exist yet**
- Source data (CSV or API) includes well location info (lat/lon).
- Currently: user must stop, go add wells, come back. Frustrating.
- Should be: app detects new wells, offers to add them in the same flow.

**UC3: User has no wells at all**
- Measurements card is enabled even when wellCount = 0. Options requiring existing wells are dimmed within the importer.
- The measurement import itself can bootstrap the well set when the data source includes well locations.

**UC4: Partial overlap**
- Some wells match, some are new. Most realistic scenario.
- App should handle both seamlessly.

#### Solution: Auto-discover wells during measurement import

Make the MeasurementImporter smarter — regardless of data source (CSV upload or WQP API).

##### Well matching strategy

Real-world data rarely has clean well ID matches. The Jamaica WQ upload had well names spelled differently from the existing water-level wells and no well IDs at all. Matching had to be done by lat/lon proximity. The matching strategy needs to handle this:

**Matching priority (applied in order):**

1. **Exact well ID match** — if source data has a well_id column and it matches an existing well in `wells.csv`. Fastest, most reliable. Typical for USGS data (site IDs like `USGS-06137570`).

2. **Exact name match** — case-insensitive, trimmed. If source well name matches an existing well name exactly. Quick check before falling back to spatial matching.

3. **Proximity match** — if source data includes lat/lon, find the nearest existing well within a distance threshold. Default threshold: **100m** (covers GPS inaccuracy and minor coordinate differences). Show the user the match for review:
   ```
   CSV: "Spring Grdn Well 2" (18.1234, -77.4567)
    → matched to: "Spring Garden Well #2" (18.1231, -77.4569) — 34m apart
   ```
   User can confirm or reject each proximity match (or bulk-confirm).

4. **No match** — treat as a new well. If lat/lon available, offer to add to `wells.csv` with auto-assigned aquifer (point-in-polygon) and auto-estimated GSE. If no lat/lon, skip with a warning.

**Proximity threshold** should have a sensible default (100m) with a user-adjustable control for edge cases (dense well fields might need a tighter threshold).

##### Auto-generated well IDs

When a new well is created from source data that has no well ID column (e.g. CSV with only name + lat/lon), the app generates a unique ID using the `aqx-` prefix:

```
aqx-{name_slug}-{lat}N{lon}W       (has name)
aqx-{lat}N{lon}W                    (no name)
```

Examples:
- `aqx-spring-garden-18.12N77.46W`
- `aqx-18.1234N77.4567W`

The `aqx-` prefix makes auto-generated IDs identifiable — easy to distinguish from USGS IDs (`USGS-06137570`), WQP agency IDs (`21FLBFA-12345`), or user-assigned IDs. The coordinate suffix ensures uniqueness even when names collide. The name slug is lowercase, alphanumeric + hyphens, truncated to keep IDs reasonable length.

This only applies to CSV imports without a well ID column. WQP downloads always have proper agency-assigned IDs (`MonitoringLocationIdentifier`).

Generated IDs are checked against existing `wells.csv` to avoid collisions. The data quality report notes how many wells received auto-generated IDs.

##### Flow after matching

1. **After data is loaded** (from CSV or API), run the matching strategy above
2. **Show match summary:**
   - "150 wells in source data"
   - "80 matched by ID"
   - "40 matched by proximity (review recommended)"
   - "20 matched by name"
   - "10 new wells (will be added)"
   - Expandable list to review/override proximity matches
3. **For new wells** (with lat/lon):
   - Auto-assign aquifers via point-in-polygon
   - Auto-estimate GSE via elevation API (USGS 3DEP for US, Open-Meteo elsewhere)
4. **User confirms** → wells + measurements saved together
5. **For unmatched wells without lat/lon:**
   - Warn: "X wells not found and no coordinates — their measurements will be skipped"

##### Un-dimming the Measurements card — DECIDED

The Measurements card is **always enabled**, even when wellCount = 0. Data sources that include well locations (WQP download, CSV with lat/lon) can bootstrap the well set from scratch. Within the importer, options that specifically require existing wells (e.g. matching to existing wells) are dimmed/disabled when no wells exist, but the import flow itself is accessible.

##### Benefits across all import flows

- **WQP download:** wells come from the Station endpoint (`LatitudeMeasure`, `LongitudeMeasure`, `MonitoringLocationName`). Matching by site ID (agency-assigned IDs) or proximity.
- **USGS water level download:** could also benefit (currently a separate well download step)
- **CSV upload:** if the CSV has lat/lon columns, same logic applies. Would have solved the Jamaica import problem — matching by proximity instead of requiring exact IDs.

### 6. MeasurementImporter UI flow — DECIDED

The MeasurementImporter keeps its current structure with data source tabs. For US regions, a third USGS option is added:

```
Data Source:
[ Upload CSV ]  [ USGS Water Levels ]  [ Water Quality (WQP) ]
                 ^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^
                 (US regions only)      (US regions only)
```

The existing `isInUS()` check (already used in WellImporter) gates visibility of the USGS and WQP tabs.

**USGS Water Levels** = current flow (parameter 72019, OGC API, works with existing well IDs)

**Water Quality (WQP)** = new flow:
1. Parameter picker (catalog-backed grouped checkboxes)
2. Date range filter (default: last 10 years, adjustable)
3. Count preview before download (WQP count query) — guard against massive downloads
4. Download from WQP (by bounding box + selected characteristics + date range)
5. Well matching + auto-discovery (as described in section 5)
6. Preview summary → confirm → save

**Upload CSV** = current flow, enhanced with:
- Smart well discovery (section 5) when CSV contains well lat/lon columns
- Otherwise unchanged

### 7. Single well set with data-type-aware map display — ALREADY COVERED

Keep **one `wells.csv`** per region. Do not split into separate water-level and water-quality well sets.

**Rationale:** A well is a physical location. Whether you measure water level or nitrate there, it's the same well. Splitting into two files creates duplication (wells with both WL and WQ data), sync headaches, and doubles the import/management complexity.

**Map display concern is already handled by existing features:**
- Well markers are colored per-data-type: blue (2+ observations), gray (1 observation), red ("No data" for the active type). The legend already shows this.
- The "Min obs" filter in the map overlay lets the user hide wells below a threshold, which effectively hides "No data" and 1-observation wells when set to 2+.
- Hiding all non-matching wells wholesale (the original Phase 2 plan) actually removes a useful capability: seeing the full aquifer context so the user knows where data is and isn't.

No code changes needed for Phase 2 — the color-coded markers plus Min obs filter already provide the right balance between full-aquifer visibility and per-data-type focus.

### 8. Download safeguards and date range filtering

WQP queries by bounding box can return massive datasets — a region like Great Salt Lake Basin queried for all nitrate results at wells could return hundreds of thousands of rows. Safeguards needed:

**Date range filter** — Required for WQP downloads. Default to last 10 years, user-adjustable with start/end date pickers. Uses WQP `startDateLo`/`startDateHi` parameters (format `MM-DD-YYYY`). Should be prominent in the download UI, not buried.

**Count preview before download** — Before fetching actual results, run a count query to show the user what they're about to download:
```
Selected: Nitrate, Arsenic, pH
Date range: 2015-01-01 to 2025-12-31
Source: All agencies

Estimated results: 12,400 records at 340 wells
[ Download ]  [ Adjust filters ]
```

WQP supports count queries via `mimeType=csv` with `dataProfile=count`, or by requesting the `totalresults` header. Use this to give the user a preview before committing.

**Response size limit** — If the count exceeds a threshold (e.g. 500,000 records), warn the user and suggest narrowing filters (fewer parameters, tighter date range, smaller area). Don't silently download a 200MB CSV in the browser.

**Pagination / streaming** — For large-but-acceptable downloads, use WQP's `zip=yes` parameter to compress the response, and consider chunking by parameter if needed (one request per `characteristicName` rather than all at once).

### 9. Collision handling: wells, data types, and measurements

Collisions happen at three levels when importing WQ data (from a WQP download or CSV) into a region that already has data.

#### Well collisions

Handled by the matching strategy in section 5:
- Matched wells (by ID, name, or proximity) → reuse the existing `wells.csv` entry, no duplication
- New wells → appended to `wells.csv`
- No user choice needed — always additive for wells. Wells are never deleted or replaced during a measurement import.

#### Data type collisions

After Phase 3.5 the catalog is authoritative globally — `nitrate` doesn't "live in `region.json`", it just exists in a region when `data_nitrate.csv` is on disk. So there's no metadata to collide with:

- The catalog's `code` / `name` / `unit` win for any catalog-backed download. Region overrides are no longer a thing for catalog parameters.
- WQP downloads only ever target catalog parameters (the parameter picker is the catalog), so every downloaded row resolves cleanly to `data_{code}.csv`.
- Custom (non-catalog) types stay in `region.customDataTypes` and aren't reachable from WQP downloads — they only matter for CSV uploads.
- Append/replace semantics (next section) apply at the CSV level. There is no separate "data type collision" decision.

#### Measurement collisions — append vs. replace

This is the real question. The user downloads nitrate from WQP, but `data_nitrate.csv` already has data.

**Scenarios:**
1. **First download** — file doesn't exist → create it. No collision.
2. **Re-download / refresh** — user downloaded nitrate last month, wants updated data. Some records overlap.
3. **Mixed sources** — user uploaded WQ from CSV, now downloads from WQP. Different wells, possibly overlapping dates.

**Import mode toggle** (same pattern as current MeasurementImporter):

```
Import Mode:
(•) Append — add new records, skip duplicates
( ) Replace — delete existing data for these types and write fresh
```

**Append behavior:**
- Duplicate key = `well_id + date` within a given `data_{code}.csv`
- If a record with the same well + date already exists, **skip the new one** (existing data wins)
- This is safe and predictable — user never loses data they already have
- Report: "Nitrate: 1,200 new records added, 340 duplicates skipped"

**Replace behavior:**
- Delete existing `data_{code}.csv` for each downloaded type, write fresh from WQP results
- Only affects the data types being downloaded — other types untouched
- Useful for "start over with fresh USGS data" scenarios

**Scope of append/replace:**
- Applies uniformly to all data types in the current download batch
- If user is downloading nitrate + arsenic + pH, the choice applies to all three
- Per-type control would be over-engineered — if the user wants different handling, they can do separate downloads

**Default:** Append. Safer, non-destructive, and the most common scenario (adding new data).

### 10. Duplicate results per well per date (within a single download)

Separate from the append/replace collision above — this is about duplicates **within the WQP response itself**. A single sampling event can produce multiple results for the same characteristic at the same well on the same date (different labs, different methods, filtered vs. unfiltered).

The `data_{code}.csv` format expects one value per well per date, so deduplication is needed before saving.

**Strategy:**
1. Filter by the catalog's specified `sampleFraction` first (e.g. Filtered for metals, null for pH)
2. If still duplicated, take the first result (deterministic, simple)
3. Report duplicates dropped in the data quality summary

This strategy is the default for Phase 4. Will validate against real WQP response data during implementation and adjust if edge cases emerge.

### 10. Reuse of existing infrastructure
- `fetchWithRetry` — pattern reusable, but WQP needs no API key, so a simpler WQP-specific fetch function is probably cleaner
- `validateUSGSMeasurements` — date validation logic reusable, value range checks need to be per-characteristic
- `assignWellToAquifer` (point-in-polygon) — reuse for auto-assigning new wells to aquifers
- GSE interpolation (USGS 3DEP / Open-Meteo) — reuse for new wells
- `isInUS()` — reuse for gating the WQP download tab (already used in WellImporter)
- Data quality report — same pattern, extended for WQ-specific issues

---

## What's universal vs. US-only

| Feature | Scope | Benefits |
|---------|-------|---------|
| **Parameter catalog** (`catalog_wq.json`) | All regions | Standardized data type definitions for any region worldwide |
| **DataTypeEditor redesign** (catalog browse) | All regions | One-click data type creation from catalog for Jamaica, Jordan, etc. |
| **Smart well discovery** (matching + auto-add) | All regions | Any CSV import with lat/lon benefits, regardless of country |
| **Proximity-based well matching** | All regions | Solves the Jamaica-style name mismatch problem everywhere |
| **Data-type-aware map display** | All regions | Already covered by existing per-data-type well color legend and Min obs filter |
| **Water quality download (WQP)** | US only | Download tab gated by `isInUS()` |
| **Water level download (USGS OGC)** | US only | Already gated by `isInUS()` (no change) |

The catalog + DataTypeEditor + smart well discovery are **standalone deliverables** that benefit every region immediately and lay the foundation for the WQP download. They can ship first.

---

## Implementation phasing (suggested)

**Phase 1: Catalog + DataTypeEditor redesign** (all regions)
- Create `catalog_wq.json` with ~35 common parameters + WQP mapping + MCL/WHO values
- Redesign DataTypeEditor: catalog browse as primary, cross-region suggestions for custom types, manual as fallback
- No API integration yet — just better data type management

**Phase 2: Data-type-aware map display** — already covered (see section 7)
- Existing per-data-type well color legend (blue / gray / red "No data") and Min obs filter already provide the right behavior. No new code.

**Phase 3: Smart well discovery** (all regions)
- Well matching strategy (ID → name → proximity) in MeasurementImporter
- Auto-add new wells during measurement import when lat/lon available
- Benefits CSV uploads immediately (Jamaica-style problem solved)

**Phase 4: Water quality download via WQP** (US only)
- WQP API client (fetch results, fetch stations)
- Parameter picker — catalog-backed multi-select. Filtered to entries that carry `wqp.characteristicName`. Reuses the grouped-by-category layout from `CatalogBrowser`; non-catalog parameters aren't reachable from WQP downloads (no characteristic name → nothing to query).
- Date range filter + count preview + download safeguards
- Data source toggle (USGS only vs. all agencies)
- Deduplication: per `wqp.sampleFraction` first, then take-first on remaining duplicates
- Integration into MeasurementImporter as a third data source tab. Because every WQP row carries a `CharacteristicName` and the catalog tells us its code, **the column-mapping editor is bypassed** for this tab — rows route directly to `data_{code}.csv` per catalog code. The well-matching panel still applies (Station endpoint produces lat/lng for every site).

---

## Notes

- **Visualization**: Keep the current Recharts line chart for WQ time series. Revisit if sparse/irregular data proves problematic.
- **Duplicate deduplication**: Deferred to Phase 4 — validate the filter-by-fraction + take-first strategy against real WQP data during implementation.

---

## Phase 3.5: Catalog becomes the global default (refactor)

Phases 1–3 landed with an explicit per-region `dataTypes` list that the user curated by browsing the catalog, picking from other regions, or typing in a custom. That's more friction than WQ parameters deserve — nitrate is nitrate everywhere. This phase flips the model so the catalog is the implicit default for every region and per-region setup disappears for the standard parameters.

### Core idea

- **`catalog_wq.json` is the global vocabulary and is immutable from a region's perspective.** Every region implicitly "has" every catalog entry. A region cannot rename "Sulfate" to "Sulphate" or change a catalog unit — the catalog is authoritative so cross-region comparison stays sane.
- **Effective data types for a region = WTE + catalog entries with data in this region + that region's custom types.**
- **A catalog type "exists" in a region when `data_{code}.csv` exists.** No pre-declaration needed. Drop a CSV with a `nitrate` column and nitrate appears in the dropdown after save.
- **`region.json` shrinks** from `dataTypes: DataType[]` to `customDataTypes: DataType[]` — only non-catalog parameters (BOD5, trichloroethane, alternate-unit hardness variants).
- **If a region needs a genuinely different unit or name** (e.g. hardness as mgCaCO3/L instead of mg/L), that's a **custom type with a non-catalog code** like `hardness_caco3` — a different parameter in its own right, not an override of the catalog entry.

### Data model changes

#### `region.json`

```jsonc
{
  "id": "jamaica",
  "name": "Jamaica",
  "lengthUnit": "m",
  "singleUnit": false,
  "customDataTypes": [
    { "code": "bod5", "name": "BOD5", "unit": "mg/L" },
    { "code": "hardness_caco3", "name": "Hardness (as CaCO3)", "unit": "mgCaCO3/L" }
  ]
}
```

**Rule:** `customDataTypes` codes MUST NOT collide with catalog codes. Validation enforces this on save. Customs are for parameters the catalog doesn't cover; if you think the catalog is wrong for everyone, update `catalog_wq.json`, not a single region.

#### TypeScript interfaces

```ts
interface RegionMeta {
  id: string;
  name: string;
  lengthUnit: 'ft' | 'm';
  singleUnit: boolean;
  customDataTypes: DataType[];  // renamed from dataTypes; must not collide with catalog codes
}

interface Region extends RegionMeta {
  geojson: any;
  bounds: [number, number, number, number];
  // effectiveDataTypes is computed at load time, not stored
  effectiveDataTypes: DataType[];
}
```

`dataLoader.ts` computes `effectiveDataTypes` when building a `Region`:

1. Start with `{ code: 'wte', name: 'Water Table Elevation', unit: lengthUnit === 'm' ? 'm' : 'ft' }`.
2. For each catalog code, check if `data_{code}.csv` exists — if yes, add the catalog entry's `{ code, name, unit }` unchanged.
3. Add any `customDataTypes` entry whose `data_{code}.csv` exists (they're the region's genuine non-catalog params like BOD5 or `hardness_caco3`).

Result: a region with only WTE + nitrate data shows a two-item dropdown. A region with WTE + 18 WQ types shows a 19-item dropdown. No noise.

### Migration (one-time, minimal)

The repo state after the Jamaica reset is almost trivial to migrate:

- **Most regions** have only WTE → `customDataTypes: []`.
- **Dominican Republic** has WTE + `trichloroethane` + `salinity` — both non-catalog → `customDataTypes: [trichloroethane, salinity]`.
- **Jamaica** is already reset to just WTE (WQ data and wells will be re-imported fresh after this refactor).

No fuzzy-match logic or CSV renaming is needed — no region currently carries catalog-code-conflicting `dataTypes`. The migration step is therefore just a schema rewrite:

1. For each `region.json`, load the current `dataTypes`.
2. Drop any entry whose code is `wte` or matches a catalog code (shouldn't exist given current state, but the check is cheap insurance).
3. Write the remaining entries as `customDataTypes`.
4. Validate that no `customDataTypes` entry collides with a catalog code; fail loudly if so.

This runs once as a small Node script checked into `scripts/` (or inline inside the first PR of Phase 3.5), with the results committed.

### UI changes

#### Header data type dropdown (`App.tsx`)
- Reads `selectedRegion.effectiveDataTypes` instead of `dataTypes`.
- Otherwise unchanged. If the effective list has a single entry (WTE), the dropdown is hidden (existing behavior).

#### `DataTypeEditor`
- **Only manages customs now.** Conceptually rename to "Custom Data Types" (the component filename can stay).
- **Catalog browse moves to a separate read-only viewer** (see "Catalog Browser" below). A "Browse Catalog" link inside DataTypeEditor opens it so users can see what's already covered before deciding to create a custom.
- Two add options remain:
  - **Custom Type** — manual entry. Validation blocks any code that collides with a catalog entry and prompts "Did you mean to import a column as catalog X?".
  - **From other regions** — cross-region suggestions, still useful for custom codes (one region's TCE can seed another). Filtered to non-catalog codes only.
- List shows: WTE (locked), each custom type (editable name/unit, deletable). No override rows.
- Effective types are *displayed* in the header dropdown for reference, but not editable here. The informational note: "Catalog parameters appear automatically once you import data for them. [Browse Catalog]".

#### Catalog Browser (new read-only component)

A standalone, read-only view of `catalog_wq.json` — users can see every parameter, grouped by category, with name, code, unit, group, MCL, and WHO values. No add/edit/delete actions; the catalog is authoritative.

**Layout:**

```
Parameter Catalog                                                    [Close]
─────────────────────────────────────────────────────────────────────────
Search: [__________________]                     38 parameters, 7 groups

▼ Nutrient (6)
    Nitrate            nitrate           mg/L    MCL 10    WHO 50
    Nitrite            nitrite           mg/L    MCL 1     WHO 3
    Ammonia            ammonia           mg/L    —         —
    ...
▼ Physical (6)
    pH                 ph                —       —         —
    Temperature        temperature       deg C   —         —
    ...
▶ Major Ions (8)
▶ Minor Metals (8)
▶ Minor Non-metals (3)
▶ Microbiological (3)
▶ Other (4)
```

- Collapsible groups (same as Phase 1's picker, minus the checkboxes).
- Search filter across code / name / WQP characteristic name — helpful when the user is looking for a specific thing.
- Clicking a row shows a small popover with WQP mapping (`characteristicName`, `sampleFraction`) for power users.

**Access points:**
1. **DataTypeEditor** → "Browse Catalog" link (for users considering a custom type).
2. **MeasurementImporter** → "View Catalog" link next to the detection panel header (for users about to map CSV columns).

Both open the same modal component. Implementation: `components/CatalogBrowser.tsx`.

#### `MeasurementImporter` — column detection becomes a mapping editor

The current detection panel treats each candidate column as a binary include/exclude with an inferred target. The new model is a **three-column mapping editor** because users need to:

1. **Opt out of columns they don't care about** — a CSV with 20 columns might only warrant importing 2.
2. **Correct typos and variant spellings** — "Nitrte", "Nitrogen-N", "NO3-N", "Sulphate" should all be mappable to the right catalog entry, not forced into custom territory because the auto-match missed.
3. **Promote a false-custom match to catalog** — or vice versa, demote an unwanted catalog match to a custom type.

**Panel layout** (per row):

```
[✓] Column: "nitrate"              → Target: [Nitrate (catalog) ▼]   Unit: mg/L
[✓] Column: "NO3-N"                → Target: [Nitrate (catalog) ▼]   Unit: mg/L    [auto-match]
[ ] Column: "Bacteria_Count"       → Target: [E. coli (catalog)  ▼]   Unit: CFU/100mL
[✓] Column: "BOD5"                 → Target: [+ New custom type ▼]   Code: bod5   Unit: mg/L
[ ] Column: "Sample_ID"            → Target: [— Skip —            ▼]
```

The **Target dropdown** is the key new element. Options:
- **Catalog entries** (grouped by category) — the full catalog, searchable. Picks the code/name/unit from the catalog.
- **Existing region customs** — already-defined `customDataTypes` so repeated imports land in the same file.
- **+ New custom type** — creates a custom type; exposes editable code/name/unit fields inline. Code must not collide with the catalog.
- **— Skip —** — don't import this column.

**Auto-match behavior**: the importer runs `suggestDataTypesFromColumns` to pre-select the Target for each row. Catalog matches are pre-checked; anything that falls through to custom or skip is pre-unchecked. The user can override any Target by opening the dropdown.

**Bulk toggles** at the top of the panel: "Include all" / "Only catalog matches" / "None" — makes the 20-column case fast.

**Unit display**:
- **Catalog target** → unit is read-only (catalog is authoritative). If the CSV header explicitly includes a unit (e.g. `nitrate (ug/L)`) and it doesn't match the catalog, show a yellow warning badge: `header says ug/L, catalog is mg/L — verify your values before importing`. Values import as-is; the app does not auto-convert. The user can uncheck the row, fix the CSV, and re-upload if needed. In practice headers rarely include units, so this fires only in narrow cases — build conversion tooling later if the warning proves insufficient.
- **Custom target** → unit is editable. Default to the CSV header's unit hint, or blank.
- **Skip** → unit field hidden.

**`newDataTypesToAdd`** feeds `customDataTypes` only for rows whose Target is `+ New custom type`. Catalog-targeted rows don't need to be "added" — they're implicit once their CSV is written.

#### `ImportDataHub`
- The "Data Types" editor card description changes to "Custom Data Types" (same component, scoped purpose).
- Measurement counts shown per region still use `effectiveDataTypes` for display.

### Services that change

| File | Change |
|------|--------|
| `services/catalog.ts` | Add `getCatalogTypeAsDataType(code)` helper that returns a `DataType` from a catalog code. |
| `services/dataLoader.ts` | Compute `effectiveDataTypes` when building Region: scan `data_*.csv` filenames, merge catalog + customs + overrides. |
| `services/wellMatching.ts` | `suggestDataTypesFromColumns` already handles catalog-first matching — tweak the return so catalog hits are flagged `autoApply: true` and customs are `needsReview: true`. |
| `services/importUtils.ts` | No change. |
| `components/import/DataTypeEditor.tsx` | Rework to edit only customs; catalog browse removed (link to CatalogBrowser instead). |
| `components/CatalogBrowser.tsx` | New read-only catalog viewer, grouped + searchable. Opened from DataTypeEditor, ImportDataHub, and MeasurementImporter. |
| `components/import/MeasurementImporter.tsx` | Filter the detection panel to only show non-catalog suggestions; auto-apply the rest. |
| `App.tsx` | Read from `selectedRegion.effectiveDataTypes`. |
| `types.ts` | `RegionMeta.dataTypes` → `customDataTypes`; `Region` gains `effectiveDataTypes`. |
| `vite.config.ts` | Endpoint for listing `data_*.csv` per region so `dataLoader` can compute effective types. Or include the filename list in the `/api/regions` response. |

### Edge cases and decisions

- **Listing data files per region**: either list via `fs.readdir` in a new middleware endpoint, or extend `/api/regions` to include a `dataFiles: string[]` field per region. The second is cheaper since we already walk the folder. Go with that.
- **Empty data file edge case**: a zero-row `data_nitrate.csv` would still count as "nitrate exists in this region". Acceptable — the user either imports data (making it real) or they don't (empty dropdown entry, deletable via DataTypeEditor as an override to "remove").
- **Deleting a data type from a region**: today DataTypeEditor deletes both the metadata and the CSV. In the new model, deletion means removing the CSV (and any override). Implementation is the same file-delete; the type disappears from `effectiveDataTypes` on next load because its CSV is gone.
- **Region with zero data**: empty effective list except WTE. Existing bootstrap-from-CSV flow (Phase 3) still works because detection accepts catalog columns automatically.
- **Unit mismatch at import**: fires only when the CSV header explicitly carries a unit (e.g. `nitrate (ug/L)`) that disagrees with the catalog. Shows a warning badge; values import as-is. Users fix by correcting the CSV and re-uploading, or opt out of the row. No auto-conversion in this refactor — add it later if this turns out to be a real pain point.
- **Backwards compat for consumers outside this refactor**: raster analyses, imputation models, etc. store a `dataType: string` code. These still work — the code is just a key.
- **Jamaica's past `flouride` typo**: the migration script's fuzzy-match tier reconciles `flouride` → `fluoride` by renaming `data_flouride.csv` to `data_fluoride.csv` (with user confirmation). Same for `sulphate` → `sulfate`. No override mechanism needed.
- **Custom-code collision with catalog**: if a user tries to create a custom type with a code that exists in the catalog, validation blocks it and suggests importing the column as the catalog entry instead.
- **No pre-staging empty types**: under this model, a data type exists in a region exactly when its `data_{code}.csv` exists. You cannot "add Nitrate" to a region before importing data for it — there's no useful behavior for an empty type (nothing to chart, nothing to map, nothing to analyze). The only user-visible action that creates a type is importing data. This is a deliberate simplification of the old "declare then import" workflow. **Document this clearly** in the DataTypeEditor help text, in ImportDataHub's empty-state copy, and in CLAUDE.md's conventions section so the behavior doesn't surprise future maintainers.

### Implementation phasing

**Phase 3.5a: Data model + loader** — **done**
- Added `RegionMeta.customDataTypes` and `Region.effectiveDataTypes`.
- `/api/regions` now returns `dataFiles: string[]` per region.
- `dataLoader.ts` and `services/catalog.ts#computeEffectiveDataTypes` compose the effective list from WTE + catalog-with-data + customs-with-data.
- All consumers (App.tsx, ImportDataHub, MeasurementImporter, DataTypeEditor, WellImporter, AquiferImporter, RegionImporter, AquiferEditor) updated.

**Phase 3.5b: Migration** — **done (manual)**
- All 9 existing `region.json` files rewritten by hand rather than via a script; only DR kept non-catalog customs (`trichloroethane`, `salinity`, since removed by the user).

**Phase 3.5c: DataTypeEditor rework + Catalog Browser** — **done** (bundled with 3.5a commit)
- DataTypeEditor now manages customs only; catalog browse removed from the editor.
- Catalog-code collisions blocked with an inline error.
- New `components/CatalogBrowser.tsx` read-only modal opened from DataTypeEditor ("Browse Catalog" link) and MeasurementImporter ("View Catalog" link).

**Phase 3.5d: MeasurementImporter mapping editor** — **done**
- Detection panel is now a per-column mapping editor with a Target dropdown (catalog entries / region customs / new custom / … toggleable).
- Every column is explicit opt-in/out regardless of match type — catalog matches pre-checked, new customs pre-unchecked.
- Bulk toggles: Include all / Only catalog matches / None.
- Unit mismatch (CSV header unit disagrees with catalog) flagged with a warning; values import as-is, no auto-conversion.
- `suggestDataTypesFromColumns` source categories cleaned up; catalog matches win first.

**Phase 3.5e: Cleanup** — **done**
- Delete any code that relied on the old "user pre-declares types before import" assumption. **done** — removed the stale `isMultiType` auto-match effect in `MeasurementImporter.tsx` that iterated region `dataTypes` to seed `typeColumnMapping`; the column-mapping editor's sync effect already drives this in the opposite direction and was being clobbered by the legacy matcher.
- Audit confirmed: `types.ts`, `services/catalog.ts`, `services/dataLoader.ts`, `App.tsx`, and the importers all read from `customDataTypes` + `effectiveDataTypes` only; legacy `dataTypes` references are isolated to the in-memory migration normalizers (`dataLoader.ts`, `ImportDataHub.tsx`, `RegionImporter.tsx`, `DataTypeEditor.tsx`'s cross-region suggestions, `MeasurementImporter.tsx`'s other-region seed list), which stay intentionally for backwards-compat with unmigrated `region.json` files on disk.
- Update CLAUDE.md conventions (data type section). **done**

### Risks

- **Big blast radius**: touches types, loader, App, every importer, and every stored `region.json`. Phase 3.5a needs to keep the app functional the whole time; can't half-migrate.
- **Hidden consumers of `dataTypes`**: raster/imputation code reads `region.dataTypes` to show dropdowns and allocate storage. All need updating to `effectiveDataTypes`.
