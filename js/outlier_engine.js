/**
 * Mathematical Engine for Sea Level Outlier Detection and Spike Removal
 * Based on IOC (Intergovernmental Oceanographic Commission) Sea Level Monitoring Standards:
 *
 * FAQ: Outlier detection and spike removal on station graphs:
 *  - All values X where abs(X - median) > tolerance are hidden/masked.
 *  - tolerance = k * abs(percentile90 - median)  [default k = 3]
 *  - Spike removal: median out of a window with size 3 (or configurable W)
 *  - Offset: average (mean) across the time frame, subtracted so the graph evolves around zero.
 */
(function () {
  'use strict';

  function isNumeric(n) {
    return typeof n === 'number' && !isNaN(n) && isFinite(n);
  }

  /**
   * Calculate arithmetic mean (offset).
   */
  function calculateMean(arr) {
    var sum = 0, count = 0;
    for (var i = 0; i < arr.length; i++) {
      if (isNumeric(arr[i])) {
        sum += arr[i];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * Calculate percentile P (0..100) using linear interpolation.
   */
  function calculatePercentile(sortedArr, p) {
    if (!sortedArr || sortedArr.length === 0) return 0;
    if (sortedArr.length === 1) return sortedArr[0];
    if (p <= 0) return sortedArr[0];
    if (p >= 100) return sortedArr[sortedArr.length - 1];

    var rank = (p / 100) * (sortedArr.length - 1);
    var lower = Math.floor(rank);
    var upper = Math.ceil(rank);
    var weight = rank - lower;
    return sortedArr[lower] + weight * (sortedArr[upper] - sortedArr[lower]);
  }

  /**
   * Calculate median of an array.
   */
  function calculateMedian(sortedArr) {
    return calculatePercentile(sortedArr, 50);
  }

  /**
   * Median Absolute Deviation (MAD), used as optional alternative comparison.
   */
  function calculateMAD(arr, median) {
    var diffs = [];
    for (var i = 0; i < arr.length; i++) {
      if (isNumeric(arr[i])) diffs.push(Math.abs(arr[i] - median));
    }
    diffs.sort(function (a, b) { return a - b; });
    return calculateMedian(diffs);
  }

  /**
   * Running 1D median filter with window size W (odd number, default 3).
   * Edge values are computed with truncated symmetric windows.
   */
  function medianFilter1D(arr, windowSize) {
    var n = arr.length;
    var W = Math.max(1, windowSize || 3);
    if (W <= 1) return arr.slice();
    if (W % 2 === 0) W += 1; // ensure odd window
    var half = Math.floor(W / 2);
    var out = new Array(n);

    for (var i = 0; i < n; i++) {
      var val = arr[i];
      if (!isNumeric(val)) {
        out[i] = val;
        continue;
      }
      var wVals = [];
      var start = Math.max(0, i - half);
      var end = Math.min(n - 1, i + half);
      for (var j = start; j <= end; j++) {
        if (isNumeric(arr[j])) wVals.push(arr[j]);
      }
      if (wVals.length > 0) {
        wVals.sort(function (a, b) { return a - b; });
        out[i] = calculateMedian(wVals);
      } else {
        out[i] = val;
      }
    }
    return out;
  }

  /**
   * Full IOC Outlier Detection & Processing Pipeline.
   *
   * @param {Array} rawItems - Array of [timeString, numericValue] or objects { time, val }
   * @param {Object} options - Parameter options:
   *   k: Multiplier (default 3.0)
   *   percentile: Percentile for tolerance (default 90)
   *   subtractOffset: Boolean (default false)
   *   spikeWindow: Window size for spike removal (1 = off, default 3)
   *   method: 'ioc' | 'iqr' | 'mad' (default 'ioc')
   */
  function processSeries(rawItems, options) {
    var opts = Object.assign({
      k: 3.0,
      percentile: 90,
      subtractOffset: false,
      spikeWindow: 1, // 1 = off by default on raw series until enabled
      method: 'ioc'
    }, options);

    var timestamps = [];
    var isoTimes = [];
    var rawValues = [];
    var numericVals = [];

    // Parse input
    for (var i = 0; i < rawItems.length; i++) {
      var item = rawItems[i];
      var timeStr, val;
      if (Array.isArray(item)) {
        timeStr = item[0];
        val = item[1];
      } else if (item && typeof item === 'object') {
        timeStr = item.time;
        val = item.val != null ? item.val : item.value;
      }
      var num = typeof val === 'number' ? val : parseFloat(val);

      // Parse timestamp: expects "YYYY-MM-DD HH:MM:SS" UTC or ISO
      var epoch;
      if (typeof timeStr === 'number') {
        epoch = timeStr > 1e11 ? Math.round(timeStr / 1000) : timeStr;
      } else if (typeof timeStr === 'string') {
        // Replace space with T to make standard ISO string
        var normalized = timeStr.trim().replace(' ', 'T');
        if (!normalized.endsWith('Z') && !normalized.includes('+')) {
          normalized += 'Z';
        }
        var parsed = Date.parse(normalized);
        epoch = !isNaN(parsed) ? Math.round(parsed / 1000) : i;
      } else {
        epoch = i;
      }

      timestamps.push(epoch);
      isoTimes.push(timeStr);
      rawValues.push(isNumeric(num) ? num : null);
      if (isNumeric(num)) numericVals.push(num);
    }

    // 1. Calculate Offset (mean of all values in time frame)
    var offset = calculateMean(numericVals);

    // Apply offset centering if requested
    var workingValues = new Array(rawValues.length);
    var validWorking = [];
    for (var j = 0; j < rawValues.length; j++) {
      if (isNumeric(rawValues[j])) {
        var v = opts.subtractOffset ? (rawValues[j] - offset) : rawValues[j];
        workingValues[j] = v;
        validWorking.push(v);
      } else {
        workingValues[j] = null;
      }
    }

    // Sort valid values to derive order statistics
    var sortedVals = validWorking.slice().sort(function (a, b) { return a - b; });

    // 2. Statistics on the plotted data
    var median = calculateMedian(sortedVals);
    var p90 = calculatePercentile(sortedVals, opts.percentile);
    var pDiff = Math.abs(p90 - median);

    // 3. Tolerance calculation
    var tolerance;
    if (opts.method === 'iqr') {
      var p25 = calculatePercentile(sortedVals, 25);
      var p75 = calculatePercentile(sortedVals, 75);
      tolerance = opts.k * Math.abs(p75 - p25);
    } else if (opts.method === 'mad') {
      var mad = calculateMAD(validWorking, median);
      tolerance = opts.k * (1.4826 * mad);
    } else {
      // IOC Standard: tolerance = 3 * abs(percentile90 - median)
      tolerance = opts.k * pDiff;
    }

    var upperLimit = median + tolerance;
    var lowerLimit = median - tolerance;

    // 4. Outlier detection
    var isOutlier = new Array(workingValues.length);
    var outliersList = [];
    var minValid = Infinity, maxValid = -Infinity;
    var minRaw = Infinity, maxRaw = -Infinity;

    for (var k = 0; k < workingValues.length; k++) {
      var x = workingValues[k];
      if (!isNumeric(x)) {
        isOutlier[k] = false;
        continue;
      }

      if (x < minRaw) minRaw = x;
      if (x > maxRaw) maxRaw = x;

      var diff = Math.abs(x - median);
      var outlier = diff > tolerance;
      isOutlier[k] = outlier;

      if (outlier) {
        outliersList.push({
          index: k,
          timestamp: timestamps[k],
          timeString: isoTimes[k],
          val: x,
          originalVal: rawValues[k],
          median: median,
          diff: diff,
          tolerance: tolerance,
          direction: x > median ? 'high' : 'low',
          excess: diff - tolerance
        });
      } else {
        if (x < minValid) minValid = x;
        if (x > maxValid) maxValid = x;
      }
    }

    // If all points were flagged (or none valid), fall back to minRaw/maxRaw
    if (minValid === Infinity) {
      minValid = minRaw;
      maxValid = maxRaw;
    }

    // 5. Optional Spike Removal via median filter
    var spikeFilteredValues = workingValues.slice();
    if (opts.spikeWindow > 1) {
      spikeFilteredValues = medianFilter1D(workingValues, opts.spikeWindow);
    }

    // 6. Cleaned Values: outliers replaced with null (hidden) or spike-removed
    var cleanedHidden = new Array(workingValues.length);
    var cleanedFilled = new Array(workingValues.length);
    for (var m = 0; m < workingValues.length; m++) {
      if (isOutlier[m]) {
        cleanedHidden[m] = null;
        cleanedFilled[m] = spikeFilteredValues[m] != null && !isOutlier[m]
          ? spikeFilteredValues[m]
          : (workingValues[m] > median ? upperLimit : lowerLimit);
      } else {
        cleanedHidden[m] = opts.spikeWindow > 1 ? spikeFilteredValues[m] : workingValues[m];
        cleanedFilled[m] = cleanedHidden[m];
      }
    }

    return {
      timestamps: timestamps,
      isoTimes: isoTimes,
      rawValues: workingValues,
      unadjustedValues: rawValues,
      spikeFilteredValues: spikeFilteredValues,
      cleanedHidden: cleanedHidden,
      cleanedFilled: cleanedFilled,
      isOutlier: isOutlier,
      outliersList: outliersList,
      stats: {
        count: validWorking.length,
        offset: offset,
        median: median,
        percentile: opts.percentile,
        percentileVal: p90,
        pDiff: pDiff,
        k: opts.k,
        tolerance: tolerance,
        upperLimit: upperLimit,
        lowerLimit: lowerLimit,
        outlierCount: outliersList.length,
        outlierPercent: validWorking.length > 0 ? (outliersList.length / validWorking.length) * 100 : 0,
        minValid: minValid,
        maxValid: maxValid,
        minRaw: minRaw,
        maxRaw: maxRaw,
        validSpan: maxValid - minValid,
        rawSpan: maxRaw - minRaw,
        shrinkFactor: (maxValid - minValid) > 0 ? (maxRaw - minRaw) / (maxValid - minValid) : 1
      }
    };
  }

  window.OutlierEngine = {
    calculateMean: calculateMean,
    calculateMedian: calculateMedian,
    calculatePercentile: calculatePercentile,
    calculateMAD: calculateMAD,
    medianFilter1D: medianFilter1D,
    processSeries: processSeries
  };
})();

