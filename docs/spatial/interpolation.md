# Interpolation Methods

Aquifer Analyst provides two spatial interpolation methods for generating raster surfaces from well data: **Kriging** and **Inverse Distance Weighting (IDW)**.

## Kriging

Kriging is a geostatistical interpolation method that models the spatial covariance structure of the data to produce optimal, unbiased predictions. It is the default method and is recommended when the data exhibits spatial correlation patterns.

### How Kriging Works

Kriging estimates the value at an unsampled location as a weighted linear combination of the observed values:

\[
\hat{Z}(\mathbf{x}_0) = \sum_{i=1}^{n} \lambda_i \, Z(\mathbf{x}_i) + \mu
\]

where \(\lambda_i\) are the kriging weights and \(\mu\) is a Lagrange multiplier that ensures the prediction is unbiased (the weights sum to 1). This is known as **Ordinary Kriging**.

The weights are determined by solving a linear system based on the spatial covariance between observation points and between each observation point and the prediction location.

### Variogram Models

The covariance function describes how spatial correlation decays with distance. Aquifer Analyst supports three variogram models, each defining a different decay shape:

#### Gaussian

\[
C(h) = \sigma^2_s \cdot \exp\!\left(-\left(\frac{h}{r}\right)^2\right)
\]

Produces the smoothest surfaces. The correlation decays as a Gaussian (bell curve) with distance. Good for data that varies gradually across space.

#### Spherical

\[
C(h) = \begin{cases}
\sigma^2_s \left(1 - \frac{3}{2}\frac{h}{r} + \frac{1}{2}\left(\frac{h}{r}\right)^3\right) & \text{if } h < r \\
0 & \text{if } h \geq r
\end{cases}
\]

Has a linear behavior near the origin and reaches zero covariance at the range distance. The most commonly used model in geostatistics.

#### Exponential

\[
C(h) = \sigma^2_s \cdot \exp\!\left(-\frac{h}{r}\right)
\]

Intermediate smoothness between Gaussian and Spherical. Correlation never quite reaches zero, making it suitable for data with long-range dependencies.

In all models:

- \(h\) is the distance between two points
- \(r\) is the **range** — the distance at which spatial correlation effectively vanishes
- \(\sigma^2_s = \text{sill} - \text{nugget}\) is the spatial variance

### Variogram Parameters

| Parameter | Description | How It's Estimated |
|-----------|-------------|-------------------|
| **Sill** | Total variance of the observations | Sample variance of all well values |
| **Range** | Distance at which correlation decays to near zero | See Range Mode below |
| **Nugget** | Micro-scale variance (measurement error / small-scale variability) | 5% of the sill when enabled; 0.001 when disabled |

#### Range Mode

The range controls the spatial extent of correlation. You can set it three ways:

| Mode | Behavior |
|------|----------|
| **Auto** | One-third of the spatial diagonal of the well network (default) |
| **Custom** | Enter a value in meters directly |
| **Percentage** | Enter a percentage (0–100%) of the spatial diagonal |

#### Nugget Effect

Enable the nugget to account for measurement noise or sub-grid variability. When enabled, the nugget is set to 5% of the variance. When disabled, a minimal value of 0.001 is used instead of zero to maintain numerical stability.

### Kriging Options Summary

| Option | Default | Description |
|--------|---------|-------------|
| Variogram Model | Gaussian | Shape of the spatial covariance function |
| Enable Nugget | On | Include measurement noise in the model |
| Range Mode | Auto | How the correlation range is determined |
| Range Value | 33% | Custom or percentage value (when applicable) |

### Implementation Notes

- **Deduplication**: Wells within 10 meters of each other are averaged to prevent singular covariance matrices.
- **Solver**: The kriging system is solved using LU decomposition with partial pivoting — O(n³) setup, O(n²) per grid cell.
- **Distance**: All distances are computed using the Haversine formula for geographic accuracy.

## Inverse Distance Weighting (IDW)

IDW is a deterministic interpolation method that estimates values at unsampled locations as a weighted average of nearby observations. Closer wells receive more weight.

### How IDW Works

The basic IDW formula computes the interpolated value as:

\[
\hat{Z}(\mathbf{x}_0) = \sum_{i=1}^{n} w_i \, Q_i(\mathbf{x}_0)
\]

