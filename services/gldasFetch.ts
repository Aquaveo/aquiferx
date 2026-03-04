import { interpolatePCHIP } from '../utils/interpolation';

const GLDAS_WMS_URL = 'https://apps.geoglows.org/thredds/wms/geoglows_data/soilw.mon.mean.v2.nc';

export interface GldasFeatures {
  dates: string[];    // ISO date strings, monthly
  soilw: number[];
  soilw_yr01: number[];
  soilw_yr03: number[];
  soilw_yr05: number[];
  soilw_yr10: number[];
}

// In-memory cache: all wells in same aquifer share the same GLDAS data
const gldasCache = new Map<string, { features: GldasFeatures; range: { min: string; max: string } }>();

/**
 * Fetch GLDAS date range via GetCapabilities XML
 */
export async function fetchGldasDateRange(): Promise<{ min: string; max: string }> {
  const capUrl = `${GLDAS_WMS_URL}?service=WMS&version=1.1.1&request=GetCapabilities`;
  const proxyUrl = `/api/gldas-proxy?url=${encodeURIComponent(capUrl)}`;

  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`GLDAS GetCapabilities failed: ${res.status}`);

  const xml = await res.text();

  // Parse time dimension from XML — look for <Dimension name="time"...>...</Dimension>
  // The content is typically like "1948-01-01T00:00:00.000Z/2024-12-01T00:00:00.000Z/..."
  const timeMatch = xml.match(/<Dimension[^>]*name="time"[^>]*>([\s\S]*?)<\/Dimension>/i);
  if (!timeMatch) {
    // Try alternate: <Extent name="time">
    const extMatch = xml.match(/<Extent[^>]*name="time"[^>]*>([\s\S]*?)<\/Extent>/i);
    if (!extMatch) throw new Error('Could not parse GLDAS time dimension from GetCapabilities');
    const content = extMatch[1].trim();
    const dates = content.split(/[/,]/);
    return { min: dates[0].slice(0, 10), max: dates[dates.length > 2 ? dates.length - 1 : 1].slice(0, 10) };
  }

  const content = timeMatch[1].trim();
  const dates = content.split(/[/,]/);
  if (dates.length >= 2) {
    return { min: dates[0].slice(0, 10), max: dates[1].slice(0, 10) };
  }
  throw new Error('Could not parse GLDAS time range');
}

/**
 * Compute centroid of aquifer polygon(s) by averaging all vertices
 */
export function computeAquiferCentroid(geojson: any): [number, number] {
  let sumLat = 0, sumLng = 0, count = 0;

  const geometries: any[] = [];
  if (geojson.type === 'FeatureCollection') {
    for (const f of geojson.features) {
      if (f.geometry) geometries.push(f.geometry);
    }
  } else if (geojson.type === 'Feature') {
    if (geojson.geometry) geometries.push(geojson.geometry);
  } else if (geojson.coordinates) {
    geometries.push(geojson);
  }

  for (const geom of geometries) {
    if (!geom.coordinates) continue;
    const stack: any[] = [geom.coordinates];
    while (stack.length > 0) {
      const coords = stack.pop();
      if (!Array.isArray(coords)) continue;
      if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        sumLng += coords[0];
        sumLat += coords[1];
        count++;
      } else {
        for (const child of coords) stack.push(child);
      }
    }
  }

  if (count === 0) return [0, 0];
  return [sumLat / count, sumLng / count];
}

/**
 * Generate monthly date strings from start to end (inclusive)
 */
function generateMonthlyDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setMonth(current.getMonth() + 1);
  }
  return dates;
}

/**
 * Compute rolling mean of array with given window size.
 * Returns NaN for positions with insufficient data.
 */
function rollingMean(values: number[], window: number): number[] {
  const result: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result[i] = NaN;
    } else {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) {
        sum += values[j];
      }
      result[i] = sum / window;
    }
  }
  return result;
}

/**
 * Fetch GLDAS soil moisture features for an aquifer
 */
export async function fetchGldasFeatures(
  aquiferId: string,
  aquiferGeojson: any,
  startDate: string,
  endDate: string,
): Promise<GldasFeatures> {
  // Check cache
  const cached = gldasCache.get(aquiferId);
  if (cached) return cached.features;

  const [lat, lng] = computeAquiferCentroid(aquiferGeojson);

  // Build WMS GetTimeseries request — use centroid bbox with WIDTH=1, HEIGHT=1
  const delta = 0.125; // half of GLDAS 0.25° grid cell
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const timeseriesUrl = `${GLDAS_WMS_URL}?service=WMS&version=1.1.1&request=GetTimeseries` +
    `&LAYERS=soilw` +
    `&SRS=EPSG:4326` +
    `&BBOX=${bbox}` +
    `&WIDTH=1&HEIGHT=1` +
    `&INFO_FORMAT=text/csv` +
    `&TIME=${startDate}T00:00:00.000Z/${endDate}T00:00:00.000Z` +
    `&X=0&Y=0`;

  const proxyUrl = `/api/gldas-proxy?url=${encodeURIComponent(timeseriesUrl)}`;
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`GLDAS GetTimeseries failed: ${res.status}`);

  const csvText = await res.text();
  if (!csvText.trim()) throw new Error('GLDAS returned empty response');

  // Parse CSV: lines like "2000-01-01T00:00:00.000Z,value"
  const lines = csvText.trim().split('\n');
  const rawDates: string[] = [];
  const rawValues: number[] = [];

  // Skip header line(s)
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\d{4}/)) {
      startIdx = i;
      break;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    const dateStr = parts[0].trim().slice(0, 10);
    const value = parseFloat(parts[parts.length - 1].trim());
    if (dateStr && !isNaN(value)) {
      rawDates.push(dateStr);
      rawValues.push(value);
    }
  }

  if (rawDates.length === 0) throw new Error('No valid GLDAS data parsed from response');

  // Sort by date
  const indices = rawDates.map((_, i) => i).sort((a, b) => rawDates[a].localeCompare(rawDates[b]));
  const sortedDates = indices.map(i => rawDates[i]);
  const sortedValues = indices.map(i => rawValues[i]);

  // PCHIP interpolate any internal gaps, then resample to monthly
  const monthlyDates = generateMonthlyDates(sortedDates[0], sortedDates[sortedDates.length - 1]);
  const sortedTimestamps = sortedDates.map(d => new Date(d).getTime());
  const monthlyTimestamps = monthlyDates.map(d => new Date(d).getTime());
  const monthlySoilw = interpolatePCHIP(sortedTimestamps, sortedValues, monthlyTimestamps);

  // Compute rolling means
  const yr01 = rollingMean(monthlySoilw, 12);
  const yr03 = rollingMean(monthlySoilw, 36);
  const yr05 = rollingMean(monthlySoilw, 60);
  const yr10 = rollingMean(monthlySoilw, 120);

  // Trim leading NaN rows from 10-year rolling average
  let trimStart = 0;
  for (let i = 0; i < yr10.length; i++) {
    if (!isNaN(yr10[i])) {
      trimStart = i;
      break;
    }
  }

  const features: GldasFeatures = {
    dates: monthlyDates.slice(trimStart),
    soilw: monthlySoilw.slice(trimStart),
    soilw_yr01: yr01.slice(trimStart),
    soilw_yr03: yr03.slice(trimStart),
    soilw_yr05: yr05.slice(trimStart),
    soilw_yr10: yr10.slice(trimStart),
  };

  gldasCache.set(aquiferId, {
    features,
    range: { min: features.dates[0], max: features.dates[features.dates.length - 1] },
  });

  return features;
}

export function clearGldasCache() {
  gldasCache.clear();
}
