# Documentation

I would like you to create documentation for this entire app using markdown and mkdocs. This will become the official documentation that users will refer to when using the app. The documentation should be clear, concise, and easy to understand. It should cover all aspects of the app, including uploading data, running analyses, and interpreting results.

The documentation will be in a docs subdirectory in the root of the project. It should be organized in a logical manner, with clear headings and subheadings. The documentation should also include screenshots and examples where appropriate to help users understand how to use the app effectively.

We will use mkdocs to generate the documentation site. The mkdocs configuration file should be set up to include all the necessary pages and sections, and the documentation should be styled in a way that is consistent with the app's branding. Use readthedocs theme for mkdocs to ensure a clean and professional look.

Include mathjax support in the documentation to allow for the inclusion of mathematical equations and formulas where necessary. This will help users understand any complex analyses or results that may involve mathematical concepts.

The options and mkdocs.yml file should be set up similarly to what is used here:

https://github.com/njones61/xslope/

The documentation should include the following sections:

1. Home Page
2. Getting Started
3. Overview of the App
4. Preparing Data
5. Managing Data
6. Viewing Data
7. Trend Analysis
8. Spatial Analysis
   - Interpolation Methods
   - Raster Visualization
   - Storage Analysis
   - Cross Section Analysis
   - Active Wells
9. Imputing Data Gaps
10. Troubleshooting / FAQ
11. Glossary

The documentation should be thorough and comprehensive, with narrative text and screenshots to guide users through each step of using the app.

There are a lot of things in the app that may not be explicitly mentioned in this doc. Make sure to explore the app thoroughly and document any features or functionalities that are not explicitly mentioned here but are important for users to understand.

### Screenshots Strategy

Screenshots should follow a consistent approach:

- **Naming convention**: `docs/img/{section}/{description}.png` (e.g., `docs/img/managing-data/upload-wizard.png`)
- **Capture states**: Include both empty/initial states and loaded/active states where relevant
- **Annotations**: Use callouts or numbered markers to highlight key UI elements in complex screenshots
- **Scope**: Capture at the component level (e.g., just the sidebar, just the map) rather than full-window when focusing on a specific feature

## Home Page

This is a one page general overview of the app covering the key features and benefits. It should be concise and engaging, providing users with a clear understanding of what the app does and why they should use it. The home page should also include a call to action, encouraging users to explore the app further and start using its features.

## Getting Started

This section covers everything a user needs to get the app running:

- **System requirements**: Node.js version, supported browsers
- **Installation**: Clone the repo, `npm install`, `npm run dev` to start the dev server on port 3000
- **First launch**: What the user sees on first load, how to navigate the interface
- **Quick start**: A brief walkthrough of loading a sample dataset and viewing it on the map

## Overview of the App

This section provides a detailed description of the app's functionality, including the types of data that can be uploaded and analyzed, the main components of the app interface, and a summary of the main analysis features. It should give users a comprehensive understanding of what the app can do and how it can benefit them in their data analysis tasks.

### Data Types

Explain the data type system: how data type codes work (lowercase alphanumeric + underscore, max 20 chars), the reserved "wte" (water table elevation) type, and how users can define custom data types for other measurements. Discuss how data types affect file naming (`data_{code}.csv`) and how they appear in the UI selector.

## Data Preparation

This section provides instructions for preparing data for upload, including supported file formats and data structures. It also offers tips for ensuring data quality and consistency, which is crucial for accurate analysis results. Users will learn how to format their data correctly and avoid common pitfalls that can lead to errors in analysis.

This app is based on an earlier app called the Groundwater Data Mapper (GWDM). The data preparation instructions will be similar to those used in the GWDM, but with some modifications to accommodate the specific features and requirements of this new app. We can borrow heavily from this page in the GWDM documentation:

https://gwdm.readthedocs.io/en/latest/datapreparation/

We could download and use many of the same figures. **Note**: Download and capture any needed figures/content from the GWDM docs now, in case those resources change in the future.

Key topics to cover:

- Supported file formats: CSV (comma and tab delimited, auto-detected), GeoJSON, Shapefiles
- Date format auto-detection (ISO, US, EU variants)
- CRS/coordinate reference system handling (auto-detected from GeoJSON `crs` property or shapefile `.prj`)
- Required columns and naming conventions
- Common pitfalls (mixed delimiters, inconsistent date formats, missing CRS)

## Managing Data

This section explains how to upload data to the app using the Manage Data page, as well as how to delete or download data from the app. It provides step-by-step instructions for managing data within the app, ensuring that users can easily keep their data organized and accessible for analysis.

The section should walk through the hub-and-spoke import system:

- **Region import**: Creating a new region, setting length units, single vs. multi-aquifer mode
- **Aquifer import**: Uploading aquifer boundaries (GeoJSON/shapefile), reprojection handling
- **Well import**: Uploading well locations, column mapping
- **Measurement import**: Uploading time series data, column mapping, data type assignment

### Column Mapper

The column mapping modal is a critical step in all import flows. Include a screenshot and walkthrough explaining:

- How the modal presents detected CSV columns alongside expected fields
- How to map source columns to target fields (drag-and-drop or dropdown)
- How auto-detection works and when manual mapping is needed
- Common issues (unmapped required columns, type mismatches)

### Data Type Editor

The app includes a Data Type Editor for creating and managing custom data types. Document:

- How to open the editor (from the import hub or data type selector)
- Creating a new data type: code naming rules (lowercase alphanumeric + underscore, max 20 chars), label, and description
- Editing existing data types
- How custom types integrate with file naming (`data_{code}.csv`) and the UI selector

### Delete and Download Operations

