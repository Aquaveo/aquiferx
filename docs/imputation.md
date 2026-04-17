# Imputing Data Gaps

Groundwater monitoring records often have gaps — wells may be measured infrequently, monitoring may start and stop, or sensors may fail. Aquifer Analyst's **Impute Data** feature uses machine learning to fill these gaps, producing continuous monthly estimates for every well in an aquifer.

## Overview

The imputation pipeline combines two techniques:

1. **PCHIP interpolation** — Fills short gaps between actual measurements with smooth curves.
2. **Extreme Learning Machine (ELM)** — A neural network trained on climate data that predicts water levels where PCHIP cannot reach (before the first measurement, after the last, or across large gaps).

The result is a monthly time series for each well that blends measured data (via PCHIP) with model predictions (via ELM).

## Launching the Wizard

Click the **Impute Data** button in the toolbar. The wizard guides you through two steps.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Imputation wizard Step 1 showing date range and well options</div>

## Step 1: Wells & Options

### Output Date Range

Set the **Start Date** and **End Date** for the model output. These dates are constrained to the available GLDAS data range (approximately 1948 to present). Use the ±1 year buttons for quick adjustments.

The wizard displays the available GLDAS date range and clips your selection to fit.

### Well Qualification

- **Min Samples / Well** — Minimum number of measurements a well must have to be included in the model (default: 5, range: 2–500).
- Wells with fewer measurements are excluded from the imputation.

The wizard shows a real-time count of qualified wells and a data density histogram (wells per 6-month bin).

### Gap Detection

- **Gap Size (days)** — Threshold for what constitutes a "large gap" in the data (default: 730 days, ~2 years). Gaps larger than this are filled by the ELM model rather than PCHIP interpolation.
- **Pad Size (days)** — Padding applied at the edges of large gaps (default: 180 days, ~6 months). PCHIP extends this far into a gap before yielding to the ELM model, creating a smoother transition.

### Preview

A PCHIP preview canvas at the bottom shows the measurement coverage for all qualified wells, helping you verify your settings.

## Step 2: Title & Summary

Enter a **Title** for the model. The title is auto-slugified to a filename: `model_wte_{slug}.json`. Review the summary of all parameters, then click **Run** to start the imputation.

### Running

A progress bar shows the computation status. A real-time log viewer (styled as a dark terminal) displays processing messages, including per-well R² and RMSE metrics. Green entries indicate good model performance; red entries flag errors.

## How It Works

### PCHIP Phase

For each qualified well, PCHIP (Piecewise Cubic Hermite Interpolating Polynomial) interpolation generates smooth monthly values between the first and last measurement dates. PCHIP preserves the shape of the data — it does not overshoot or oscillate.

Within a well's measurement range, PCHIP values are used wherever measurements are available. For large gaps (exceeding the gap size threshold), PCHIP values are blanked out in the interior of the gap (minus the pad size at each edge), leaving room for the ELM model to fill.

### GLDAS Climate Features

The ELM model uses soil moisture data from the **Global Land Data Assimilation System (GLDAS)** as input features. GLDAS provides monthly gridded climate and hydrology data from NASA.

For each aquifer, the pipeline fetches soil moisture data at the aquifer's centroid location:

| Feature | Description |
|---------|-------------|
| `soilw` | Monthly soil moisture (mm) |
| `soilw_yr01` | 1-year rolling average |
| `soilw_yr03` | 3-year rolling average |
| `soilw_yr05` | 5-year rolling average |
| `soilw_yr10` | 10-year rolling average |

The rolling averages capture different temporal scales — seasonal patterns (1-year), multi-year trends (3-year), longer oscillations (5-year), and decadal trends (10-year).

### Feature Assembly

For each month in the training period, a 19-element feature vector is assembled:

| Features | Count | Description |
|----------|-------|-------------|
| GLDAS soil moisture | 5 | Z-scored (global mean/std across all wells) |
| Normalized year | 1 | Min-max scaled over the date range |
| One-hot month | 12 | Binary encoding of the calendar month |
| Bias | 1 | Constant value of 1.0 |

### ELM Architecture

