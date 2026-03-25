# USGS Water Quality Download Integration

## Background

AquiferX already downloads **groundwater levels** from the USGS via the OGC API (`api.waterdata.usgs.gov/ogcapi/v0`), using parameter code `72019` (depth to water below land surface). The existing integration includes well discovery by bounding box, batched CQL2 POST measurement queries, retry/rate-limit handling, and data validation.

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

These are the `characteristicGroup` (Samples API) / `characteristicType` (WQP) values most relevant to groundwater:

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
| API | OGC API (`/ogcapi/v0`) | Samples Data API (`/samples-data`) |
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

### Problems that emerge with USGS integration
- No mapping from USGS characteristic names to local codes
- Inconsistency risk — Jamaica has `flouride` (typo) as a code; another region could create `fluoride`
- Cross-region comparison is fragile when codes/units don't match
- Every USGS download would force manual data type creation before importing

---

## Proposed Architecture: Hybrid Catalog + Per-Region Types

**Keep per-region data types** for flexibility, but add a **shared parameter catalog** that provides standardized defaults and USGS mapping.

### The Catalog: `public/data/catalog.json`

A global lookup table of well-known water quality parameters:

```json
{
  "parameters": {
    "nitrate": {
      "name": "Nitrate",
      "unit": "mg/L",
      "group": "Nutrient",
      "wqp": {
        "characteristicName": "Nitrate",
        "sampleFraction": "Filtered"
      }
    },
    "arsenic": {
      "name": "Arsenic",
      "unit": "ug/L",
      "group": "Inorganics, Minor, Metals",
      "wqp": {
        "characteristicName": "Arsenic",
        "sampleFraction": "Filtered"
      }
    },
    "ph": {
      "name": "pH",
      "unit": "",
      "group": "Physical",
      "wqp": {
        "characteristicName": "pH",
        "sampleFraction": null
      }
    },
    "conductivity": {
      "name": "Specific Conductance",
      "unit": "uS/cm",
      "group": "Physical",
      "wqp": {
        "characteristicName": "Specific conductance",
        "sampleFraction": null
      }
    },
    "tds": {
      "name": "Total Dissolved Solids",
      "unit": "mg/L",
      "group": "Physical",
      "wqp": {
        "characteristicName": "Total dissolved solids",
        "sampleFraction": null
      }
    },
    "chloride": {
      "name": "Chloride",
      "unit": "mg/L",
      "group": "Inorganics, Major, Non-metals",
      "wqp": {
        "characteristicName": "Chloride",
        "sampleFraction": "Filtered"
      }
    }
  }
}
```

### What the catalog provides

1. **USGS download mapping** — When results come back with `Result_Characteristic = "Nitrate"`, the catalog maps it to code `nitrate`, unit `mg/L`, etc.
2. **Standardized defaults for the DataTypeEditor** — Instead of (or in addition to) cross-region suggestions, show catalog entries as "standard" options. This prevents typos and inconsistency.
3. **Parameter picker for USGS downloads** — The catalog groups parameters by category, making it easy to build a grouped checkbox UI for selecting what to download.
4. **Region-level override** — A region still owns its `dataTypes` array. If Jamaica wants to call it "Sulphate" instead of "Sulfate", or use `mgCaCO3/L` for hardness, that's fine. The catalog provides defaults; the region has final say.

### How per-region types and the catalog interact

```
┌─────────────────────────────────┐
│         catalog.json            │  Global, shared, checked in
│  (standardized parameters       │  Provides: code, name, unit,
│   with USGS mapping)            │  USGS characteristic + pcode
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
| USGS measurement download | New flow: query Samples Data API, map results through catalog to data types |

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

### 2. How does it map to AquiferX data types?
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

- **USGS water quality download**: The Samples API returns well locations alongside results. Some wells may not be in `wells.csv`.
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
- Currently blocked — Measurements card is dimmed when wellCount = 0.
- With smart discovery: the measurement import itself can bootstrap the well set.

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

##### Un-dimming the Measurements card

This also means **un-dimming the Measurements card** when wellCount = 0, at least for data sources that include well locations (USGS download, or CSV with lat/lon columns).

##### Benefits across all import flows

- **WQP download:** wells come from the Station endpoint (`LatitudeMeasure`, `LongitudeMeasure`, `MonitoringLocationName`). Matching by site ID (USGS wells) or proximity (non-USGS wells).
- **USGS water level download:** could also benefit (currently a separate well download step)
- **CSV upload:** if the CSV has lat/lon columns, same logic applies. Would have solved the Jamaica import problem — matching by proximity instead of requiring exact IDs.

### 6. MeasurementImporter UI flow — DECIDED

The MeasurementImporter keeps its current structure with data source tabs. For US regions, a third USGS option is added:

```
Data Source:
[ Upload CSV ]  [ USGS Water Levels ]  [ USGS Water Quality ]
                 ^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^
                 (US regions only)      (US regions only)