Cover the data management operations available:

- Deleting individual data files (e.g., a single `data_{code}.csv`)
- Deleting an entire region folder and all its contents
- Downloading data from the app
- Confirmation dialogs and safeguards

### USGS Data Import

The app integrates with the USGS Water Data API to download wells and measurements directly. This subsection should explain:

- How to access the USGS import feature
- Selecting a region/area for USGS data download
- What data is retrieved (well locations, measurement time series)
- How downloaded data is integrated into the app's data structure

## Viewing Data

This section will cover how to view uploaded data in the app, including an explanation of the data visualization features and tips for interpreting data visualizations. It will include discussion of the hierarchical data explorer and how to use it to navigate through the data (region → aquifer → well hierarchy). It will discuss how to view time series for a selected well and some of the features of the time series viewer. It will also cover how to view spatial data and use the map interface to explore spatial patterns in the data.

### Multi-Well Selection

Document the multi-well selection feature:

- **Single click**: Select a single well
- **Shift-click**: Toggle individual wells to build a multi-well selection
- **Shift-drag**: Box-drag selection on the map to select multiple wells at once
- **Visual feedback**: Gold ring indicator for selected wells, crosshair cursor during box-drag
- **Time series comparison**: How multiple wells appear on the chart with color-coded series

### Time Series Chart Features

The time series chart uses PCHIP (Piecewise Cubic Hermite Interpolating Polynomial) interpolation to draw smooth curves through sparse measurement points. Document:

- How PCHIP interpolation works at a high level — it preserves monotonicity and produces a smooth curve without overshooting, unlike simple linear interpolation or cubic splines
- The difference between the interpolated curve and the actual measurement dots
- Dot click/selection behavior for inspecting individual measurements
- Zoom, pan, and other chart interaction features

## Trend Analysis

This section will cover what happens when the trend analysis button is clicked, including the legend and display of aquifers, wells, and the time series plot.

## Spatial Analysis

This section will cover what happens when the spatial analysis button is clicked, including each step of the wizard. Given the breadth of this topic, it should be organized as sub-pages in the mkdocs nav:

```yaml
# Suggested mkdocs.yml nav structure for this section
nav:
  - Spatial Analysis:
    - spatial/index.md
    - Interpolation Methods: spatial/interpolation.md
    - Raster Visualization: spatial/raster.md
    - Storage Analysis: spatial/storage.md
    - Cross Section: spatial/cross-section.md
    - Active Wells: spatial/active-wells.md
```

### Interpolation Methods

Explain each of the interpolation methods, including the assumptions and limitations of each method, the equations and mathematical concepts (using MathJax), and the options associated with each method.

### Raster Visualization

Discuss the raster that is generated and how to visualize it in the app, including the options for scrubbing the animation timeline.

### Storage Analysis

When a wte_raster is selected, we compute and display a storage analysis curve on the fly. This section will discuss how the curve is generated and how to interpret it. It will also discuss the options for scrubbing the animation and how to use the storage analysis curve to understand changes in groundwater storage over time. It will explain the red synch line on the curve and how it indicates the current time step in the animation. It will discuss the storage coefficient option.

### Cross Section Analysis

When a cross section is selected, we compute and display a cross section plot on the fly. This section will discuss how the cross section plot is generated and how to interpret it.

### Active Wells

This section will discuss the Active Wells button — what it does and how to interpret the results.

## Imputing Data Gaps

This section will describe the "Impute Data" wizard, including the options, and a detailed overview of the imputation/machine learning process, and the outputs. It will explain how to view and interpret the results in the time series window.

Key topics to cover:

- **What is ELM**: Explain Extreme Learning Machines — what they are, why they're suited for this task, and how they differ from other ML approaches
- **GLDAS input features**: Describe the GLDAS (Global Land Data Assimilation System) climate/hydrology variables used as input features for the model
- **MAvg smoothing**: Explain the moving average smoothing applied to model outputs and why it helps
- **Training process**: How the model trains on the full GLDAS date range, how imputation dates are clamped to available GLDAS data
- **Interpreting results**: How to view imputed vs. measured data in the time series chart, confidence indicators, and how to assess imputation quality

## Troubleshooting / FAQ

A section addressing common issues users may encounter:

- **CRS mismatches**: What happens when coordinate reference systems don't match, how reprojection works, and how to fix CRS issues in source data
- **CSV parsing problems**: Delimiter detection issues, encoding problems, how to verify your CSV is well-formed
- **Date format issues**: How auto-detection works, what to do when dates aren't recognized
- **Browser compatibility**: Supported browsers, known issues
- **Performance**: Tips for working with large datasets (many wells, long time series)

## Glossary

A glossary of key groundwater and hydrogeology terms used throughout the app and documentation:

- **Aquifer** — A subsurface layer of rock or sediment that holds and transmits groundwater
- **Water Table Elevation (WTE)** — The elevation of the top of the saturated zone, measured from a reference datum
- **Storage Coefficient** — The volume of water released from storage per unit decline in hydraulic head, per unit area
- **Specific Yield** — The ratio of the volume of water that drains from a saturated rock under gravity to the total volume of the rock
- **PCHIP** — Piecewise Cubic Hermite Interpolating Polynomial, a smooth interpolation method
- **ELM** — Extreme Learning Machine, a single-hidden-layer neural network used for imputation
- **GLDAS** — Global Land Data Assimilation System, a NASA dataset providing climate/hydrology variables
- **CRS** — Coordinate Reference System, defines how spatial coordinates map to locations on Earth
- **Raster** — A grid-based spatial data format representing continuous surfaces (e.g., interpolated water table)
- Additional terms as needed during documentation writing
