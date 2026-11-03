# SLView Outlier — IOC Sea Level Monitoring & Spike Removal

A standalone, high-performance HTML/CSS/JavaScript web application for visualizing 24-hour sea level time series, detecting extreme measurement outliers, and applying spike removal based on official **IOC (Intergovernmental Oceanographic Commission) Sea Level Monitoring** standards.

---

## 🌊 Problem & Background

Sea level tide gauge sensors (radar, acoustic, or pressure gauges) periodically experience measurement errors, communication drops, or physical water splashes, producing extreme datapoints (e.g., $+15\text{ m}$, $-10\text{ m}$, or $0.000\text{ m}$ dropouts). 

When plotting a 24-hour time series whose natural tidal oscillation is only $10\text{--}20\text{ cm}$, a single $+12\text{ m}$ spike causes chart auto-scaling to squish the real data by **$50\times \text{--} 100\times$**, rendering the true tidal signal completely flat and indistinguishable.

---

## 📐 IOC Outlier Detection & Spike Removal Formulation

As documented by the **IOC Sea Level Station Monitoring FAQ**:

### 1. Outlier Detection Criterion
All values $X$ where:
$$|X - \text{median}| > \text{tolerance}$$
are flagged as outliers and masked or hidden.

$$\text{tolerance} = k \times |\text{percentile}_{90} - \text{median}|$$

- **Default Multiplier ($k$)**: $3.0$ (adjustable live from $0.5$ to $8.0$).
- **Statistics Basis**: The $\text{median}$ and $\text{percentile}_{90}$ are calculated across the active window (e.g., 24 hours / 1 day).

### 2. Spike Removal
- A 1D **running median filter** with a window size of $W = 3$ (or configurable $W \in \{1, 3, 5, 7\}$) smooths high-frequency spikes.

### 3. Mean Offset (Zero-Centering)
$$\text{offset} = \frac{1}{N} \sum_{i=1}^N X_i$$
Subtracting the time-frame average ($X_i - \text{offset}$) allows the graph to evolve around zero, enabling multi-sensor alignment across stations regardless of local datum differences.

---

## ✨ Features

- **Horizontal Time Zoom & Y-Axis Alignment**:
  - **Horizontal Zoom Only**: Chart dragging is restricted to the time axis (`drag: { x: true, y: false }`), preventing accidental vertical box distortion.
  - **"Fit Y to Visible" Button**: A dedicated toolbar button instantly scans the currently visible horizontal time window, computes the exact $\min$ and $\max$ of visible data points, and aligns the chart's Y-axis bounds to fit them snugly (with $5\%$ breathing padding).
  - **Reset Zoom**: Double-clicking anywhere on the chart or clicking the *Reset* button restores both axes to full 24-hour view.
- **High-Performance uPlot Engine**: Sub-millisecond rendering of thousands of high-frequency samples with smooth pan and box-zoom.
- **Semi-Transparent Visual Mask**:
  - **Valid Tolerance Mask Band**: Semi-transparent emerald band spanning $[\text{median} - \text{tolerance}, \text{median} + \text{tolerance}]$.
  - **Outlier Hazard Zones**: Shaded upper and lower regions indicating invalid territory.
  - **Reference Lines**: Dashed lines for $\text{Median}$, $\text{Percentile}_{90}$, $+\text{Tolerance}$, and $-\text{Tolerance}$.
  - **Outlier Halos**: Pulsing red target markers for detected anomalies with edge indicator arrows when clipped.
- **Live Reactive Parameter Tuning**:
  - Slider for multiplier $k$ ($0.5$ to $8.0$).
  - Slider for reference percentile $P$ ($60\%$ to $99\%$).
  - Segmented buttons for spike filter window ($W=1, 3, 5, 7$).
  - Toggle for Zero-Centering (subtracting offset).
- **Auto-Fit Scaling vs. Full Range**:
  - **Auto-Fit Valid Data**: Clips extreme outliers so the $10\text{ cm}$ tidal curve remains clear and readable at full vertical height.
  - **Include All Spikes**: Shows how severe glitches compress the signal (with real-time *Shrink Factor* reporting).
- **Outlier Events Inspector Table**:
  - Logs timestamp, measured value, median baseline, and tolerance excess.
  - One-click **Zoom** button navigates directly to the anomaly.
- **Station Directory & Date Picker Modal**:
  - **1,340 Stations**: Extracted from official `ioc-sealevelmonitoring.org/list.php` directory with station code, location/name, country, and GLOSS ID.
  - **Search & Filter**: Real-time keyword search across codes and locations, plus country filter dropdown spanning 105 countries.
  - **Date Picker**: Historical date query support (`endtime=YYYY-MM-DD+23:59:59`) with quick shortcuts (*Latest*, *Yesterday*, *7 Days Ago*).
  - **Duration Selector**: 1 Day (24h), 12h, 7 Days, or 30 Days.
- **Stress Testing Presets**:
  - Inject $+12.5\text{ m}$ spike.
  - Inject $0.000\text{ m}$ dropout.
  - Inject multi-spike jitter.
  - Reset to clean real IOC Erdek station data.
- **Data Ingestion & Export**:
  - Preloaded 24h dataset from IOC station **Erdek (Marmara Sea, Turkey)**.
  - Live IOC download modal with fallback CORS proxy and direct URL link.
  - Drag-and-drop or paste raw TSV / HTML table / CSV.
  - Export cleaned data as CSV.
- **STALTA-Themed UI**:
  - Modern design tokens matching STALTA seismic bench.
  - Dark / Light mode toggle with `localStorage` persistence.
  - Fully responsive, 100% self-contained (works offline via `file:///` without dependencies).

---

## 🚀 How to Run

### Recommended: Python Server with IOC Proxy (No CORS Restrictions)
Run the built-in server with Python (zero external dependencies required):
```bash
cd /Users/user/Documents/PROJECTS/SLVIEW_OUTLIER
python3 main.py
```
Then open:
```
http://localhost:8080/
```
This automatically serves the app and routes all IOC data requests through `/api/data`, bypassing browser CORS policies entirely.

---

### Alternative: Direct File Open
Double-click `index.html` or open in your browser:
```
file:///Users/user/Documents/PROJECTS/SLVIEW_OUTLIER/index.html
```
*(Preloaded 24h datasets work immediately; external live IOC fetches will use fallback proxies or the modal paste option).*

---

## 📁 Project Architecture

```
SLVIEW_OUTLIER/
├── index.html               # Main application entry point & semantic markup
├── css/
│   ├── theme.css            # Design tokens, color palette, dark/light theme
│   └── app.css              # App layouts, cards, controls, tables, badges
├── js/
│   ├── icons.js             # Inline Lucide SVG icon paths (themed via currentColor)
│   ├── theme.js             # Dark/Light theme manager with persistence
│   ├── outlier_engine.js    # Pure mathematical IOC formulas & median filtering
│   ├── chart.js             # uPlot integration with canvas mask draw hooks
│   └── app.js               # State manager, event listeners, file parser, export
├── data/
│   ├── stations.js          # 1,340 stations parsed from IOC list.php (offline JS bundle)
│   ├── stations.json        # Raw JSON directory of all stations
│   └── sample_erdek.js      # Embedded 24h IOC Erdek dataset (zero-CORS offline support)
├── vendor/
│   ├── uPlot.iife.min.js    # Lightweight high-performance canvas chart library
│   └── uPlot.min.css        # Base uPlot styles
├── sample_erdek_24h.tsv     # Raw downloaded IOC tabular data
└── README.md                # Documentation & mathematical reference
```