```

The existing `isInUS()` check (already used in WellImporter) gates visibility of the USGS tabs.

**USGS Water Levels** = current flow (parameter 72019, OGC API, works with existing well IDs)

**USGS Water Quality** = new flow:
1. Parameter picker (catalog-backed grouped checkboxes)
2. Date range filter (default: last 10 years, adjustable)
3. Count preview before download (WQP count query) — guard against massive downloads
4. Download from WQP (by bounding box + selected characteristics + date range)
5. Well matching + auto-discovery (as described in section 5)
6. Preview summary → confirm → save

**Upload CSV** = current flow, enhanced with:
- Smart well discovery (section 5) when CSV contains well lat/lon columns
- Otherwise unchanged

### 7. Single well set with data-type-aware map filtering — DECIDED

Keep **one `wells.csv`** per region. Do not split into separate water-level and water-quality well sets.

**Rationale:** A well is a physical location. Whether you measure water level or nitrate there, it's the same well. Splitting into two files creates duplication (wells with both WL and WQ data), sync headaches, and doubles the import/management complexity. The underlying concern — map clutter when viewing a data type that only applies to a subset of wells — is a display problem, not a data model problem.

**Solution:** Filter the map display by the active data type. When viewing nitrate, only show wells that appear in `data_nitrate.csv`. When viewing water levels, only show wells in `data_wte.csv`. The data to do this already exists — each `data_{code}.csv` has a `well_id` column.

This requires changes to:
- **Map rendering**: Filter well markers by active data type's well IDs
- **Sidebar well list** (if applicable): Same filter
- **Well count display**: Could show "X of Y wells" to indicate filtering

This is a separate, smaller piece of work that can be done independently of the USGS WQ download feature, but should be in place before users start mixing large WL and WQ well sets in the same region.

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

Collisions happen at three levels when importing WQ data (from WQP download or CSV) into a region that already has data.

#### Well collisions

Handled by the matching strategy in section 5:
- Matched wells (by ID, name, or proximity) → reuse the existing `wells.csv` entry, no duplication
- New wells → appended to `wells.csv`
- No user choice needed — always additive for wells. Wells are never deleted or replaced during a measurement import.

#### Data type collisions

If the user downloads nitrate but `nitrate` already exists as a data type in `region.json`:
- **Just use it.** Don't recreate, don't prompt. The data type already has the right code/name/unit.
- If the existing name/unit differs from the catalog (e.g. region has "Nitrate-N" instead of "Nitrate"), keep the region's version — region has final say.
- Only create new data types for parameters not already in the region's `dataTypes[]`.

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

**Not fully resolved** — needs investigation of actual WQP response data during implementation to understand how common this is and whether more nuanced handling is needed.

### 10. Reuse of existing infrastructure
- `fetchWithRetry` — pattern reusable, but WQP is a different domain (no API key needed), so a simpler WQP-specific fetch function is probably cleaner
- `validateUSGSMeasurements` — date validation logic reusable, value range checks need to be per-characteristic
- `assignWellToAquifer` (point-in-polygon) — reuse for auto-assigning new wells to aquifers
- GSE interpolation (USGS 3DEP / Open-Meteo) — reuse for new wells
- `isInUS()` — reuse for gating USGS/WQP options (already used in WellImporter)
- Data quality report — same pattern, extended for WQ-specific issues

---

## What's universal vs. US-only

| Feature | Scope | Benefits |
|---------|-------|---------|
| **Parameter catalog** (`catalog.json`) | All regions | Standardized data type definitions for any region worldwide |
| **DataTypeEditor redesign** (catalog browse) | All regions | One-click data type creation from catalog for Jamaica, Jordan, etc. |
| **Smart well discovery** (matching + auto-add) | All regions | Any CSV import with lat/lon benefits, regardless of country |
| **Proximity-based well matching** | All regions | Solves the Jamaica-style name mismatch problem everywhere |
| **Data-type-aware map filtering** | All regions | Show only relevant wells for the active data type |
| **WQP water quality download** | US only | Download tab gated by `isInUS()` |
| **USGS water level download** | US only | Already gated by `isInUS()` (no change) |

The catalog + DataTypeEditor + smart well discovery are **standalone deliverables** that benefit every region immediately and lay the foundation for the WQP download. They can ship first.

---

## Implementation phasing (suggested)

**Phase 1: Catalog + DataTypeEditor redesign** (all regions)
- Create `catalog.json` with ~35 common parameters + WQP mapping
- Redesign DataTypeEditor: catalog browse as primary, cross-region suggestions for custom types, manual as fallback
- No API integration yet — just better data type management

**Phase 2: Data-type-aware map filtering** (all regions)
- Filter map markers and sidebar by which wells have data for the active data type
- Independent of WQ download, but needed before mixing large WL + WQ well sets

**Phase 3: Smart well discovery** (all regions)
- Well matching strategy (ID → name → proximity) in MeasurementImporter
- Auto-add new wells during measurement import when lat/lon available
- Benefits CSV uploads immediately (Jamaica-style problem solved)

**Phase 4: WQP water quality download** (US only)
- WQP API client (fetch results, fetch stations)
- Parameter picker (reuses catalog browser component from Phase 1)
- Date range filter + count preview + download safeguards
- Deduplication strategy
- Integration into MeasurementImporter as third data source tab

---

## Open Questions

1. **Visualization** — Water quality time series are sparse and irregular. Does the existing Recharts-based chart work well for this, or does it need adaptation (e.g. scatter plot vs. line chart)?

2. **Regulatory context** — Should the app display EPA MCLs (Maximum Contaminant Levels) or WHO guidelines as reference lines on charts? Could be a future addition to the catalog (a `mcl` field per parameter).

3. **Catalog file location** — `public/data/catalog.json` keeps it with the data. Alternatively, it could be a TypeScript constant in the source code since it changes rarely. JSON file is more accessible for non-developer editing.

4. **Un-dimming measurements when wellCount = 0** — Currently the Measurements card is disabled until wells exist. With smart well discovery, we could allow measurement import even with no wells (for sources that include well locations). How aggressive should this be? Always enabled? Only when data source includes well locations?

5. **Duplicate results deduplication** — Need to investigate actual WQP response data to determine how common duplicates are and what strategy works best. Flag for Phase 4 implementation.
