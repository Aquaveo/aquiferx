# Interpolation Methods

Two interpolation methods are available for generating raster surfaces from well measurements: **ordinary kriging** and **inverse distance weighting (IDW)**. Both take the per-well value at each frame time (supplied by the temporal step of the spatial wizard) and produce a continuous surface over the aquifer's bounding polygon. The methods differ in their assumptions about spatial correlation, their parameter sets, and their computational cost. Neither is universally best — the right choice depends on the spatial structure of the data you're interpolating and how much control you want over the resulting surface.

## Ordinary Kriging

Kriging is the default method and is the right starting point for most regional groundwater work. It's a geostatistical approach that models the spatial covariance of the observed data with a variogram, then uses that model to compute a weighted combination of the observations at every prediction location — weights that minimize the prediction error variance under an unbiased-estimator constraint. In practice this produces a smooth surface that respects whatever correlation structure actually exists in the data, rather than imposing an arbitrary decay shape.

The estimator for ordinary kriging at a prediction location \(\mathbf{x}_0\) is:

\[
\hat{Z}(\mathbf{x}_0) = \sum_{i=1}^{n} \lambda_i \, Z(\mathbf{x}_i)
\]

where the weights \(\lambda_i\) are solved from a linear system that combines the observed-to-observed covariance matrix with an unbiasedness constraint (a Lagrange multiplier ensures the weights sum to one). The covariances themselves come from the variogram model, evaluated at each observed-to-observed and observed-to-prediction distance.

### Variogram models

The variogram model is the piece that has to be specified, since kriging's behavior flows directly from the shape of the covariance decay. Three models are available, each producing a qualitatively different surface character.

**Gaussian** variograms model covariance as a Gaussian (bell curve) function of distance:

\[
C(h) = \sigma^2_s \cdot \exp\!\left(-\left(\frac{h}{r}\right)^2\right)
\]

This produces the smoothest surfaces of the three. The covariance decays slowly at short distances and rapidly at medium distances, which gives the interpolator enough short-range coherence to produce visually continuous surfaces without the small-scale bumpiness that other models can introduce. Gaussian variograms are the right default when the underlying parameter varies gradually and smoothly across space — water table elevation in a quiet alluvial aquifer, for instance.

**Spherical** variograms are the traditional default in classical geostatistics:

\[
C(h) = \begin{cases}
\sigma^2_s \left(1 - \frac{3}{2}\frac{h}{r} + \frac{1}{2}\left(\frac{h}{r}\right)^3\right) & h < r \\
0 & h \geq r
\end{cases}
\]

Spherical models are linear near the origin (producing slightly less smooth surfaces than Gaussian) and reach zero covariance exactly at the range, which makes the range a firm distance beyond which points are treated as uncorrelated. This is often a better match for parameters with well-defined spatial structure — a pumping cone with a recognizable extent, for example.

**Exponential** variograms are intermediate between the other two:

\[
C(h) = \sigma^2_s \cdot \exp\!\left(-\frac{h}{r}\right)
\]

The covariance decays exponentially with distance but never quite reaches zero, so every pair of wells retains a small non-zero correlation regardless of separation. Exponential variograms are useful for parameters with long-range dependencies — regional water-quality gradients, or basin-scale water-table patterns where the influence of regional recharge is felt everywhere.

In all three, \(h\) is the distance between two points, \(r\) is the **range** (the distance at which covariance effectively vanishes), and \(\sigma^2_s\) is the spatial variance (the sill minus the nugget; see below).

### Variogram parameters

Three quantities specify the variogram: the sill, the range, and the nugget.

The **sill** is the total variance the model approaches at large distances. The application estimates it as the sample variance of all observed values across the dataset, which is usually a reasonable approximation. You don't set this directly.

The **range** is the distance at which spatial correlation has effectively decayed. Three modes control how it's determined: **Auto** sets it to one-third of the aquifer's spatial diagonal, which is a workable default for most regional analyses; **Custom** lets you enter a value directly in meters if you have a calibrated estimate from a variogram analysis; **Percentage** sets it as a fraction (0–100 %) of the spatial diagonal, which is useful when you want to control the relative extent of correlation without recomputing the diagonal for each region.

The **nugget** represents micro-scale variability and measurement error — the variance that persists even at zero distance between two observations. Enabling it sets the nugget to 5 % of the sill, which accommodates small-scale noise without dominating the model. Disabling it sets a minimal value (0.001) for numerical stability rather than a true zero; a genuine zero produces a singular covariance matrix in many configurations.

### Numerical notes

Wells within 10 meters of each other are averaged into a single point before the kriging system is assembled. This prevents the singular covariance matrices that result when two rows of the covariance system are identical up to measurement noise, which happens more often than you'd expect in monitoring networks where redundant wells have been installed at the same site over time.

The kriging system itself is solved with LU decomposition with partial pivoting: O(n³) setup per frame to factor the covariance matrix, followed by an O(n²) pass per grid cell to compute the kriged estimate. Distances use the Haversine formula for geographic accuracy. Both the setup and per-cell costs scale aggressively with well count, so aquifers with thousands of qualifying wells can take noticeable time per frame.

## Inverse Distance Weighting (IDW)

