/**
 * Interactive uPlot Chart with IOC Outlier Mask & Spike Visualization.
 * Inspired by STALTA's uPlot architecture and styling.
 */
(function () {
  'use strict';

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function getThemeColors() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: isDark ? 'rgba(100, 160, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      axis: isDark ? '#6e8aaf' : '#6c7586',
      waveRaw: isDark ? '#7a8ba3' : '#64748b',
      waveClean: isDark ? '#38bdf8' : '#0284c7',
      spikeFiltered: isDark ? '#a78bfa' : '#8b5cf6',
      medianLine: isDark ? '#34d399' : '#059669',
      p90Line: isDark ? '#c084fc' : '#9333ea',
      toleranceBound: isDark ? '#f87171' : '#dc2626',
      toleranceBandFill: isDark ? 'rgba(52, 211, 153, 0.08)' : 'rgba(5, 150, 105, 0.06)',
      outlierZoneFill: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(220, 38, 38, 0.06)',
      outlierPoint: '#ef4444',
      outlierHalo: 'rgba(239, 68, 68, 0.35)',
      font: '11px "Inter", -apple-system, sans-serif',
      monoFont: '11px "JetBrains Mono", monospace'
    };
  }

  function isoUtc(ts) {
    return new Date(Math.round(ts * 1000)).toISOString();
  }

  function cursorTime(ts) {
    if (ts == null) return '—';
    return isoUtc(ts).replace('T', ' ').replace('Z', ' UTC');
  }

  function tickTimes(self, ticks) {
    var span = self.scales.x.max - self.scales.x.min;
    return ticks.map(function (ts, i) {
      var iso = isoUtc(ts);
      var timeLabel = span < 86400 ? iso.slice(11, 19) : iso.slice(11, 16);
      var dayLabel = iso.slice(0, 10);
      return (i === 0 || isoUtc(ticks[i - 1]).slice(0, 10) !== dayLabel)
        ? timeLabel + '\n' + dayLabel
        : timeLabel;
    });
  }

  /**
   * Main Sea Level Outlier Chart Component
   */
  function SeaLevelChart(containerEl, options) {
    this.container = containerEl;
    this.options = Object.assign({
      showToleranceMask: true,
      showOutlierZones: true,
      showMedianLine: true,
      showP90Line: true,
      showOutlierPoints: true,
      yScaleMode: 'fit_valid', // 'fit_valid' or 'fit_all'
      displayMode: 'mask',     // 'mask', 'hide', 'clean', 'compare'
      unit: 'm'
    }, options);

    this.uplot = null;
    this.processedData = null;
    this.customYRange = null;
    this.resizeObserver = null;
    this.cursorReadoutEl = null;

    this.init();
  }

  SeaLevelChart.prototype.init = function () {
    var self = this;
    window.addEventListener('themechanged', function () {
      if (self.uplot) self.uplot.redraw();
    });

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(function () {
        self.resize();
      });
      this.resizeObserver.observe(this.container);
    }
  };

  /**
   * Custom Canvas Draw Hook for Outlier Mask, Tolerance Envelope & Outlier Halos
   */
  SeaLevelChart.prototype.drawAnnotations = function (u) {
    if (!this.processedData) return;
    var data = this.processedData;
    var stats = data.stats;
    var t = getThemeColors();
    var ctx = u.ctx;

    var left = u.bbox.left;
    var top = u.bbox.top;
    var width = u.bbox.width;
    var height = u.bbox.height;
    var right = left + width;
    var bottom = top + height;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();

    var yUpper = u.valToPos(stats.upperLimit, 'y', true);
    var yLower = u.valToPos(stats.lowerLimit, 'y', true);
    var yMedian = u.valToPos(stats.median, 'y', true);
    var yP90 = u.valToPos(stats.percentileVal, 'y', true);

    // 1. Outlier Warning Zones (Shaded regions beyond tolerance bounds)
    if (this.options.showOutlierZones) {
      ctx.fillStyle = t.outlierZoneFill;
      // Upper outlier zone (from chart top down to yUpper)
      if (yUpper > top) {
        ctx.fillRect(left, top, width, Math.min(yUpper - top, height));
      }
      // Lower outlier zone (from yLower down to bottom)
      if (yLower < bottom) {
        ctx.fillRect(left, Math.max(top, yLower), width, bottom - Math.max(top, yLower));
      }
    }

    // 2. Semi-Transparent Valid Tolerance Mask Band [median - tolerance, median + tolerance]
    if (this.options.showToleranceMask) {
      var bandTop = Math.max(top, Math.min(yUpper, yLower));
      var bandBottom = Math.min(bottom, Math.max(yUpper, yLower));
      var bandHeight = Math.max(0, bandBottom - bandTop);

      ctx.fillStyle = t.toleranceBandFill;
      ctx.fillRect(left, bandTop, width, bandHeight);

      // Boundary strokes
      ctx.strokeStyle = t.toleranceBound;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);

      // Upper limit line
      if (yUpper >= top && yUpper <= bottom) {
        ctx.beginPath();
        ctx.moveTo(left, yUpper);
        ctx.lineTo(right, yUpper);
        ctx.stroke();
      }

      // Lower limit line
      if (yLower >= top && yLower <= bottom) {
        ctx.beginPath();
        ctx.moveTo(left, yLower);
        ctx.lineTo(right, yLower);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // 3. Percentile 90 Reference Line
    if (this.options.showP90Line && yP90 >= top && yP90 <= bottom) {
      ctx.strokeStyle = t.p90Line;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(left, yP90);
      ctx.lineTo(right, yP90);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Median Reference Line
    if (this.options.showMedianLine && yMedian >= top && yMedian <= bottom) {
      ctx.strokeStyle = t.medianLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(left, yMedian);
      ctx.lineTo(right, yMedian);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Draw Canvas Labels for Tolerance & Median on the far right
    ctx.font = t.monoFont;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    if (this.options.showToleranceMask && yUpper >= top + 14 && yUpper <= bottom) {
      ctx.fillStyle = t.toleranceBound;
      ctx.fillText('+Tol: ' + stats.upperLimit.toFixed(3) + 'm', right - 8, yUpper - 3);
    }
    if (this.options.showToleranceMask && yLower >= top && yLower <= bottom - 4) {
      ctx.fillStyle = t.toleranceBound;
      ctx.textBaseline = 'top';
      ctx.fillText('-Tol: ' + stats.lowerLimit.toFixed(3) + 'm', right - 8, yLower + 3);
    }
    if (this.options.showMedianLine && yMedian >= top + 14 && yMedian <= bottom - 4) {
      ctx.fillStyle = t.medianLine;
      ctx.textBaseline = 'bottom';
      ctx.fillText('Median: ' + stats.median.toFixed(3) + 'm', right - 8, yMedian - 3);
    }

    // 6. Highlight Outlier Points with glowing warning halos
    if (this.options.showOutlierPoints && data.outliersList.length > 0) {
      var dpr = window.devicePixelRatio || 1;
      for (var o = 0; o < data.outliersList.length; o++) {
        var pt = data.outliersList[o];
        var px = u.valToPos(pt.timestamp, 'x', true);
        var py = u.valToPos(pt.val, 'y', true);

        // Check if point is within horizontal visible window
        if (px < left - 10 || px > right + 10) continue;

        // If point is clipped vertically by Y-scale zoom, draw indicator arrow at edge
        if (py < top) {
          // Clipped above top edge
          ctx.fillStyle = t.outlierPoint;
          ctx.beginPath();
          ctx.moveTo(px, top + 2);
          ctx.lineTo(px - 5, top + 9);
          ctx.lineTo(px + 5, top + 9);
          ctx.closePath();
          ctx.fill();
          continue;
        } else if (py > bottom) {
          // Clipped below bottom edge
          ctx.fillStyle = t.outlierPoint;
          ctx.beginPath();
          ctx.moveTo(px, bottom - 2);
          ctx.lineTo(px - 5, bottom - 9);
          ctx.lineTo(px + 5, bottom - 9);
          ctx.closePath();
          ctx.fill();
          continue;
        }

        // Draw outer pulsing halo
        ctx.fillStyle = t.outlierHalo;
        ctx.beginPath();
        ctx.arc(px, py, 7 * dpr, 0, Math.PI * 2);
        ctx.fill();

        // Draw solid inner core
        ctx.fillStyle = t.outlierPoint;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  /**
   * Render or update the uPlot chart with the given processed data.
   */
  SeaLevelChart.prototype.render = function (processedData) {
    this.processedData = processedData;
    var self = this;
    var t = getThemeColors();
    var stats = processedData.stats;

    // Build series data arrays based on display mode
    var seriesData = [];
    var seriesConfigs = [{ label: 'Time' }];

    if (this.options.displayMode === 'compare') {
      // Trace 1: Raw Signal (gray)
      // Trace 2: Cleaned Signal (blue)
      seriesData = [
        processedData.timestamps,
        processedData.rawValues,
        processedData.cleanedHidden
      ];
      seriesConfigs.push({
        label: 'Raw (removed in orange)',
        stroke: '#f97316',
        width: 1.8,
        points: { show: false }
      });
      seriesConfigs.push({
        label: 'Cleaned',
        stroke: t.waveClean,
        width: 1.8,
        points: { show: false }
      });
    } else if (this.options.displayMode === 'hide') {
      // Outliers hidden (null breaks)
      seriesData = [
        processedData.timestamps,
        processedData.cleanedHidden
      ];
      seriesConfigs.push({
        label: 'Valid Sea Level',
        stroke: t.waveClean,
        width: 1.8,
        points: { show: false }
      });
    } else if (this.options.displayMode === 'clean') {
      // Spike-filtered signal
      seriesData = [
        processedData.timestamps,
        processedData.spikeFilteredValues
      ];
      seriesConfigs.push({
        label: 'Spike-Filtered',
        stroke: t.spikeFiltered,
        width: 1.8,
        points: { show: false }
      });
    } else {
      // Default: 'mask' mode (show all raw data, with outlier mask overlaid)
      seriesData = [
        processedData.timestamps,
        processedData.rawValues
      ];
      seriesConfigs.push({
        label: 'Sea Level',
        stroke: t.waveClean,
        width: 1.8,
        points: { show: false }
      });
    }

    // Determine Y range
    var yRangeFn = function (u, min, max) {
      if (self.customYRange) {
        return self.customYRange;
      }
      if (self.options.yScaleMode === 'fit_valid') {
        var span = stats.validSpan > 0 ? stats.validSpan : 0.1;
        var pad = Math.max(span * 0.18, 0.02);
        // Ensure tolerance envelope is also visible comfortably
        var yMin = Math.min(stats.minValid - pad, stats.lowerLimit - pad * 0.5);
        var yMax = Math.max(stats.maxValid + pad, stats.upperLimit + pad * 0.5);
        return [yMin, yMax];
      } else {
        // Full range (including extreme outliers)
        var rawSpan = stats.rawSpan > 0 ? stats.rawSpan : 0.1;
        var rPad = Math.max(rawSpan * 0.1, 0.05);
        return [stats.minRaw - rPad, stats.maxRaw + rPad];
      }
    };

    var width = this.container.clientWidth || 800;
    var height = this.container.clientHeight || 420;

    var opts = {
      width: width,
      height: height,
      cursor: {
        drag: { x: true, y: false, setScale: false }, // Horizontal zoom only, no vertical box zoom
        sync: { key: 'slview' },
        points: { size: 6 }
      },
      hooks: {
        draw: [
          function (u) {
            self.drawAnnotations(u);
          }
        ],
        setSelect: [
          function (u) {
            if (u.select.width < 5) return;
            var min = u.posToVal(u.select.left, 'x');
            var max = u.posToVal(u.select.left + u.select.width, 'x');
            u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false);
            self.setXRange(min, max);
          }
        ]
      },
      scales: {
        x: { time: true },
        y: { range: yRangeFn }
      },
      axes: [
        {
          stroke: t.axis,
          grid: { stroke: t.grid, width: 1 },
          ticks: { stroke: t.grid, width: 1 },
          font: t.font,
          space: 70,
          values: tickTimes
        },
        {
          stroke: t.axis,
          grid: { stroke: t.grid, width: 1 },
          ticks: { stroke: t.grid, width: 1 },
          font: t.font,
          size: 72,
          values: function (u, ticks) {
            return ticks.map(function (v) {
              return v.toFixed(3) + ' ' + self.options.unit;
            });
          }
        }
      ],
      series: seriesConfigs
    };

    if (this.uplot) {
      this.uplot.destroy();
    }
    this.container.innerHTML = '';
    this.uplot = new uPlot(opts, seriesData, this.container);

    // Setup cursor readout listener
    this.attachCursorReadout();
  };

  SeaLevelChart.prototype.attachCursorReadout = function () {
    var self = this;
    if (!this.uplot) return;

    this.uplot.root.addEventListener('mousemove', function () {
      var idx = self.uplot.cursor.idx;
      if (idx == null || !self.processedData) return;
      var ts = self.processedData.timestamps[idx];
      var rawVal = self.processedData.rawValues[idx];
      var isOutlier = self.processedData.isOutlier[idx];

      if (self.cursorReadoutEl) {
        var str = cursorTime(ts) + ' | Value: ' + (rawVal != null ? rawVal.toFixed(3) + 'm' : '—');
        if (isOutlier) {
          var diff = Math.abs(rawVal - self.processedData.stats.median);
          str += ' <span class="badge badge-danger">OUTLIER (Δ ' + diff.toFixed(3) + 'm)</span>';
        } else if (rawVal != null) {
          str += ' <span class="badge badge-success">VALID</span>';
        }
        self.cursorReadoutEl.innerHTML = str;
      }
    });

    this.uplot.root.addEventListener('dblclick', function () {
      self.resetZoom();
    });
  };

  SeaLevelChart.prototype.setCursorReadoutElement = function (el) {
    this.cursorReadoutEl = el;
  };

  SeaLevelChart.prototype.setXRange = function (min, max) {
    if (!this.uplot) return;
    this.visibleXRange = [min, max];
    this.uplot.setScale('x', { min: min, max: max });
  };

  SeaLevelChart.prototype.resetZoom = function () {
    if (!this.uplot || !this.processedData) return;
    this.customYRange = null; // Clear manual Y scale override
    this.visibleXRange = null; // Clear X zoom window
    var ts = this.processedData.timestamps;
    if (ts.length > 0) {
      this.uplot.setScale('x', { min: ts[0], max: ts[ts.length - 1] });
      this.render(this.processedData);
    }
  };

  /**
   * Aligns the chart Y-axis min/max levels to the min/max values of visible data.
   */
  SeaLevelChart.prototype.fitYToVisible = function (paddingPct) {
    if (!this.uplot || !this.processedData) return null;
    var u = this.uplot;
    var xMin = this.visibleXRange ? this.visibleXRange[0] : u.scales.x.min;
    var xMax = this.visibleXRange ? this.visibleXRange[1] : u.scales.x.max;
    var ts = this.processedData.timestamps;
    var isOutlier = this.processedData.isOutlier;

    // Use values according to active display mode
    var vals = this.options.displayMode === 'clean'
      ? this.processedData.spikeFilteredValues
      : (this.options.displayMode === 'hide' ? this.processedData.cleanedHidden : this.processedData.rawValues);

    var vMin = Infinity;
    var vMax = -Infinity;
    var count = 0;

    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t >= xMin && t <= xMax) {
        var v = vals[i];
        if (v != null && typeof v === 'number' && !isNaN(v) && isFinite(v)) {
          // If in fit_valid mode and point is outlier, skip unless all points are outliers
          if (this.options.yScaleMode === 'fit_valid' && isOutlier[i] && this.options.displayMode !== 'compare') {
            continue;
          }
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
          count++;
        }
      }
    }

    // Fallback if all points were outliers in current view
    if (count === 0 || vMin === Infinity) {
      for (var j = 0; j < ts.length; j++) {
        var tj = ts[j];
        if (tj >= xMin && tj <= xMax) {
          var vj = this.processedData.rawValues[j];
          if (vj != null && !isNaN(vj) && isFinite(vj)) {
            if (vj < vMin) vMin = vj;
            if (vj > vMax) vMax = vj;
            count++;
          }
        }
      }
    }

    if (vMin !== Infinity && vMax !== -Infinity) {
      var span = vMax - vMin;
      var pct = paddingPct != null ? paddingPct : 0.05; // 5% breathing padding
      var pad = span > 0 ? span * pct : 0.01;
      var yMin = vMin - pad;
      var yMax = vMax + pad;

      this.customYRange = [yMin, yMax];
      u.setScale('y', { min: yMin, max: yMax });
      u.redraw();
      return { min: yMin, max: yMax, dataMin: vMin, dataMax: vMax, count: count };
    }
    return null;
  };

  SeaLevelChart.prototype.zoomToOutlier = function (timestamp) {
    if (!this.uplot) return;
    var windowSpan = 3600 * 2; // 2 hour window around outlier
    this.setXRange(timestamp - windowSpan / 2, timestamp + windowSpan / 2);
  };

  SeaLevelChart.prototype.setOptions = function (newOpts) {
    Object.assign(this.options, newOpts);
    if (this.processedData) {
      this.render(this.processedData);
    }
  };

  SeaLevelChart.prototype.resize = function () {
    if (!this.uplot) return;
    var w = this.container.clientWidth;
    var h = this.container.clientHeight;
    if (w > 0 && h > 0) {
      this.uplot.setSize({ width: w, height: h });
    }
  };

  SeaLevelChart.prototype.destroy = function () {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.uplot) this.uplot.destroy();
    this.container.innerHTML = '';
  };

  window.SeaLevelChart = SeaLevelChart;
})();