The Extreme Learning Machine is a single-hidden-layer neural network with a unique training approach — the input weights are randomly initialized and never updated. Only the output weights are learned.

**Network structure:**

- **Input layer**: 19 features
- **Hidden layer**: 500 neurons with ReLU activation
- **Output layer**: 1 neuron (predicted water level)

**Training process:**

1. Random input weights \(\mathbf{W}_{in}\) and biases \(\mathbf{b}\) are generated (normal distribution).
2. Hidden layer activation: \(\mathbf{H} = \text{ReLU}(\mathbf{X} \cdot \mathbf{W}_{in} + \mathbf{b})\)
3. Output weights are solved analytically via ridge regression:

\[
\mathbf{W}_{out} = (\mathbf{H}^T \mathbf{H} + \lambda \mathbf{I})^{-1} \mathbf{H}^T \mathbf{y}
\]

where \(\lambda = 100\) is the regularization parameter.

This is much faster than iterative training (like backpropagation) because it solves for the optimal output weights in a single step.

### Per-Well Training

Each well gets its own ELM model:

1. PCHIP values at months with valid GLDAS data form the training targets.
2. Targets are z-scored using per-well mean and standard deviation.
3. The ELM is trained on these normalized targets.
4. Predictions are made for all months in the GLDAS range, then denormalized back to the original scale.

### Combined Output

The final output for each well and month is:

- **PCHIP value** if available (measurement-supported intervals)
- **ELM prediction** otherwise (gaps, extrapolation before/after measurements)

This combined series provides a continuous monthly record across the full output date range.

## Viewing Results

After the imputation completes, the model appears in the sidebar under the selected aquifer. Click it to load the results into the time series chart.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Model time series showing combined PCHIP and ELM curves with metrics</div>

### Display Modes

The model time series chart offers two display modes:

#### Combined Mode

- **Red line** — PCHIP interpolation (where measurements supported it)
- **Blue line** — ELM predictions (gap-filled regions)
- **Orange dashed line** — Moving average smoothing (optional)

The combined line seamlessly blends PCHIP and ELM — PCHIP is used wherever available, and ELM fills the rest.

#### Uncombined Mode

- **Red line** — PCHIP values across the full range
- **Blue line** — ELM predictions across the full range
- **Green dots** — Original measurement data points

This mode shows both signals independently, letting you compare where PCHIP and ELM agree or diverge.

### Metrics

Two quality metrics are displayed as badges in the chart header:

| Metric | Description |
|--------|-------------|
| **R²** | Coefficient of determination (0 to 1). Higher is better. Measures how well the ELM model explains the variance in the training data. |
| **RMSE** | Root Mean Squared Error in the region's length unit (ft or m). Lower is better. Represents the average prediction error magnitude. |

These metrics are computed on the training set (PCHIP values where measurements exist) in the original (denormalized) units.

### MAvg Smoothing

Toggle the **Smooth** checkbox and adjust the **Smooth Months** slider to apply Nadaraya-Watson kernel smoothing to the combined output. This uses a Gaussian kernel to produce a smoother curve that dampens short-term fluctuations. The smoothed curve is overlaid as an orange dashed line.

### GSE Reference

If the selected well has a ground surface elevation, a brown dashed **GSE line** is shown as a reference for how close the water table is to the surface.

### Processing Log

Click the log expander to view the full processing log from the imputation run. This includes per-well R² and RMSE values, which can help identify wells where the model performed poorly.

## Tips

- **Low R²** (< 0.5) at a well may indicate that soil moisture alone doesn't explain water level variations at that location. Local pumping, irrigation, or geology may be dominant factors.
- **High RMSE** relative to the measurement range suggests the model struggles with that well's dynamics. Consider whether the well has enough training data.
- Use the **gap size** parameter to control the tradeoff between PCHIP and ELM. A smaller gap size means more of the record is filled by PCHIP (which closely follows measurements) rather than the model.
- The **pad size** controls the transition zone between PCHIP and ELM. Larger pads give PCHIP more influence at gap boundaries.
- Imputation models can be used as input to spatial analysis (select "Model" as the temporal method) to produce raster surfaces that benefit from gap-filled data.