IDW is a simpler, faster, deterministic alternative to kriging. The value at each prediction location is a weighted average of nearby wells, with weights that decrease with distance. Where kriging derives its weights from a global covariance model, IDW derives them from a purely local geometric rule, which makes it faster and more forgiving of unusual data layouts at the cost of giving up kriging's optimality guarantees.

The basic IDW estimator is:

\[
\hat{Z}(\mathbf{x}_0) = \sum_{i=1}^{n} w_i \, Q_i(\mathbf{x}_0)
\]

where \(Q_i(\mathbf{x}_0)\) is the value contributed by well \(i\) (the well's measured value, or a local polynomial fit at the well; see nodal functions below) and the weights are:

\[
w_i = \left(\frac{R - h_i}{R \cdot h_i}\right)^p
\]

with \(h_i\) the distance from the prediction point to well \(i\), \(R\) the maximum distance across the active neighbor set, and \(p\) the user-specified exponent. Weights are normalized to sum to one. When the prediction point coincides with a well location (distance under 0.01 mm), the well's value is returned directly, which avoids a singularity in the weight formula.

### The exponent

The exponent controls how sharply influence falls off with distance. Smaller values (below 2) produce broader influence and smoother surfaces; larger values produce sharper local peaks around each well — the "bulls-eye" pattern that IDW is sometimes criticized for at high exponents. The default of 2, corresponding to standard inverse-square weighting, is a reasonable middle ground. Valid values range from 0.5 to 10.

### Nodal functions

By default, each well contributes only its raw measured value as a constant at the prediction point. Nodal functions generalize this by fitting a local polynomial at each well and evaluating it at the prediction location instead of the flat value. This lets IDW capture local gradients and curvature that a constant-value scheme would smooth away.

The **classic** option disables nodal functions entirely — each well contributes its measured value as a constant. This is the simplest and fastest variant and is a good choice when the well network is dense enough that local gradients are captured through neighbor combinations.

The **gradient plane** option fits a first-order polynomial at each well using weighted least squares on the well's neighbors:

\[
Q_i(\mathbf{x}) = f_i + f_x(x - x_i) + f_y(y - y_i)
\]

where \(f_x\) and \(f_y\) are the estimated partial derivatives. This captures linear trends around each well and produces visibly more expressive surfaces than classic IDW, particularly in aquifers with consistent regional gradients.

The **quadratic** option fits a second-order polynomial at each well, adding curvature terms:

\[
Q_i(\mathbf{x}) = f_i + a_2\, dx + a_3\, dy + a_4\, dx^2 + a_5\, dx\,dy + a_6\, dy^2
\]

This captures curvature in the surface and is useful when the data has non-linear local structure — a pumping cone's curvature around an active well, for instance. Quadratic fits need at least six neighbors to solve for the five unknowns; if the quadratic system is singular (insufficient neighbors or degenerate geometry), the implementation falls back to the gradient-plane fit automatically.

### Neighbor selection

Two modes control which wells contribute to each prediction. **All wells** includes every qualifying well in the aquifer, weighted by distance. **Nearest N** restricts the contribution set to the K closest wells (default 12, range 3–100). The nearest-N mode is typically the better choice for large networks: it improves computation speed substantially and eliminates the contribution of distant wells that would have effectively zero weight anyway.

### Numerical notes

Coordinates are projected from lat/lng to a local equirectangular system (in meters) for accurate distance calculations across the aquifer. A KD-tree on the projected coordinates enables O(log n) nearest-neighbor queries, which makes nearest-N mode efficient even for networks with thousands of wells. The KD-tree is built once per frame and reused for every prediction cell in that frame.

## Shared Post-Processing

Both methods share two post-processing options applied to the raw interpolator output.

**Truncation** clamps values to a specified range after interpolation. Truncate Low sets a floor (useful for parameters that can't physically be negative — hydraulic heads below a basin floor, concentrations below zero), and Truncate High sets a ceiling (useful when an extrapolation in sparse areas produces obviously non-physical values). Both are off by default and are appropriate when the interpolator is producing values outside a known physical range.

**Log interpolation** performs the interpolation in log-transformed space: values are log-transformed before interpolation and exponentiated afterward. This is appropriate for parameters with log-normal distributions spanning multiple orders of magnitude — many water-quality parameters like nitrate, arsenic, and conductivity fall into this category. The option is automatically disabled when the dataset contains non-positive values, since the logarithm is undefined for zero and negative numbers.

## Choosing a Method

For most regional groundwater work, **ordinary kriging with a Gaussian variogram and the auto range** is the default worth trying first. Kriging's optimal-weight property produces the smoothest surfaces and the tightest fits to the data, and the Gaussian variogram's character suits the slow spatial variability typical of water table surfaces.

**IDW** is a better choice when computational time matters (very large networks), when you want tight local control over the weighting behavior, or when the data has unusual spatial structure (e.g. a few active wells embedded in a much sparser background) that kriging's global covariance model doesn't represent well. Within IDW, the gradient-plane or quadratic nodal functions produce noticeably more expressive surfaces than classic IDW and are worth trying before concluding that IDW is too blunt an instrument.

For water-quality work on parameters spanning multiple orders of magnitude, **log interpolation** is almost always the right addition, regardless of which method you pick. Without it, the interpolation is driven by the highest-magnitude observations and the lower-concentration areas read as noise; with it, the interpolator works in the log domain where all the observations contribute comparably.
