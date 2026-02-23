import { haversineDistance } from '../utils/geo';

// Stable variogram function: gamma(h) = nugget + (sill - nugget) * (1 - exp(-(h/range)^2))
function stableVariogram(dist: number, sill: number, range: number, nugget: number): number {
  if (dist === 0) return 0;
  const ratio = dist / range;
  return nugget + (sill - nugget) * (1 - Math.exp(-(ratio * ratio)));
}

// Build distance matrix between points using Haversine (returns meters)
function buildDistanceMatrix(lats: number[], lngs: number[]): number[][] {
  const n = lats.length;
  const dists: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineDistance(lats[i], lngs[i], lats[j], lngs[j]);
      dists[i][j] = d;
      dists[j][i] = d;
    }
  }
  return dists;
}

// Build (N+1)x(N+1) kriging matrix from distances + variogram
function buildKrigingMatrix(dists: number[][], sill: number, range: number, nugget: number): number[][] {
  const n = dists.length;
  const size = n + 1;
  const K: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      K[i][j] = stableVariogram(dists[i][j], sill, range, nugget);
    }
    K[i][n] = 1;
    K[n][i] = 1;
  }
  K[n][n] = 0;

  return K;
}

// Solve linear system Ax=b using Gaussian elimination with partial pivoting
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  // Augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j];
    }
    const diag = aug[i][i];
    x[i] = Math.abs(diag) < 1e-12 ? 0 : sum / diag;
  }

  return x;
}

// Estimate variogram parameters heuristically from well data
function estimateVariogramParams(
  wellLats: number[], wellLngs: number[], wellValues: number[]
): { sill: number; range: number; nugget: number } {
  const n = wellValues.length;

  // Variance (sill)
  let mean = 0;
  for (const v of wellValues) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of wellValues) variance += (v - mean) ** 2;
  variance /= n;

  // Standard deviation (nugget)
  const stdDev = Math.sqrt(variance);

  // Range: 1/4 of the spatial diagonal
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (let i = 0; i < n; i++) {
    if (wellLats[i] < minLat) minLat = wellLats[i];
    if (wellLats[i] > maxLat) maxLat = wellLats[i];
    if (wellLngs[i] < minLng) minLng = wellLngs[i];
    if (wellLngs[i] > maxLng) maxLng = wellLngs[i];
  }
  const diagonal = haversineDistance(minLat, minLng, maxLat, maxLng);
  const range = diagonal / 4;

  // Ensure sane defaults
  return {
    sill: Math.max(variance, 0.01),
    range: Math.max(range, 100),
    nugget: Math.max(stdDev, 0.001),
  };
}

// Main export: interpolate well values to a grid
// gridLats/gridLngs are the center coordinates of each grid cell (flattened row-major)
// mask: 1=inside aquifer, 0=outside
// Returns array of interpolated values (null for masked cells)
export function krigGrid(
  wellLats: number[], wellLngs: number[], wellValues: number[],
  gridLats: number[], gridLngs: number[], mask: (0 | 1)[]
): (number | null)[] {
  const n = wellLats.length;
  if (n === 0) return gridLats.map(() => null);

  // Single well: return constant value for all cells
  if (n === 1) {
    return mask.map(m => m === 1 ? wellValues[0] : null);
  }

  // Estimate variogram parameters
  const { sill, range, nugget } = estimateVariogramParams(wellLats, wellLngs, wellValues);

  // Build distance matrix between wells
  const wellDists = buildDistanceMatrix(wellLats, wellLngs);

  // Build and pre-factor the kriging matrix
  const K = buildKrigingMatrix(wellDists, sill, range, nugget);

  // For each grid cell, solve for weights and compute interpolated value
  const result: (number | null)[] = new Array(gridLats.length);

  for (let g = 0; g < gridLats.length; g++) {
    if (mask[g] === 0) {
      result[g] = null;
      continue;
    }

    // Build right-hand side: variogram from grid cell to each well + Lagrange constraint
    const rhs = new Array(n + 1);
    for (let i = 0; i < n; i++) {
      const d = haversineDistance(gridLats[g], gridLngs[g], wellLats[i], wellLngs[i]);
      rhs[i] = stableVariogram(d, sill, range, nugget);
    }
    rhs[n] = 1;

    // Solve for weights
    const weights = solveLinearSystem(K.map(row => [...row]), rhs);

    // Interpolated value = weighted sum of well values
    let val = 0;
    for (let i = 0; i < n; i++) {
      val += weights[i] * wellValues[i];
    }

    result[g] = isFinite(val) ? val : null;
  }

  return result;
}
