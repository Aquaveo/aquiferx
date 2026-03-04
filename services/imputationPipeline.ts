import {
  Aquifer, Region, Well, Measurement,
  ImputationParams, ImputationDataRow, ImputationModelResult, ImputationWellMetrics,
} from '../types';
import { fetchGldasFeatures, GldasFeatures } from './gldasFetch';
import { trainElm, predictElm, buildFeatureMatrix } from './elm';
import { interpolatePCHIP } from '../utils/interpolation';
import { slugify } from '../utils/strings';

export interface ImputationPipelineInput {
  title: string;
  startDate: string;
  endDate: string;
  minSamples: number;
  gapSize: number;    // months
  padSize: number;    // months
  hiddenUnits: number;
  lambda: number;
}

function yieldToUI(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

/**
 * Generate monthly date grid from startDate to endDate (inclusive)
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
 * Compute gap in months between two dates
 */
function monthsBetween(d1: string, d2: string): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Run the full imputation pipeline
 */
export async function runImputationPipeline(
  input: ImputationPipelineInput,
  aquifer: Aquifer,
  region: Region,
  wells: Well[],
  measurements: Measurement[],
  onLog: (msg: string) => void,
  onProgress: (step: string, pct: number) => void,
): Promise<ImputationModelResult> {
  const { title, startDate, endDate, minSamples, gapSize, padSize, hiddenUnits, lambda } = input;

  // Step 1: Fetch GLDAS data (0-5%)
  onProgress('Fetching GLDAS data...', 0);
  onLog(`Fetching GLDAS soil moisture data for aquifer "${aquifer.name}"...`);
  await yieldToUI();

  let gldas: GldasFeatures;
  try {
    gldas = await fetchGldasFeatures(aquifer.id, aquifer.geojson, startDate, endDate);
    onLog(`GLDAS data loaded: ${gldas.dates.length} monthly records, range ${gldas.dates[0]} to ${gldas.dates[gldas.dates.length - 1]}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLog(`ERROR: Failed to fetch GLDAS data: ${msg}`);
    throw new Error(`GLDAS data fetch failed: ${msg}`);
  }
  onProgress('GLDAS data loaded', 5);

  // Step 2: Prepare well data (5-10%)
  onProgress('Preparing well data...', 5);
  await yieldToUI();

  const wteMeasurements = measurements.filter(m => m.dataType === 'wte');
  const byWell = new Map<string, Measurement[]>();
  for (const m of wteMeasurements) {
    if (!byWell.has(m.wellId)) byWell.set(m.wellId, []);
    byWell.get(m.wellId)!.push(m);
  }

  // Filter wells by minSamples
  const wellKeySet = new Set(wells.map(w => w.id));
  const qualifiedWells: { well: Well; meas: Measurement[] }[] = [];
  let omitted = 0;

  for (const well of wells) {
    const meas = byWell.get(well.id);
    if (!meas || meas.length < minSamples) {
      omitted++;
      continue;
    }
    qualifiedWells.push({ well, meas });
  }

  onLog(`${qualifiedWells.length} wells qualified (>= ${minSamples} measurements), ${omitted} omitted`);

  if (qualifiedWells.length === 0) {
    throw new Error(`No wells have >= ${minSamples} measurements. Adjust min samples or date range.`);
  }

  onProgress('Well data prepared', 10);

  // Step 3: Generate monthly date grid
  const monthlyDates = generateMonthlyDates(startDate, endDate);
  onLog(`Monthly date grid: ${monthlyDates.length} months from ${startDate} to ${endDate}`);

  // Build GLDAS lookup by date
  const gldasByDate = new Map<string, number>();
  for (let i = 0; i < gldas.dates.length; i++) {
    gldasByDate.set(gldas.dates[i], i);
  }

  // Step 4: Per-well processing (10-90%)
  const allDataRows: ImputationDataRow[] = [];
  const wellMetrics: Record<string, ImputationWellMetrics> = {};

  for (let wi = 0; wi < qualifiedWells.length; wi++) {
    const { well, meas } = qualifiedWells[wi];
    const pct = 10 + (wi / qualifiedWells.length) * 80;
    onProgress(`Processing well ${wi + 1}/${qualifiedWells.length}...`, pct);

    // Sort measurements by date
    const sorted = [...meas]
      .filter(m => !isNaN(new Date(m.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sorted.length < 2) {
      onLog(`Well ${well.name}: skipped (< 2 valid measurements)`);
      continue;
    }

    // (a) Identify gaps between consecutive measurements
    const measDates = sorted.map(m => m.date);
    const measValues = sorted.map(m => m.value);
    const measTimestamps = measDates.map(d => new Date(d).getTime());

    // Classify gaps as small (<= gapSize months) or large (> gapSize months)
    let hasLargeGap = false;
    interface Gap { startDate: string; endDate: string; months: number; isLarge: boolean; }
    const gaps: Gap[] = [];
    for (let i = 0; i < measDates.length - 1; i++) {
      const gapMonths = monthsBetween(measDates[i], measDates[i + 1]);
      const isLarge = gapMonths > gapSize;
      if (isLarge) hasLargeGap = true;
      gaps.push({
        startDate: measDates[i],
        endDate: measDates[i + 1],
        months: gapMonths,
        isLarge,
      });
    }

    // (b) PCHIP interpolate the full monthly date range
    // Filter monthly dates to well's data range
    const wellMonthlyDates: string[] = [];
    const wellMonthlyTimestamps: number[] = [];
    const firstMeasTs = measTimestamps[0];
    const lastMeasTs = measTimestamps[measTimestamps.length - 1];

    for (const d of monthlyDates) {
      const ts = new Date(d).getTime();
      if (ts >= firstMeasTs && ts <= lastMeasTs) {
        wellMonthlyDates.push(d);
        wellMonthlyTimestamps.push(ts);
      }
    }

    if (wellMonthlyDates.length === 0) {
      onLog(`Well ${well.name}: skipped (no monthly dates within measurement range)`);
      continue;
    }

    // PCHIP interpolate to monthly dates
    const pchipValues = interpolatePCHIP(measTimestamps, measValues, wellMonthlyTimestamps);

    // (c) Null out interiors of large gaps in PCHIP, keeping padSize months at boundaries
    const pchipFinal: (number | null)[] = [...pchipValues];

    for (const gap of gaps) {
      if (!gap.isLarge) continue;

      // Find monthly dates within this gap (exclusive of boundary measurements)
      const gapStartTs = new Date(gap.startDate).getTime();
      const gapEndTs = new Date(gap.endDate).getTime();

      for (let i = 0; i < wellMonthlyDates.length; i++) {
        const ts = wellMonthlyTimestamps[i];
        if (ts <= gapStartTs || ts >= gapEndTs) continue;

        // Check if within padSize months of gap boundaries
        const monthsFromStart = monthsBetween(gap.startDate, wellMonthlyDates[i]);
        const monthsFromEnd = monthsBetween(wellMonthlyDates[i], gap.endDate);

        if (monthsFromStart > padSize && monthsFromEnd > padSize) {
          pchipFinal[i] = null; // Interior of large gap — null it out
        }
      }
    }

    // (d) ELM for large gaps
    let elmPredictions: (number | null)[] = new Array(wellMonthlyDates.length).fill(null);

    if (hasLargeGap) {
      // Build feature matrix aligned with GLDAS dates
      // First, compute z-score stats from GLDAS features covering the well's dates
      const alignedGldasIndices: number[] = [];
      for (const d of wellMonthlyDates) {
        const idx = gldasByDate.get(d);
        if (idx !== undefined) alignedGldasIndices.push(idx);
        else alignedGldasIndices.push(-1);
      }

      // Check if we have enough GLDAS data
      const validGldasCount = alignedGldasIndices.filter(i => i >= 0).length;
      if (validGldasCount < wellMonthlyDates.length * 0.5) {
        onLog(`Well ${well.name}: insufficient GLDAS overlap, using PCHIP only`);
      } else {
        // Get GLDAS values for the well's monthly dates
        const wellGldasSoilw: number[] = [];
        const wellGldasYr01: number[] = [];
        const wellGldasYr03: number[] = [];
        const wellGldasYr05: number[] = [];
        const wellGldasYr10: number[] = [];

        for (const idx of alignedGldasIndices) {
          if (idx >= 0) {
            wellGldasSoilw.push(gldas.soilw[idx]);
            wellGldasYr01.push(gldas.soilw_yr01[idx]);
            wellGldasYr03.push(gldas.soilw_yr03[idx]);
            wellGldasYr05.push(gldas.soilw_yr05[idx]);
            wellGldasYr10.push(gldas.soilw_yr10[idx]);
          } else {
            // Fill missing GLDAS with nearest available
            wellGldasSoilw.push(0);
            wellGldasYr01.push(0);
            wellGldasYr03.push(0);
            wellGldasYr05.push(0);
            wellGldasYr10.push(0);
          }
        }

        // Compute z-score stats from training data (where we have measurements)
        // Find indices of monthly dates that are close to actual measurements
        const trainIndices: number[] = [];
        for (let i = 0; i < wellMonthlyDates.length; i++) {
          // Match monthly date to nearest measurement
          const ts = wellMonthlyTimestamps[i];
          for (const mt of measTimestamps) {
            if (Math.abs(ts - mt) < 45 * 24 * 60 * 60 * 1000) { // within 45 days
              trainIndices.push(i);
              break;
            }
          }
        }

        if (trainIndices.length < 3) {
          onLog(`Well ${well.name}: too few training points for ELM, using PCHIP only`);
        } else {
          // Compute GLDAS feature means/stds from training indices
          const featureMeans = [0, 0, 0, 0, 0];
          const featureStds = [0, 0, 0, 0, 0];
          const gArrays = [wellGldasSoilw, wellGldasYr01, wellGldasYr03, wellGldasYr05, wellGldasYr10];

          for (let f = 0; f < 5; f++) {
            let sum = 0;
            for (const ti of trainIndices) sum += gArrays[f][ti];
            featureMeans[f] = sum / trainIndices.length;
          }
          for (let f = 0; f < 5; f++) {
            let sumSq = 0;
            for (const ti of trainIndices) sumSq += (gArrays[f][ti] - featureMeans[f]) ** 2;
            featureStds[f] = Math.sqrt(sumSq / trainIndices.length) || 1;
          }

          // Year normalization range from all dates
          const years = wellMonthlyDates.map(d => new Date(d).getFullYear());
          const yearMin = Math.min(...years);
          const yearMax = Math.max(...years);

          // Build training feature matrix
          const trainDates = trainIndices.map(i => wellMonthlyDates[i]);
          const trainGldasArrays = [
            trainIndices.map(i => wellGldasSoilw[i]),
            trainIndices.map(i => wellGldasYr01[i]),
            trainIndices.map(i => wellGldasYr03[i]),
            trainIndices.map(i => wellGldasYr05[i]),
            trainIndices.map(i => wellGldasYr10[i]),
          ];

          const trainX = buildFeatureMatrix(
            trainDates,
            trainGldasArrays[0], trainGldasArrays[1],
            trainGldasArrays[2], trainGldasArrays[3], trainGldasArrays[4],
            featureMeans, featureStds, yearMin, yearMax,
          );

          // Get training targets: actual measurements PCHIP'd at those points
          const trainY = trainIndices.map(i => pchipValues[i]);

          // Train ELM
          try {
            const elmResult = trainElm(trainX, trainY, hiddenUnits, lambda);

            // Store feature normalization params in model
            elmResult.model.featureMeans = featureMeans;
            elmResult.model.featureStds = featureStds;
            elmResult.model.yearMin = yearMin;
            elmResult.model.yearMax = yearMax;

            wellMetrics[well.id] = { r2: elmResult.r2, rmse: elmResult.rmse };
            onLog(`Well ${well.name}: ELM R²=${elmResult.r2.toFixed(4)}, RMSE=${elmResult.rmse.toFixed(2)}`);

            // Predict all monthly dates
            const allX = buildFeatureMatrix(
              wellMonthlyDates,
              wellGldasSoilw, wellGldasYr01,
              wellGldasYr03, wellGldasYr05, wellGldasYr10,
              featureMeans, featureStds, yearMin, yearMax,
            );

            const allPredictions = predictElm(elmResult.model, allX);
            elmPredictions = allPredictions.map(v => v);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            onLog(`Well ${well.name}: ELM training failed: ${msg}, using PCHIP only`);
          }
        }
      }
    } else {
      onLog(`Well ${well.name}: ${sorted.length} measurements, no gaps > ${gapSize} months, PCHIP only`);
    }

    // (e) Combine: PCHIP where available, else ELM
    for (let i = 0; i < wellMonthlyDates.length; i++) {
      const pchipVal = pchipFinal[i];
      const modelVal = elmPredictions[i];
      const combined = pchipVal !== null ? pchipVal : (modelVal !== null ? modelVal : 0);

      allDataRows.push({
        well_id: well.id,
        date: wellMonthlyDates[i],
        model: modelVal,
        pchip: pchipVal,
        combined,
      });
    }

    if (wi % 3 === 0) await yieldToUI();
  }

  // Step 5: Save result (90-100%)
  onProgress('Saving model...', 90);
  await yieldToUI();

  const code = slugify(title);
  const aquiferSlug = slugify(aquifer.name);
  const filePath = `${region.id}/${aquiferSlug}/model_wte_${code}.json`;

  const params: ImputationParams = {
    startDate,
    endDate,
    minSamples,
    gapSize,
    padSize,
    hiddenUnits,
    lambda,
  };

  const result: ImputationModelResult = {
    title,
    code,
    aquiferId: aquifer.id,
    aquiferName: aquifer.name,
    regionId: region.id,
    dataType: 'wte',
    filePath,
    createdAt: new Date().toISOString(),
    params,
    wellMetrics,
    data: allDataRows,
    log: [], // Will be populated by caller from accumulated log messages
  };

  // Save to disk
  await fetch('/api/save-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{
        path: filePath,
        content: JSON.stringify(result),
      }],
    }),
  });

  onProgress('Complete!', 100);
  onLog('Imputation complete! Model saved.');

  return result;
}
