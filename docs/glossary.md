# Glossary

Key terms used throughout Aquifer Analyst and this documentation.

---

**Aquifer**
:   A subsurface layer of rock or sediment that holds and transmits groundwater. In Aquifer Analyst, aquifers are spatial subdivisions within a region, each defined by a boundary polygon.

**aqx- ID**
:   The prefix used for well identifiers that the application generates automatically when importing measurements from a source with no usable well ID. Examples: `aqx-spring-garden-18.12N77.46W` (with a name) or `aqx-18.12N77.46W` (no name). The `aqx-` prefix lets you distinguish locally-generated IDs from agency-assigned ones (USGS, WQP) and from IDs you supplied yourself.

**Bilinear Interpolation**
:   A method for estimating a value at a point using the four surrounding grid cell values. Used when sampling raster surfaces for cross-section profiles and cursor tooltips.

**Catalog (Parameter Catalog)**
:   The built-in, curated list of standardized water quality parameters that ships with the application — roughly 38 of the most commonly measured groundwater parameters (nitrate, arsenic, pH, dissolved oxygen, etc.). Each catalog parameter has a fixed name, unit, category, and (where applicable) MCL/WHO drinking-water reference values. Catalog parameters are implicitly available in every region; a parameter shows up in a region's data type dropdown after you've imported measurements for it. The full catalog can be browsed read-only from the Catalog Browser modal.

**CRS (Coordinate Reference System)**
:   A system that defines how spatial coordinates map to locations on Earth. Aquifer Analyst works internally in WGS 84 (EPSG:4326) and automatically reprojects data from other CRS definitions.

**Data Type**
:   A category of measurement in Aquifer Analyst (e.g., water table elevation, salinity). Each data type has a code, name, and unit. Data is stored in separate files per type (`data_{code}.csv`).

**ELM (Extreme Learning Machine)**
:   A single-hidden-layer neural network where input weights are randomly assigned and only the output weights are trained. Used in Aquifer Analyst for imputing missing groundwater data based on climate features.

**GLDAS (Global Land Data Assimilation System)**
:   A NASA dataset that provides global, gridded climate and hydrology variables including soil moisture. Aquifer Analyst uses GLDAS soil moisture as input features for the ELM imputation model.

**GSE (Ground Surface Elevation)**
:   The elevation of the land surface at a well location, measured from a reference datum (typically mean sea level). Used as a reference line in time series charts and for converting depth measurements to elevation.

**Haversine Distance**
:   A formula for computing the great-circle distance between two points on a sphere, given their latitude and longitude. Used throughout Aquifer Analyst for geographic distance calculations.

**IDW (Inverse Distance Weighting)**
:   A spatial interpolation method that estimates values at unsampled locations as a weighted average of nearby observations, with weights inversely proportional to distance raised to a power.

**Kriging**
:   A geostatistical interpolation method that uses a model of spatial covariance (the variogram) to produce optimal, unbiased predictions at unsampled locations. Named after South African mining engineer Danie Krige.

**Marching Squares**
:   An algorithm for generating contour lines from gridded data. It examines each 2×2 cell of the grid and determines where contour lines cross cell edges.

**MCL (Maximum Contaminant Level)**
:   A regulatory drinking-water threshold set by the U.S. EPA for many water quality parameters (e.g. 10 mg/L for nitrate, 0.010 mg/L for arsenic). Stored per-parameter in the catalog and shown in the catalog browser. Values may be plotted as horizontal reference lines on water quality charts in future versions.

**MAvg (Moving Average)**
:   A smoothing technique that replaces each value with a weighted average of nearby values. In Aquifer Analyst, this uses a Nadaraya-Watson kernel regression with a Gaussian kernel.

**Nugget**
:   In geostatistics, the nugget represents micro-scale variability and measurement error. It is the variance at zero distance in the variogram. A higher nugget produces smoother interpolated surfaces.

