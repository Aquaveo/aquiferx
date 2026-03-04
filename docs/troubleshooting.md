# Troubleshooting

This page addresses common issues you may encounter when using AquiferX.

## CRS and Coordinate Issues

### Wells or boundaries appear in the wrong location

**Cause**: The coordinate reference system (CRS) was not detected, so the app assumed WGS 84 when the data is actually in a projected system (e.g., UTM, State Plane).

**Solution**:

- For GeoJSON files, include the `crs` property in the file.
- For shapefiles, include the `.prj` file in your ZIP archive.
- For CSV well data, coordinates must already be in WGS 84 (decimal degrees latitude and longitude).

### "CRS not recognized" warning

**Cause**: The CRS definition in your file uses a format or code that the proj4 library does not recognize.

**Solution**:

- Try using an EPSG code in your `.prj` file or GeoJSON `crs` property.
- Convert your data to WGS 84 externally using GIS software (QGIS, ArcGIS) before importing.

## CSV Import Issues

### Columns are not detected correctly

**Cause**: The delimiter was incorrectly auto-detected, or the file uses an unusual encoding.

**Solution**:

- Verify your file uses a consistent delimiter (all commas or all tabs).
- Save the file as UTF-8 encoding.
- Open the file in a text editor to confirm the structure before importing.

### "No matching wells" warning during measurement import

**Cause**: The `well_id` values in your measurement file do not match any `well_id` values in the wells file.

**Solution**:

- Check for leading/trailing spaces in your well IDs.
- Ensure the same ID format is used in both files (e.g., `W001` vs `W-001`).
- Import wells before measurements — measurements are matched against the existing well list.

### Measurement values are missing or NaN

**Cause**: Non-numeric values (e.g., "dry", "N/A", empty cells) in the value column.

**Solution**:

- Clean your CSV to ensure all value cells contain numeric data.
- Remove or replace non-numeric entries before importing.

## Date Format Issues

### Dates are parsed incorrectly

**Cause**: Auto-detection chose the wrong date format, typically confusing US (MM/DD/YYYY) and European (DD/MM/YYYY) conventions when the day is 12 or less.

**Solution**:

- Use ISO 8601 format (`YYYY-MM-DD`) to avoid ambiguity.
- In the column mapper, manually select the correct date format from the dropdown.

### Partial dates are rejected

**Cause**: Dates like `2020` or `2020-06` without a specific day.

**Solution**:

- The app handles partial dates from USGS data automatically. For your own data, provide complete dates (`YYYY-MM-DD`).

## Browser and Performance Issues

### The app is slow with many wells

**Cause**: Rendering thousands of well markers on the map and computing interpolation for large datasets can be resource-intensive.

**Solutions**:

- Use the **minimum observation threshold** filter to hide wells with too few measurements.
- Reduce the raster **resolution** (columns) during spatial analysis.
- Close other browser tabs to free up memory.
- Use Chrome or Firefox for best performance.

### Map tiles are not loading

**Cause**: Network connectivity issues or tile server unavailability.

**Solution**:

- Check your internet connection.
- Try switching to a different basemap.
- Some institutional networks may block external tile servers — try from a different network.

### Time series chart is empty for a selected well

**Cause**: The well has no measurements for the currently selected data type.

**Solution**:

- Check the data type selector in the toolbar — you may be viewing a type that has no data for this well.
- Verify that measurements were imported successfully for this well.

## Spatial Analysis Issues

### Raster shows unexpected extreme values

**Cause**: The interpolation method extrapolated beyond reasonable bounds in data-sparse areas.

**Solution**:

- Enable **truncation** (Truncate Low / Truncate High) in the spatial options to clamp values to a physical range.
- Increase the minimum observations or time span thresholds to exclude poorly-supported wells.
- Try a different variogram model (for Kriging) or nodal function (for IDW).

### "Singular matrix" error during Kriging

**Cause**: Multiple wells are co-located (within 10m of each other), causing the covariance matrix to be singular.

**Solution**:

- The app automatically deduplicates co-located wells by averaging their values. If the error persists, check for duplicate wells in your data.

## Imputation Issues

### Low R² for most wells

**Cause**: Soil moisture (GLDAS) may not be a strong predictor of water levels in your aquifer. This can happen in areas dominated by pumping, irrigation return flow, or confined aquifers with minimal climate sensitivity.

**Solution**:

- This is a limitation of the climate-based approach. The model will still produce estimates, but interpret them with caution.
- Check the per-well metrics in the processing log to identify which wells perform well and which don't.

### GLDAS data not available for my location

**Cause**: The GLDAS dataset has global coverage, but the GEOGLOWS THREDDS server may have connectivity issues.

**Solution**:

- Check your internet connection.
- Try again later if the server is temporarily unavailable.
- The wizard will display an error message if GLDAS data cannot be fetched.

### Imputation takes a long time

**Cause**: Training an ELM for each well is computationally intensive, especially with many qualified wells.

**Solution**:

- Increase the **Min Samples / Well** threshold to reduce the number of wells processed.
- Narrow the output date range to process fewer months.

## USGS API Issues

### Rate limit errors during USGS download

**Cause**: The USGS Water Data API limits requests to 30 per hour (without an API key).

**Solution**:

- Wait and retry after the rate limit window resets.
- Obtain a free API key from [api.waterdata.usgs.gov/signup](https://api.waterdata.usgs.gov/signup/) to increase your limit to 1,000 requests per hour. Enter the key when prompted during import.

### USGS download returns fewer wells than expected

**Cause**: The USGS API only returns wells classified as groundwater monitoring sites. Other site types (e.g., springs, surface water) are not included.

**Solution**:

- This is expected behavior. The API queries specifically for groundwater sites within your region's bounding box.

## General Tips

- **Back up your data** regularly by exporting the database from the Import Data Hub.
- **Use ISO dates** (`YYYY-MM-DD`) in your CSV files to avoid parsing ambiguity.
- **Start with a small dataset** to verify your workflow before importing large files.
- **Check the browser console** (F12 → Console tab) for detailed error messages if something goes wrong.
