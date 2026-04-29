# Active Wells

The **Active Wells** view is a data-coverage overlay for a loaded raster. It shows, for each frame of the animation, exactly which wells contributed data to the interpolation at that frame — wells with a valid value after temporal interpolation are highlighted, wells without are dimmed. The view is the answer to "how well-supported by data is this raster at this point in time?" — a question worth asking before trusting the spatial pattern in any particular frame, and especially before using the raster for any downstream analysis.

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Map in active-wells mode showing contributing wells highlighted and non-contributing wells dimmed</div>

The view toggles on via an **Active Wells** button in the raster controls. Clicking the button once shows the overlay for the current frame; as the animation plays or the frame slider is scrubbed, the overlay updates live to show which wells were active at the currently displayed frame. Clicking the button again turns the overlay off and returns the map to its default well coloring.

## What Makes a Well Active

At each raster frame, every qualifying well is temporally interpolated to the frame's date using whatever temporal method was chosen during the spatial analysis (PCHIP, linear, moving average, or a pre-trained imputation model). The interpolator returns a value when the frame date falls within the well's measurement span — or, for the model option, anywhere in the output range of the model. It returns null otherwise.

A well is marked **active** at a frame when the temporal interpolation returned a value at that frame's date, meaning the well actually contributed to the spatial interpolation at that frame. A well is marked **inactive** when the interpolation returned null, which can happen in three distinct situations:

**The well has no measurements near the frame date.** The most common reason — a well whose measurement record starts in 2005 contributes to frames from 2005 onward but is inactive at any frame before that. Similarly, a well whose measurements end in 2018 is inactive at any frame after 2018.

**The frame date falls in a large temporal gap.** When the gap-size threshold in the temporal settings excludes a large gap from PCHIP interpolation (replacing the gap interior with null rather than extrapolating blindly), the well is inactive at frames inside that gap.

**The well was excluded at qualification time.** Wells that didn't meet the minimum observations or minimum time-span thresholds in step 1 of the spatial wizard never contribute at all and appear inactive in every frame.

The three cases can't be distinguished by looking at the active-wells view alone — an inactive well is just inactive — but knowing which case applies at which well matters for interpretation. A well missing for temporal-gap reasons can often be brought back by using a model-based temporal method (which fills gaps) rather than a pure PCHIP method (which doesn't). A well missing because it failed qualification requires going back to the wizard and lowering the thresholds, which has downstream implications for the raster's overall reliability.

## Reading the Overlay

The overlay is most useful when played through the animation rather than viewed at a single frame. Watching the pattern of active wells evolve over time tells you a lot about how the well network has grown, shrunk, or shifted across the analysis window:

A network where the overlay shows **steadily increasing well counts** through time reflects a monitoring program that's been expanding — new wells coming online progressively across the window. Early frames of such a network are less data-rich than late frames, and the raster's reliability follows suit.

A network where the overlay shows **a large active set that thins out at the ends** reflects a program with a concentrated core period and wells coming and going at the edges. Interior frames are well-supported; frames at the beginning or end may be relying on just a handful of wells.

A network where the overlay shows **sudden drops and recoveries** in coverage typically reflects funding or operational discontinuities — a period where monitoring was temporarily suspended, or a year where budget constraints limited sampling. The raster frames during such drops are worth viewing with appropriate skepticism.

**Spatial clustering in the active set** matters too. If the active wells at a particular frame are concentrated in one corner of the aquifer, the raster over the other corner is effectively extrapolation — the interpolator is filling in values in a data-sparse region using whatever long-range behavior its spatial model assumes. Kriging's variogram controls the smoothness of that extrapolation; IDW bounds values by the nearest neighbors. In either case, the interpolated values over data-sparse regions are less reliable than the values over data-rich regions, and the active-wells overlay is the quickest way to see which regions are which.

## Using the Overlay in Practice

The most common use of the overlay is as a sanity check before drawing conclusions from a particular frame's spatial pattern. If the map shows a striking feature — a drawdown cone, a sharp gradient, a localized high — switching to the active-wells view and checking whether actual wells exist in that area is worth the extra click. If the feature is over a data-rich cluster, it's probably real; if it's over a data-sparse region with few active wells, it may be an interpolation artifact.

The overlay is also useful for identifying frames that deserve special treatment in downstream analysis. A storage-change analysis computed from a raster with frames that have very unequal well counts may have compromised reliability in the sparsely-covered frames; noting which frames those are and restricting a downstream comparison to the well-supported interval is a reasonable mitigation. Similarly, a cross-section drawn through a frame with no nearby active wells is primarily a picture of the interpolation method's assumptions, not of the aquifer.

!!! tip
    If the active-wells view reveals persistent coverage gaps that compromise the analysis, two paths are worth considering. Narrowing the analysis date range to focus on a period with better coverage is the simplest fix. A more substantial option — appropriate when gaps are unavoidable because the monitoring program has them — is running the spatial analysis with the **Model** temporal method, using a completed imputation model. The model fills gaps with climate-driven predictions, so wells that would be inactive under PCHIP are active under the model-based method, producing denser and more uniform coverage across frames.
