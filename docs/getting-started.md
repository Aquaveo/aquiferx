# Getting Started

Aquifer Analyst is a browser-based application that runs from a small local development server on your own machine. There's no cloud service to sign up for and no database to provision — you clone the repository, install its dependencies, start the server, and open a URL in your browser. This page walks through the prerequisites, the one-time installation, and the first few things to do once the application is running.

## Prerequisites

The application runs on any modern desktop operating system (Windows, macOS, or Linux) and works in any recent version of Chrome, Firefox, Edge, or Safari. Under the hood it needs two pieces of supporting software:

- **Node.js 18 or later**, which provides the JavaScript runtime and bundled package manager (`npm`) that drive the local server.
- **Git**, used to clone the repository and to pull updates.

Most Linux distributions ship with both available through the package manager. On macOS, both can be installed via [Homebrew](https://brew.sh/) — `brew install node git` — or downloaded directly from [nodejs.org](https://nodejs.org/) and [git-scm.com](https://git-scm.com/download/mac). On Windows, grab the LTS installer from [nodejs.org](https://nodejs.org/) (it bundles npm) and the Git installer from [git-scm.com](https://git-scm.com/download/win); defaults are fine on both. You can verify both are installed and visible on your path by running:

    node --version
    git --version

## Installation

Clone the repository, install the dependencies, and start the development server:

    git clone https://github.com/njones61/aquiferx.git
    cd aquiferx
    npm install
    npm run dev

The first two commands are one-time. The `npm install` step downloads the JavaScript dependencies into a local `node_modules` folder and takes a few minutes on a fresh checkout. The final command starts the development server and prints a URL — by default <http://localhost:3000> — that you can open in your browser.

For subsequent sessions, you only need the last command:

    cd aquiferx
    npm run dev

Leave the terminal running while you use the app; the server needs to stay up for the page to load. `Ctrl+C` in the terminal stops it.

## First Launch

<div style="color: #c00; background: #ffeaea; padding: 0.5em 0.75em; border-left: 4px solid #c00; margin: 1em 0;"><strong>SCREENSHOT NEEDED:</strong> Initial app view with a sample region loaded</div>

The browser opens to the four-pane interface described in the [Overview](overview.md) — a toolbar at the top, a sidebar tree on the left, a map in the center, and a time series chart at the bottom. If the repository includes sample data, one or more regions will already be listed in the sidebar and you can skip to exploring them. If the sidebar is empty, you'll start by importing a region, either by creating one from scratch through the **Manage Data** button or by unzipping a packaged region you already have. The [Managing Data](managing-data.md) page walks through both paths.

## Exploring a Region

Once a region is loaded, the typical first-time sequence is straightforward. Expand the region in the sidebar to see its aquifers, and click an aquifer to zoom the map to that aquifer and display its wells as colored markers. Marker color reflects the number of observations each well has for the currently selected data type, so the densest data shows up as the darkest cluster.

Clicking any well plots its measurement history in the time series chart at the bottom of the screen. Hold **Shift** while clicking additional wells to overlay them on the same chart, each in a different color, or hold Shift and drag a rectangle across the map to select every well inside the box. The data type selector at the top of the toolbar switches between water level, any water quality parameters that have been imported, and any custom parameters defined for the region.

The toolbar's three analysis buttons launch more involved workflows: **Trend Analysis** overlays a region-wide linear regression view that color-codes wells by their rate of change, **Spatial Analysis** runs interpolation (kriging or IDW) across the aquifer to produce animated raster surfaces, and **Impute Data** trains a machine-learning model per well that fills gaps in sparse records. Each of these has its own documentation page with the details.

## What's Next?

- The [Overview](overview.md) covers the interface and data model in more depth.
- The [Preparing Data](data-preparation.md) page describes the file formats the import wizards expect.
- The [Managing Data](managing-data.md) page walks through the import and export workflows.
- The [Water Quality Data](water-quality.md) page covers the parameter catalog, smart well discovery, and the Water Quality Portal download.
