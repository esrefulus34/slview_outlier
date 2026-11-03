/**
 * SLView Outlier - Main Application Controller
 */
(function () {
  'use strict';

  var state = {
    stationName: 'Erdek (Marmara Sea, Turkey)',
    sensorName: 'rad(m)',
    rawData: [], // array of [timeStr, val]
    params: {
      k: 3.0,
      percentile: 90,
      subtractOffset: false,
      spikeWindow: 1, // 1 = off, 3 = median 3
      method: 'ioc'
    },
    viewOpts: {
      showToleranceMask: true,
      showOutlierZones: true,
      showMedianLine: true,
      showP90Line: true,
      showOutlierPoints: true,
      yScaleMode: 'fit_valid',
      displayMode: 'mask'
    },
    processed: null
  };

  var chart = null;

  function init() {
    var container = document.getElementById('chart-box');
    chart = new window.SeaLevelChart(container, state.viewOpts);
    chart.setCursorReadoutElement(document.getElementById('cursor-readout'));
    window.chart = chart;
    window.appState = state;

    setupEventListeners();

    // Load initial data (from window.DEFAULT_DATA in data/sample_erdek.js)
    if (window.DEFAULT_DATA && window.DEFAULT_DATA.length > 0) {
      state.rawData = window.DEFAULT_DATA.slice();
      if (window.DEFAULT_STATION) state.stationName = window.DEFAULT_STATION;
      if (window.DEFAULT_SENSOR) state.sensorName = window.DEFAULT_SENSOR;
      updateUI();
    } else {
      // Fallback sample generator if file not found
      state.rawData = generateSyntheticTidalData();
      updateUI();
    }
  }

  function updateUI() {
    // 1. Process dataset through OutlierEngine
    state.processed = window.OutlierEngine.processSeries(state.rawData, state.params);

    // 2. Render chart
    chart.render(state.processed);

    // 3. Update stats cards
    updateStatsCards(state.processed.stats);

    // 4. Update formula preview text
    updateFormulaPreview(state.processed.stats);

    // 5. Update outliers inspector table
    updateOutliersTable(state.processed.outliersList);

    // 6. Update station badges
    document.getElementById('station-name-pill').textContent = state.stationName;
    document.getElementById('sensor-pill').textContent = state.sensorName;
  }

  function updateStatsCards(stats) {
    document.getElementById('stat-total-count').textContent = stats.count.toLocaleString();
    
    var outlierEl = document.getElementById('stat-outlier-count');
    outlierEl.textContent = stats.outlierCount + ' (' + stats.outlierPercent.toFixed(1) + '%)';
    var chipOutlier = document.getElementById('chip-outliers');
    if (stats.outlierCount > 0) {
      chipOutlier.classList.add('alert-danger');
      chipOutlier.classList.remove('alert-success');
    } else {
      chipOutlier.classList.remove('alert-danger');
      chipOutlier.classList.add('alert-success');
    }

    document.getElementById('stat-median').textContent = stats.median.toFixed(3) + ' m';
    document.getElementById('stat-p90').textContent = stats.percentileVal.toFixed(3) + ' m';
    document.getElementById('stat-tolerance').textContent = '±' + stats.tolerance.toFixed(3) + ' m';
    document.getElementById('stat-offset').textContent = stats.offset.toFixed(3) + ' m';

    // Real signal span vs distorted span
    var spanText = (stats.validSpan * 100).toFixed(1) + ' cm';
    document.getElementById('stat-valid-span').textContent = spanText;

    var shrinkChip = document.getElementById('stat-shrink-factor');
    if (stats.shrinkFactor > 1.2) {
      shrinkChip.textContent = stats.shrinkFactor.toFixed(1) + 'x squished';
      shrinkChip.className = 'badge badge-danger';
    } else {
      shrinkChip.textContent = 'Normal 1:1';
      shrinkChip.className = 'badge badge-success';
    }
  }

  function updateFormulaPreview(stats) {
    var pDiff = stats.pDiff.toFixed(3);
    var k = state.params.k.toFixed(1);
    var tol = stats.tolerance.toFixed(3);
    var med = stats.median.toFixed(3);
    var pVal = stats.percentileVal.toFixed(3);

    var text = 'tol = ' + k + ' × |' + pVal + ' - ' + med + '| = ' + k + ' × ' + pDiff + ' = ±' + tol + 'm';
    var el = document.getElementById('formula-live-eval');
    if (el) el.textContent = text;
  }

  function updateOutliersTable(outliers) {
    var tbody = document.getElementById('outliers-table-body');
    var badge = document.getElementById('outlier-table-badge');
    badge.textContent = outliers.length;

    tbody.innerHTML = '';
    if (outliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--fg-subtle);padding:14px;">No outliers detected with current tolerance parameters. Real data is clean!</td></tr>';
      return;
    }

    outliers.forEach(function (pt) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + pt.timeString + '</td>' +
        '<td style="color:var(--danger);font-weight:700;">' + pt.val.toFixed(3) + 'm</td>' +
        '<td>' + pt.median.toFixed(3) + 'm</td>' +
        '<td>Δ ' + pt.diff.toFixed(3) + 'm (+' + pt.excess.toFixed(3) + 'm)</td>' +
        '<td><button class="btn sm ghost" data-ts="' + pt.timestamp + '">Zoom</button></td>';

      tr.querySelector('button').addEventListener('click', function (e) {
        e.stopPropagation();
        chart.zoomToOutlier(pt.timestamp);
      });

      tr.addEventListener('click', function () {
        chart.zoomToOutlier(pt.timestamp);
      });

      tbody.appendChild(tr);
    });
  }

  function setupEventListeners() {
    // 1. Parameter: Tolerance multiplier k
    var kSlider = document.getElementById('k-slider');
    var kOutput = document.getElementById('k-output');
    kSlider.addEventListener('input', function () {
      var val = parseFloat(this.value);
      state.params.k = val;
      kOutput.textContent = val.toFixed(1);
      updateUI();
    });

    // 2. Parameter: Percentile P
    var pSlider = document.getElementById('p-slider');
    var pOutput = document.getElementById('p-output');
    pSlider.addEventListener('input', function () {
      var val = parseInt(this.value, 10);
      state.params.percentile = val;
      pOutput.textContent = val + '%';
      updateUI();
    });

    // 3. Parameter: Spike Removal Window
    var spikeBtns = document.querySelectorAll('.seg-spike-btn');
    spikeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        spikeBtns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.params.spikeWindow = parseInt(this.getAttribute('data-window'), 10);
        updateUI();
      });
    });

    // 4. Parameter: Offset Subtraction (Center around 0)
    var offsetToggle = document.getElementById('offset-toggle');
    offsetToggle.addEventListener('change', function () {
      state.params.subtractOffset = this.checked;
      updateUI();
    });

    // 5. Y-Scale Fitting Mode ('fit_valid' vs 'fit_all')
    var scaleBtns = document.querySelectorAll('.seg-scale-btn');
    scaleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        scaleBtns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.viewOpts.yScaleMode = this.getAttribute('data-scale');
        chart.setOptions({ yScaleMode: state.viewOpts.yScaleMode });
      });
    });

    // 6. Display Mode ('mask', 'hide', 'clean', 'compare')
    var modeBtns = document.querySelectorAll('.seg-mode-btn');
    modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeBtns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.viewOpts.displayMode = this.getAttribute('data-mode');
        chart.setOptions({ displayMode: state.viewOpts.displayMode });
      });
    });

    // 7. Visual Mask Toggles
    var maskToggle = document.getElementById('mask-toggle');
    if (maskToggle) {
      maskToggle.addEventListener('change', function () {
        state.viewOpts.showToleranceMask = this.checked;
        chart.setOptions({ showToleranceMask: this.checked });
      });
    }

    var zoneToggle = document.getElementById('zone-toggle');
    if (zoneToggle) {
      zoneToggle.addEventListener('change', function () {
        state.viewOpts.showOutlierZones = this.checked;
        chart.setOptions({ showOutlierZones: this.checked });
      });
    }

    var medianToggle = document.getElementById('median-toggle');
    if (medianToggle) {
      medianToggle.addEventListener('change', function () {
        state.viewOpts.showMedianLine = this.checked;
        chart.setOptions({ showMedianLine: this.checked });
      });
    }

    var p90Toggle = document.getElementById('p90-toggle');
    if (p90Toggle) {
      p90Toggle.addEventListener('change', function () {
        state.viewOpts.showP90Line = this.checked;
        chart.setOptions({ showP90Line: this.checked });
      });
    }

    var pointsToggle = document.getElementById('points-toggle');
    if (pointsToggle) {
      pointsToggle.addEventListener('change', function () {
        state.viewOpts.showOutlierPoints = this.checked;
        chart.setOptions({ showOutlierPoints: this.checked });
      });
    }

    // 8. Zoom & Scale Controls
    document.getElementById('btn-reset-zoom').addEventListener('click', function () {
      chart.resetZoom();
    });

    document.getElementById('btn-fit-y').addEventListener('click', function () {
      var res = chart.fitYToVisible();
      if (res && res.count > 0) {
        var statusMsg = document.getElementById('cursor-readout');
        if (statusMsg) {
          statusMsg.innerHTML = '<span class="badge badge-success">Y Aligned: ' + res.dataMin.toFixed(3) + 'm &rarr; ' + res.dataMax.toFixed(3) + 'm (' + res.count + ' pts)</span>';
        }
      }
    });

    // 9. Stress Testing & Outlier Injection Presets
    document.getElementById('btn-inject-high').addEventListener('click', function () {
      injectSpike(12.5, 'high');
    });

    document.getElementById('btn-inject-zero').addEventListener('click', function () {
      injectSpike(0.0, 'dropout');
    });

    document.getElementById('btn-inject-random').addEventListener('click', function () {
      injectRandomGlitchSet();
    });

    document.getElementById('btn-reset-data').addEventListener('click', function () {
      if (window.DEFAULT_DATA) {
        state.rawData = window.DEFAULT_DATA.slice();
        updateUI();
      }
    });

    // 10. Modals (Fetch IOC, Upload/Paste, Help)
    setupModals();
    setupStationPicker();
    setupDatePicker();

    // 11. Export Cleaned CSV
    document.getElementById('btn-export-csv').addEventListener('click', exportCleanedCSV);
  }

  function injectSpike(spikeVal, type) {
    if (state.rawData.length === 0) return;
    var idx = Math.floor(state.rawData.length * (type === 'dropout' ? 0.65 : 0.35));
    state.rawData[idx] = [state.rawData[idx][0], spikeVal];
    updateUI();
  }

  function injectRandomGlitchSet() {
    if (state.rawData.length === 0) return;
    var n = state.rawData.length;
    var glitches = [
      { pos: 0.15, val: 8.5 },
      { pos: 0.28, val: -4.2 },
      { pos: 0.50, val: 0.0 },
      { pos: 0.72, val: 14.8 },
      { pos: 0.88, val: -1.5 }
    ];
    glitches.forEach(function (g) {
      var i = Math.floor(n * g.pos);
      state.rawData[i] = [state.rawData[i][0], g.val];
    });
    updateUI();
  }

  /* ---------- Station Directory & Picker ---------- */
  var selectedStation = {
    code: 'erdek',
    name: 'Erdek',
    country: 'Turkey',
    location: 'Erdek'
  };

  function setupStationPicker() {
    var stations = window.IOC_STATIONS || [];
    var searchInput = document.getElementById('fetch-station-search');
    var countrySelect = document.getElementById('fetch-country-filter');
    var listContainer = document.getElementById('fetch-stations-list');

    // Populate country filter dropdown
    var countryCounts = {};
    stations.forEach(function (s) {
      var c = s.country || 'Unknown';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    var sortedCountries = Object.keys(countryCounts).sort();
    sortedCountries.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c + ' (' + countryCounts[c] + ')';
      countrySelect.appendChild(opt);
    });

    function renderStationList() {
      var query = (searchInput.value || '').trim().toLowerCase();
      var selectedCountry = countrySelect.value;
      var filtered = stations.filter(function (s) {
        if (selectedCountry && s.country !== selectedCountry) return false;
        if (!query) return true;
        return (
          (s.code && s.code.toLowerCase().includes(query)) ||
          (s.name && s.name.toLowerCase().includes(query)) ||
          (s.location && s.location.toLowerCase().includes(query)) ||
          (s.country && s.country.toLowerCase().includes(query))
        );
      });

      listContainer.innerHTML = '';
      if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding:14px;text-align:center;color:var(--fg-subtle);font-size:12px;">No stations match the search filter.</div>';
        return;
      }

      // Render up to 100 stations for instant performance
      var renderMax = Math.min(filtered.length, 100);
      for (var i = 0; i < renderMax; i++) {
        var st = filtered[i];
        var item = document.createElement('div');
        item.className = 'station-item' + (st.code === selectedStation.code ? ' selected' : '');
        item.setAttribute('data-code', st.code);

        var glossBadge = st.gloss ? '<span class="badge" style="font-size:10px;background:var(--muted);color:var(--fg-subtle);">GLOSS ' + st.gloss + '</span>' : '';

        item.innerHTML =
          '<div>' +
            '<div style="font-weight:600;display:flex;align-items:center;gap:6px;">' +
              st.name +
              glossBadge +
            '</div>' +
            '<div class="station-country-badge">' + (st.location ? st.location + ', ' : '') + st.country + '</div>' +
          '</div>' +
          '<span class="station-code-badge">' + st.code + '</span>';

        (function (stationObj) {
          item.addEventListener('click', function () {
            selectStation(stationObj);
          });
        })(st);

        listContainer.appendChild(item);
      }

      if (filtered.length > 100) {
        var note = document.createElement('div');
        note.style.cssText = 'padding:6px;text-align:center;font-size:11px;color:var(--fg-subtle);background:var(--muted);';
        note.textContent = 'Showing 100 of ' + filtered.length + ' matching stations. Refine search for more.';
        listContainer.appendChild(note);
      }
    }

    function selectStation(st) {
      selectedStation = st;
      document.getElementById('fetch-station-code').value = st.code;
      document.getElementById('fetch-selected-code').textContent = st.code;
      document.getElementById('fetch-selected-title').textContent = st.name + ' (' + st.country + ')';

      // Update selected class in visible list
      var allItems = listContainer.querySelectorAll('.station-item');
      allItems.forEach(function (el) {
        el.classList.toggle('selected', el.getAttribute('data-code') === st.code);
      });
    }

    searchInput.addEventListener('input', renderStationList);
    countrySelect.addEventListener('change', renderStationList);

    // Quick station chips
    var quickChips = document.querySelectorAll('[data-quick-code]');
    quickChips.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = this.getAttribute('data-quick-code');
        var found = stations.find(function (s) { return s.code.toLowerCase() === code.toLowerCase(); });
        if (found) {
          selectStation(found);
          // Highlight in list if present
          renderStationList();
        }
      });
    });

    // Initial render
    renderStationList();
  }

  /* ---------- Date Picker Helpers ---------- */
  function setupDatePicker() {
    var dateInput = document.getElementById('fetch-date');
    var indicator = document.getElementById('fetch-date-indicator');
    var todayStr = new Date().toISOString().split('T')[0];

    // Max selectable date is today
    dateInput.max = todayStr;

    function setDate(dateStr, label) {
      dateInput.value = dateStr;
      indicator.textContent = label || dateStr;
    }

    document.getElementById('btn-date-latest').addEventListener('click', function () {
      setDate('', 'Latest (Now)');
    });

    document.getElementById('btn-date-yesterday').addEventListener('click', function () {
      var d = new Date();
      d.setDate(d.getDate() - 1);
      var str = d.toISOString().split('T')[0];
      setDate(str, 'Yesterday (' + str + ')');
    });

    document.getElementById('btn-date-7d').addEventListener('click', function () {
      var d = new Date();
      d.setDate(d.getDate() - 7);
      var str = d.toISOString().split('T')[0];
      setDate(str, '7 Days Ago (' + str + ')');
    });

    dateInput.addEventListener('change', function () {
      if (this.value) {
        indicator.textContent = this.value;
      } else {
        indicator.textContent = 'Latest (Now)';
      }
    });
  }

  function setupModals() {
    var fetchModal = document.getElementById('modal-fetch');
    var uploadModal = document.getElementById('modal-upload');
    var helpModal = document.getElementById('modal-help');

    // Open buttons
    document.getElementById('btn-open-fetch').addEventListener('click', function () {
      fetchModal.showModal();
    });
    document.getElementById('btn-open-upload').addEventListener('click', function () {
      uploadModal.showModal();
    });
    document.getElementById('btn-open-help').addEventListener('click', function () {
      helpModal.showModal();
    });

    // Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        this.closest('dialog').close();
      });
    });

    // Fetch action
    document.getElementById('btn-do-fetch').addEventListener('click', function () {
      var code = document.getElementById('fetch-station-code').value.trim() || selectedStation.code || 'erdek';
      var period = document.getElementById('fetch-period').value.trim() || '1';
      var dateVal = document.getElementById('fetch-date').value.trim();
      fetchIOCStation(code, period, dateVal, fetchModal);
    });

    // Paste / File parse action
    var fileInput = document.getElementById('file-upload-input');
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        parseAndLoadRawText(ev.target.result, file.name);
        uploadModal.close();
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-do-paste-load').addEventListener('click', function () {
      var text = document.getElementById('paste-text-area').value.trim();
      if (text) {
        parseAndLoadRawText(text, 'Pasted Data');
        uploadModal.close();
      }
    });
  }

  function parseAndLoadRawText(content, sourceName) {
    var rows = [];
    // 1. Check if HTML table with <tr><td>
    if (content.indexOf('<tr') !== -1 && content.indexOf('<td') !== -1) {
      var regex = /<tr><td>(.*?)<\/td><td[^>]*>(.*?)<\/td><\/tr>/gi;
      var match;
      while ((match = regex.exec(content)) !== null) {
        var t = match[1].trim();
        var v = parseFloat(match[2].trim());
        if (!t.toLowerCase().startsWith('time') && !isNaN(v)) {
          rows.push([t, v]);
        }
      }
    } else {
      // 2. TSV / CSV / Lines
      var lines = content.split(/\r?\n/);
      lines.forEach(function (line) {
        if (!line.trim()) return;
        var parts = line.split(/[,\t|]/);
        if (parts.length >= 2) {
          var t = parts[0].trim();
          var v = parseFloat(parts[1].trim());
          if (!t.toLowerCase().startsWith('time') && !isNaN(v)) {
            rows.push([t, v]);
          }
        }
      });
    }

    if (rows.length > 0) {
      state.rawData = rows;
      state.stationName = sourceName || 'Custom Dataset';
      updateUI();
    } else {
      alert('Could not parse any valid date/time and numeric sea level rows from the input.');
    }
  }

  async function fetchIOCStation(code, period, queryDate, modal) {
    var statusEl = document.getElementById('fetch-status-msg');
    var displayName = selectedStation.name ? (selectedStation.name + ' (' + selectedStation.country + ')') : code.toUpperCase();
    var dateLabel = queryDate ? ' [Date: ' + queryDate + ']' : ' [Latest 24h]';

    statusEl.innerHTML = '<span style="color:var(--primary)">Fetching station <strong>' + displayName + '</strong>' + dateLabel + '...</span>';
    statusEl.hidden = false;

    // 1. Try local proxy route first if running from http server (python3 main.py)
    var localProxyUrl = '/api/data?code=' + encodeURIComponent(code) + '&period=' + encodeURIComponent(period);
    if (queryDate) {
      localProxyUrl += '&endtime=' + encodeURIComponent(queryDate + ' 23:59:59');
    }

    var directUrl = 'https://www.ioc-sealevelmonitoring.org/bgraph.php?code=' + encodeURIComponent(code) + '&output=tab&period=' + encodeURIComponent(period);
    if (queryDate) {
      directUrl += '&endtime=' + encodeURIComponent(queryDate + ' 23:59:59');
    }

    // CORS proxies fallback
    var proxyUrl1 = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(directUrl);
    var proxyUrl2 = 'https://corsproxy.io/?' + encodeURIComponent(directUrl);

    // If served via HTTP, try the local backend route (main.py) which has zero CORS restrictions
    if (window.location.protocol.startsWith('http')) {
      try {
        var localResp = await fetch(localProxyUrl);
        if (localResp.ok) {
          var localText = await localResp.text();
          if (localText && (localText.indexOf('<tr') !== -1 || localText.indexOf('\t') !== -1)) {
            parseAndLoadRawText(localText, displayName + dateLabel);
            statusEl.hidden = true;
            modal.close();
            return;
          }
        }
      } catch (errLocal) {
        // Fall through to direct or public proxies if local route is not active
      }
    }

    try {
      var resp = await fetch(directUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var text = await resp.text();
      parseAndLoadRawText(text, displayName + dateLabel);
      statusEl.hidden = true;
      modal.close();
    } catch (e) {
      try {
        statusEl.innerHTML = '<span style="color:var(--warning)">Direct browser fetch blocked by CORS. Trying fallback proxy...</span>';
        var pResp = await fetch(proxyUrl1);
        if (!pResp.ok) throw new Error('Proxy 1 HTTP ' + pResp.status);
        var pText = await pResp.text();
        parseAndLoadRawText(pText, displayName + dateLabel);
        statusEl.hidden = true;
        modal.close();
      } catch (err2) {
        try {
          var pResp2 = await fetch(proxyUrl2);
          if (!pResp2.ok) throw new Error('Proxy 2 HTTP ' + pResp2.status);
          var pText2 = await pResp2.text();
          parseAndLoadRawText(pText2, displayName + dateLabel);
          statusEl.hidden = true;
          modal.close();
        } catch (err3) {
          statusEl.innerHTML =
            '<div style="color:var(--danger);margin-bottom:6px;">Browser CORS policy prevented direct automated fetch.</div>' +
            '<div style="font-size:11px;color:var(--fg-muted);margin-bottom:8px;">💡 Tip: Run <code>python3 main.py</code> to fetch stations without CORS restrictions!</div>' +
            '<a href="' + directUrl + '" target="_blank" rel="noopener" class="btn sm primary" style="font-size:11px;">Open IOC Station URL</a>';
        }
      }
    }
  }

  function exportCleanedCSV() {
    if (!state.processed) return;
    var p = state.processed;
    var lines = ['Time_UTC,Raw_Elevation_m,Is_Outlier,Cleaned_Elevation_m,Tolerance_Limit_Lower,Tolerance_Limit_Upper'];
    for (var i = 0; i < p.timestamps.length; i++) {
      var t = p.isoTimes[i];
      var raw = p.rawValues[i] != null ? p.rawValues[i].toFixed(4) : '';
      var outl = p.isOutlier[i] ? '1' : '0';
      var clean = p.cleanedHidden[i] != null ? p.cleanedHidden[i].toFixed(4) : '';
      var low = p.stats.lowerLimit.toFixed(4);
      var upp = p.stats.upperLimit.toFixed(4);
      lines.push([t, raw, outl, clean, low, upp].join(','));
    }

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = state.stationName.replace(/[^a-zA-Z0-9]/g, '_') + '_cleaned_24h.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateSyntheticTidalData() {
    var out = [];
    var now = Math.floor(Date.now() / 1000);
    var startTime = now - 86400;
    for (var t = startTime; t <= now; t += 30) {
      var hrs = (t - startTime) / 3600;
      // Semi-diurnal M2 tide (12.42h period) + diurnal K1 (23.93h period) + seiche
      var tide = 1.89 + 0.05 * Math.sin((2 * Math.PI * hrs) / 12.42) + 0.02 * Math.cos((2 * Math.PI * hrs) / 23.93);
      var noise = (Math.random() - 0.5) * 0.004;
      var d = new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19);
      out.push([d, parseFloat((tide + noise).toFixed(3))]);
    }
    return out;
  }

  document.addEventListener('DOMContentLoaded', init);
})();

