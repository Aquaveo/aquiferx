# Spatial Interpolation

We have a Spatial Analysis tool that interpolates the water level time series in time at selected periods and then for each period, it interpolates spatially to the aquifer domain using kriging. I would like to add some addtional interpolation options and restructure the process.

## Multi Step Wizard

Right now the command brings up a single window with a lot of options, most of which relate to the temporal interpolation. I want to break this into a 3-step wizard: 

**Step 1 - Temporal Interpolation**

This would be the same options we currently have, except for the control to enter the title or code (at the bottom). That will be moved to Step 3.

**Step 2 - Spatial Interpolation**

This is a new set of options. It will include two primary interpolation methods:

Kriging - the current method

Inverse Distance Weighted (IDW) - a new method described in more detail below. 

There will also be a set of general interpolation options (see below)

**Step 3 - Title**

This will be the title from the bottom of the current page.

## Kriging Options

How does our current option build the variogram? Are there any options we should present here?

## IDW Options and Calculations

This is a new method that we need to implement. It will use the  inverse distance weighting formula.

The simplest form of inverse distance weighted interpolation is sometimes called **Shepard's method**. The interpolated value is defined as 

$F(x,y) = \sum_{i=1}^{n} w_i f_i$,

where 

$n$ = the number of scatter points<br>
$f_i$ = the prescribed values at the scatter points, and <br>
$w_i$ = the weights assigned to each scatter point.

### Calculation of Weights

The classical weight function is

$w_i = \dfrac{h_i^{-p}}{\sum_{j=1}^{n} h_j^{-p}}$,

where $p$ is a positive real number called the weighting exponent (commonly $p = 2$).

The distance from the interpolation point $(x,y)$ to scatter point $(x_i,y_i)$ is

$h_i = \sqrt{(x - x_i)^2 + (y - y_i)^2}$.

The weights are normalized so that $\sum_{i=1}^{n} w_i = 1$.

Although the previous equation is the classical form, we will calculate the weights as:

$w_i =
\dfrac{
\left( \dfrac{R - h_i}{R h_i} \right)^2
}{
\sum_{j=1}^{n}
\left( \dfrac{R - h_j}{R h_j} \right)^2
}$,

where:

$h_i$ = the distance from the interpolation point to scatter point <br>
$i$, $R$ = the distance to the most distant scatter point, and <br>
$n$ = the total number of scatter points.

## Gradient Plane Nodal Functions

A limitation of Shepard's method is that the interpolating surface is a simple weighted average of the data values of the scatter points and is constrained to lie between the extreme values in the dataset. In other words, the surface does not infer local maxima or minima implicit in the dataset. This problem can be overcome by generalizing the basic form of the equation for Shepard's method in the following manner:

$F(x,y) = \sum_{i=1}^{n} w_i Q_i(x,y)$,

where $Q_i$ are nodal functions or individual functions defined at each scatter point (Franke 1982; Watson & Philip 1985). The value of an interpolation point is calculated as the weighted average of the values of the nodal functions at that point.

The standard form of Shepard's method can be thought of as a special case where horizontal planes (constants) are used for the nodal functions. The nodal functions can be sloping planes that pass through the scatter point. The equation for the plane is as follows:

$Q_i(x,y) = f_x (x - x_i) + f_y (y - y_i) + f_i$,

where $f_x$ and $f_y$ are partial derivatives at the scatter point that have been previously estimated based on the geometry of the surrounding scatter points. Gradients are finding the coefficients of  a plane that passes through the point, and approximates neighboring points using a weighted least squares regression (could use the same weights as above).

The planes represented by the above equation are sometimes called "gradient planes". By averaging planes rather than constant values at each scatter point, the resulting surface infers extremities and is asymptotic to the gradient plane at the scatter point rather than forming a flat plateau at the scatter point.

### Quadratic Nodal Functions

The nodal functions used in inverse distance weighted interpolation can be higher degree polynomial functions constrained to pass through the scatter point and approximate the nearby points in a least squares manner. Quadratic polynomials have been found to work well in many cases (Franke & Nielson 1980; Franke 1982). The resulting surface reproduces local variations implicit in the dataset, is smooth, and approximates the quadratic nodal functions near the scatter points. The equation used for the quadratic nodal function centered at point $k$ is as follows:

$Q_k(x,y) = a_{k1} + a_{k2}(x - x_k) + a_{k3}(y - y_k) + a_{k4}(x - x_k)^2 + a_{k5}(x - x_k)(y - y_k) + a_{k6}(y - y_k)^2$.

To define the function, the six coefficients $a_{k1}, \dots, a_{k6}$ must be found. Since the function is centered at point $k$ and passes through point $k$, we know beforehand that $a_{k1} = f_k$, where $f_k$ is the function value at point $k$. The equation simplifies to:

$Q_k(x,y) = f_k + a_{k2}(x - x_k) + a_{k3}(y - y_k) + a_{k4}(x - x_k)^2 + a_{k5}(x - x_k)(y - y_k) + a_{k6}(y - y_k)^2$.

Now there are only five unknown coefficients. The coefficients are found by fitting the quadratic to the nearest $N_Q$ scatter points using a weighted least squares approach. In order for the matrix equation used to solve for the coefficients to be stable, there should be at least five scatter points in the set.

### Summary

When the IDW option is selected, we should present the following options:

Exponent - default to 2.0

Nodal functions:

- Classic form (no nodal functions)  
- Gradient plane nodal functions
- Quadratic nodal functions

Default nodal function option = Gradient Plane

## General Interpolation Options

truncate low values

truncate high values

Log interpolation




## Default Title