**PCHIP (Piecewise Cubic Hermite Interpolating Polynomial)**
:   A smooth interpolation method that preserves the monotonicity of the data — it does not overshoot or oscillate between data points. Used for temporal interpolation of well measurements.

**R² (Coefficient of Determination)**
:   A statistical measure (0 to 1) of how well a model explains the variance in the observed data. An R² of 1 means perfect prediction; 0 means the model is no better than predicting the mean.

**Range (Variogram)**
:   The distance at which spatial correlation between observations effectively reaches zero. Beyond the range, observations are considered spatially independent.

**Raster**
:   A grid-based spatial data format where each cell contains a value representing a continuous surface (e.g., interpolated water table elevation). Generated by the spatial analysis wizard.

**Region**
:   The top-level geographic unit in Aquifer Analyst. A region is defined by a boundary polygon and contains aquifers, wells, and measurements.

**Sample Fraction**
:   In water quality data, an attribute distinguishing whether a sample was filtered (dissolved species only) or unfiltered (total, including suspended particles). The catalog specifies a preferred fraction per parameter — typically `Filtered` for dissolved metals and major ions, `null` for parameters where filtration is irrelevant (pH, temperature). WQP downloads drop rows whose sample fraction doesn't match the catalog preference.

**Smart Well Discovery**
:   The pipeline in the measurement importer that resolves source rows to wells via a four-stage fallback: exact ID match, exact name match, proximity match (default 100m), and finally creating a new well with an `aqx-` prefixed identifier. Always-on for WQP downloads, opt-in for CSV uploads via the "Measurements file includes well locations" toggle.

**Ridge Regression**
:   A regularized linear regression method that adds a penalty term (\(\lambda \mathbf{I}\)) to the normal equations, preventing overfitting and improving numerical stability. Used in ELM training.

**RMSE (Root Mean Squared Error)**
:   A measure of prediction error magnitude, calculated as the square root of the average squared differences between predicted and observed values. Reported in the same units as the data.

**Sill (Variogram)**
:   The total variance of the data, representing the maximum value the variogram reaches. The sill minus the nugget gives the spatial variance.

**Specific Yield**
:   The ratio of the volume of water that drains from a saturated rock under gravity to the total volume of the rock. A dimensionless value typically between 0.1 and 0.3 for unconfined aquifers.

**Storage Coefficient (Storativity)**
:   The volume of water released from (or taken into) storage per unit decline (or rise) in hydraulic head, per unit area of the aquifer. Dimensionless. Values differ greatly between confined and unconfined aquifers.

**Variogram**
:   A function that describes how spatial correlation changes with distance. In Kriging, the variogram model (Gaussian, Spherical, or Exponential) determines how kriging weights are distributed among nearby wells.

**Water Table Elevation (WTE)**
:   The elevation of the top of the saturated zone in an unconfined aquifer, measured from a reference datum. The default and primary data type in Aquifer Analyst.

**WGS 84**
:   The World Geodetic System 1984 (EPSG:4326), the standard coordinate reference system using latitude and longitude on an ellipsoidal model of the Earth.

**WHO (World Health Organization Guideline)**
:   An international drinking-water guideline value published by the WHO (e.g. 50 mg/L for nitrate, 0.010 mg/L for arsenic). Stored per-parameter in the catalog alongside the U.S. EPA MCL.

**WQP (Water Quality Portal)**
:   A federated water quality data warehouse at [waterqualitydata.us](https://www.waterqualitydata.us/) maintained by USGS, EPA, and the National Water Quality Monitoring Council. Aggregates analytical results from over 400 public and private data providers. The measurement importer's WQP tab downloads results and station metadata directly from this source for U.S.-overlapping regions.

**WQX (Water Quality eXchange)**
:   The data exchange standard underlying WQP. STORET (Storage and Retrieval) is EPA's WQX-conformant database; NWIS (National Water Information System) is USGS's. WQP unifies both.
