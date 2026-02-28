import { RasterAnalysisResult } from '../types';
import { cellAreaM2 } from './geo';

// Convert volume from base units (lengthUnit * m^2) to target volume unit
export function convertVolume(volumeBaseM2: number, lengthUnit: 'ft' | 'm', volumeUnit: string): number {
  if (lengthUnit === 'ft') {
    // volumeBaseM2 is in ft * m^2, convert m^2 to ft^2
    const volumeFt3 = volumeBaseM2 * 10.7639;
    if (volumeUnit === 'ft3') return volumeFt3;
    if (volumeUnit === 'acre-ft') return volumeFt3 / 43560;
    return volumeFt3;
  } else {
    // volumeBaseM2 is in m * m^2 = m^3
    const volumeM3 = volumeBaseM2;
    if (volumeUnit === 'm3') return volumeM3;
    if (volumeUnit === 'MCM') return volumeM3 / 1e6;
    if (volumeUnit === 'km3') return volumeM3 / 1e9;
    return volumeM3;
  }
}

// Compute cumulative storage change from a raster analysis result.
// Pure synchronous function — fast multiplication across grid cells.
export function computeStorageChange(
  result: RasterAnalysisResult,
  storageCoefficient: number,
  volumeUnit: string,
  lengthUnit: 'ft' | 'm'
): { date: string; value: number }[] {
  const { grid, frames } = result;
  const { mask, dx, dy, nx } = grid;

  const series: { date: string; value: number }[] = [];
  let cumulativeVolume = 0;

  if (frames.length === 0) return series;
  series.push({ date: frames[0].date, value: 0 });

  // Precompute cell areas (only depends on latitude)
  const cellAreas = new Float64Array(mask.length);
  for (let ci = 0; ci < mask.length; ci++) {
    if (mask[ci] === 1) {
      const row = Math.floor(ci / nx);
      const cellLat = grid.minLat + (row + 0.5) * dy;
      cellAreas[ci] = cellAreaM2(cellLat, dx, dy);
    }
  }

  for (let fi = 1; fi < frames.length; fi++) {
    const prevFrame = frames[fi - 1];
    const currFrame = frames[fi];
    let volumeChange = 0;

    for (let ci = 0; ci < mask.length; ci++) {
      if (mask[ci] === 0) continue;
      const prevVal = prevFrame.values[ci];
      const currVal = currFrame.values[ci];
      if (prevVal === null || currVal === null) continue;

      const dh = currVal - prevVal;
      volumeChange += dh * cellAreas[ci] * storageCoefficient;
    }

    cumulativeVolume += convertVolume(volumeChange, lengthUnit, volumeUnit);
    series.push({ date: currFrame.date, value: cumulativeVolume });
  }

  return series;
}
