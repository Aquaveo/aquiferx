import { Matrix, solve } from 'ml-matrix';

export interface ElmModel {
  W_in: number[][];   // [inputDim x hiddenUnits]
  b: number[];         // [hiddenUnits]
  W_out: number[];     // [hiddenUnits]
  featureMeans: number[];
  featureStds: number[];
  yearMin: number;
  yearMax: number;
  targetMean: number;
  targetStd: number;
}

export interface ElmTrainResult {
  model: ElmModel;
  r2: number;
  rmse: number;
}

/**
 * Box-Muller transform for generating random normal numbers
 */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * ReLU activation: max(0, x) applied element-wise
 */
function relu(matrix: Matrix): Matrix {
  const data = matrix.to2DArray();
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      if (data[i][j] < 0) data[i][j] = 0;
    }
  }
  return new Matrix(data);
}

/**
 * Build a feature matrix row from date, GLDAS features, year normalization, and month one-hot.
 *
 * Features (18 total):
 *   [0-4]: z-scored GLDAS (soilw, yr01, yr03, yr05, yr10)
 *   [5]:   min-max normalized year
 *   [6-17]: one-hot encoded month (12)
 *
 * Then a bias column is appended (total 19) before being fed to the ELM.
 */
export function buildFeatureMatrix(
  dates: string[],
  gldasSoilw: number[],
  gldasYr01: number[],
  gldasYr03: number[],
  gldasYr05: number[],
  gldasYr10: number[],
  featureMeans: number[],
  featureStds: number[],
  yearMin: number,
  yearMax: number,
): number[][] {
  const rows: number[][] = [];
  const yearRange = yearMax - yearMin || 1;

  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11

    // Z-score GLDAS features
    const gldas = [gldasSoilw[i], gldasYr01[i], gldasYr03[i], gldasYr05[i], gldasYr10[i]];
    const zscored = gldas.map((v, j) => {
      const std = featureStds[j];
      return std === 0 ? 0 : (v - featureMeans[j]) / std;
    });

    // Min-max normalized year
    const normYear = (year - yearMin) / yearRange;

    // One-hot month
    const monthOneHot = new Array(12).fill(0);
    monthOneHot[month] = 1;

    // Combine: 5 GLDAS + 1 year + 12 month = 18 features + 1 bias = 19
    const row = [...zscored, normYear, ...monthOneHot, 1.0]; // bias column
    rows.push(row);
  }

  return rows;
}

/**
 * Compute hidden layer activation: H = ReLU(X · W_in + b)
 */
function computeHidden(X: Matrix, W_in: Matrix, b: number[]): Matrix {
  // X: [n x inputDim], W_in: [inputDim x hidden], b: [hidden]
  const H = X.mmul(W_in);
  // Add bias to each row
  for (let i = 0; i < H.rows; i++) {
    for (let j = 0; j < H.columns; j++) {
      H.set(i, j, H.get(i, j) + b[j]);
    }
  }
  return relu(H);
}

/**
 * Train an ELM on the given feature matrix and target values.
 *
 * X: raw features [n x 19] (18 features + bias column already included)
 * y: target WTE values (raw, not normalized)
 */
export function trainElm(
  X: number[][],
  y: number[],
  hiddenUnits: number,
  lambda: number,
): ElmTrainResult {
  const n = X.length;
  const inputDim = X[0].length; // 19 (18 features + bias)

  // Z-score normalize the target
  let targetMean = 0;
  for (let i = 0; i < n; i++) targetMean += y[i];
  targetMean /= n;

  let targetVar = 0;
  for (let i = 0; i < n; i++) targetVar += (y[i] - targetMean) ** 2;
  const targetStd = Math.sqrt(targetVar / n) || 1;

  const yNorm = y.map(v => (v - targetMean) / targetStd);

  // Generate random input weights and biases (Box-Muller)
  const W_inArr: number[][] = [];
  for (let i = 0; i < inputDim; i++) {
    const row: number[] = [];
    for (let j = 0; j < hiddenUnits; j++) {
      row.push(randn());
    }
    W_inArr.push(row);
  }
  const bArr: number[] = [];
  for (let j = 0; j < hiddenUnits; j++) {
    bArr.push(randn());
  }

  const XMat = new Matrix(X);
  const W_in = new Matrix(W_inArr);

  // Compute hidden layer: H = ReLU(X · W_in + b)
  const H = computeHidden(XMat, W_in, bArr);

  // Ridge regression: W_out = solve(H^T·H + λI, H^T·y)
  const HtH = H.transpose().mmul(H);

  // Build regularization matrix: λI with last 2 diagonal entries zeroed (notebook technique)
  for (let i = 0; i < hiddenUnits; i++) {
    if (i < hiddenUnits - 2) {
      HtH.set(i, i, HtH.get(i, i) + lambda);
    }
    // Last 2 entries: don't add lambda (zero regularization)
  }

  const yMat = Matrix.columnVector(yNorm);
  const HtY = H.transpose().mmul(yMat);

  // Solve the system: (H^T·H + λI) · W_out = H^T·y
  const W_outMat = solve(HtH, HtY);
  const W_outArr = W_outMat.getColumn(0);

  // Compute predictions for R² and RMSE
  const predNorm = H.mmul(Matrix.columnVector(W_outArr)).getColumn(0);
  const predictions = predNorm.map(v => v * targetStd + targetMean);

  // Compute R² and RMSE against original (non-normalized) targets
  let ssTot = 0, ssRes = 0, mseSum = 0;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - predictions[i]) ** 2;
    mseSum += (y[i] - predictions[i]) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const rmse = Math.sqrt(mseSum / n);

  return {
    model: {
      W_in: W_inArr,
      b: bArr,
      W_out: W_outArr,
      featureMeans: [], // set externally
      featureStds: [],  // set externally
      yearMin: 0,       // set externally
      yearMax: 0,       // set externally
      targetMean,
      targetStd,
    },
    r2,
    rmse,
  };
}

/**
 * Predict using a trained ELM model.
 * X: feature matrix [n x 19] (with bias column)
 */
export function predictElm(model: ElmModel, X: number[][]): number[] {
  const XMat = new Matrix(X);
  const W_in = new Matrix(model.W_in);
  const H = computeHidden(XMat, W_in, model.b);
  const predNorm = H.mmul(Matrix.columnVector(model.W_out)).getColumn(0);
  return predNorm.map(v => v * model.targetStd + model.targetMean);
}