where \(Q_i\) is the nodal function at well \(i\) (see below) and the weights are:

\[
w_i = \left(\frac{R - h_i}{R \cdot h_i}\right)^p
\]

where \(h_i\) is the distance from the prediction point to well \(i\), \(R\) is the maximum distance across the active neighbor set, and \(p\) is the exponent. Weights are normalized to sum to 1.

If the prediction point coincides with a well location (distance < 0.01 mm), the well's value is returned directly.

### Exponent

The exponent \(p\) controls how quickly influence decreases with distance:

| Exponent | Behavior |
|----------|----------|
| Low (< 2) | Broader influence; smoother surfaces |
| 2 (default) | Standard inverse-square weighting |
| High (> 2) | Sharper local influence; more "bulls-eye" patterns around wells |

Valid range: 0.5 to 10.

### Nodal Functions

Nodal functions fit a local polynomial at each well, allowing IDW to capture local gradients rather than treating each well as a flat constant.

#### Classic

No local polynomial. Each well contributes only its measured value:

\[
Q_i(\mathbf{x}) = f_i
\]

This is the simplest and fastest option.

#### Gradient Plane

A first-order polynomial is fitted at each well using weighted least squares on its neighbors:

\[
Q_i(\mathbf{x}) = f_i + f_x (x - x_i) + f_y (y - y_i)
\]

where \(f_x\) and \(f_y\) are the estimated partial derivatives. This captures linear trends around each well.

#### Quadratic

A second-order polynomial is fitted at each well:

\[
Q_i(\mathbf{x}) = f_i + a_2 \, dx + a_3 \, dy + a_4 \, dx^2 + a_5 \, dx \cdot dy + a_6 \, dy^2
\]

where \(dx = x - x_i\) and \(dy = y - y_i\). This captures curvature in the surface. Requires at least 6 neighbors to solve the 5 unknowns.

### Neighbor Selection

| Mode | Behavior |
|------|----------|
| **All wells** | Every well contributes, weighted by distance (default) |
| **Nearest N** | Only the K nearest wells contribute (configurable, 3–100) |

Using nearest-neighbor mode can improve performance and reduce the influence of distant wells.

### IDW Options Summary

| Option | Default | Description |
|--------|---------|-------------|
| Exponent | 2 | Power of distance decay |
| Nodal Function | Classic | Local polynomial type at each well |
| Neighbors | All | Use all wells or nearest K |
| Neighbor Count | 12 | K value for nearest-neighbor mode |

### Implementation Notes

- **Coordinate projection**: Lat/lng coordinates are projected to a local equirectangular system (in meters) for accurate distance calculations.
- **KD-Tree**: A KD-tree data structure enables O(log n) nearest-neighbor queries, making IDW efficient even with many wells.
- **Fallback**: If the quadratic nodal function system is singular (insufficient or co-located neighbors), it falls back to the gradient plane.

## General Options

Both Kriging and IDW share these post-processing options:

### Truncation

Enable truncation to clamp interpolated values to a specified range:

- **Truncate Low** — Set a minimum value (e.g., 0 to prevent negative elevations).
- **Truncate High** — Set a maximum value.

This is useful when the interpolation produces physically unrealistic values outside the observed range.

### Log Interpolation

Enable log interpolation to work in log-transformed space. This is useful for data that spans several orders of magnitude (e.g., contaminant concentrations). The values are log-transformed before interpolation and back-transformed afterward.

!!! note
    Log interpolation is automatically disabled if any observation has a non-positive value, since the logarithm is undefined for zero and negative numbers.

## Choosing a Method

| Consideration | Kriging | IDW |
|---------------|---------|-----|
| Best for | Data with spatial correlation patterns | Quick estimates, uneven data density |
| Smoothness | Controlled by variogram model | Controlled by exponent and nodal function |
| Speed | Slower (O(n³) setup) | Faster (O(n log n) with KD-tree) |
| Parameters | Sill, range, nugget, model | Exponent, nodal function, neighbors |
| Extrapolation | Can extrapolate beyond data (use truncation) | Bounded by nearest observations |

For most groundwater applications, **Kriging with the Gaussian variogram** is a good starting point. If computation time is a concern or you want more local control, try **IDW with gradient or quadratic nodal functions**.
