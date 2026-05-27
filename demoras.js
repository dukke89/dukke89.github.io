(function() {
  /* ============================
     DEMORAS - CONFIG
  ============================ */
  const csvUrl = "DEMORAS.csv";
  const DELIM = ";";

  const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
  const GC_CANDIDATES = ["CARACTER DE GC", "CARÁCTER DE GC", "CARACTER GC", "CARACTER_DE_GC", "CARACTER"];
  const MES_CANDIDATES = ["AÑOMES", "AñoMes", "MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];

  const FECHA_CANDIDATES = [
      "FECHA", "Fecha", "FECHA ENTREGA", "Fecha entrega",
      "FECHA ENTREGA ESPERADA", "FECHA ENTREGA OC", "Fecha OC"
  ];

  const AREA_EXPECTED = [
      "PROYECTO",
      "ALMACEN",
      "ALMACÉN",
      "BLEND",
      "EQUIPOS MENORES",
      "COMPRAS",
      "COMPRAS EQUIPOS",
      "COMPRAS AGV"
  ];

  const MOTIVO_EXPECTED = [
      "LIBERACION SOLPED CS",
      "COLOCACION OC CS",
      "LIBERACION OC CS",
      "PLAZO DE ENTREGA EXCEDIDO CS",
      "ENTREGA DEL PROVEEDOR CS",
      "FECHA ENTREGA MUY CERCANA",
      "FECHAENTREGAMUYCERCANA"
  ];

  const MONTH_NAMES = {
      "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL",
      "05": "MAYO", "06": "JUNIO", "07": "JULIO", "08": "AGOSTO",
      "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE"
  };

  /* ============================
     GLOBAL (Isolated inside IIFE)
  ============================ */
  let data = [];
  let headers = [];

  let CLIENT_COL = null;
  let GC_COL = null;
  let MES_COL = null;
  let FECHA_COL = null;
  let AREA_COLS = [];
  let MOTIVO_COLS = [];

  let chartMes = null;
  let chartAreas = null;
  let chartMotivos = null;
  let chartAreasResizeBound = false;
  let chartMesResizeBound = false;
  let chartMotivosResizeBound = false;

  /* ============================
     HELPERS
  ============================ */
  const clean = (v) => (v ?? "")
      .toString()
      .replace(/^\uFEFF/, "")
      .replace(/\s+/g, " ")
      .trim();

  function norm(s) {
      return clean(s)
          .toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
  }

  function getDisplayName(name) {
      const normalized = norm(name);
      if (normalized === norm("CADENA DE SUMINISTRO") || normalized === norm("CADENA DE SUMINISTROS")) {
          return "PROYECTO";
      }
      if (normalized === norm("BLEN")) {
          return "BLEND";
      }
      return name;
  }

  function enforceAllOption(sel) {
      if (!sel) return;
      const allOpt = [...sel.options].find(o => o.value === "__ALL__");
      if (!allOpt) return;

      const selected = [...sel.selectedOptions].map(o => o.value);
      if (selected.includes("__ALL__") && selected.length > 1) {
          [...sel.options].forEach(o => { o.selected = (o.value === "__ALL__"); });
          return;
      }
      if (!selected.length) {
          allOpt.selected = true;
      } else if (!selected.includes("__ALL__")) {
          allOpt.selected = false;
      }
  }

  function getSelValues(id) {
      const sel = document.getElementById(id);
      if (!sel) return [];
      enforceAllOption(sel);
      const vals = [...sel.selectedOptions].map(o => o.value);
      if (!vals.length) return [];
      if (vals.includes("__ALL__")) return [];
      return vals.filter(v => v !== "");
  }

  function selLabel(id) {
      const v = getSelValues(id);
      return v.length ? v.join("-") : "Todos";
  }

  function toNumber(v) {
      let x = clean(v);
      if (!x) return 0;
      x = x.replace(/\s/g, "");
      if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
  }

  function isTruthyAreaValue(v) {
      const t = clean(v);
      if (!t) return false;
      if (t === "0" || t === "0,0" || t === "0.0") return false;
      if (["NO", "FALSE"].includes(norm(t))) return false;
      return true;
  }

  function fmtInt(n) {
      return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtPct01(x) {
      if (!isFinite(x)) return "-";
      return (x * 100).toFixed(1).replace(".", ",") + "%";
  }

  function showError(msg) {
      const el = document.getElementById("dem_msg");
      if (el) el.innerHTML = `<div class="error">${msg}</div>`;
  }

  /* ============================
     DOWNLOAD (CSV filtrado)
  ============================ */
  function escapeCsvCell(v, delimiter = ";") {
      const s = (v ?? "").toString();
      const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
      const out = s.replace(/"/g, '""');
      return mustQuote ? `"${out}"` : out;
  }

  function rowsToCsv(rows, delimiter = ";") {
      const head = headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter);
      const lines = rows.map(r => headers.map(h => escapeCsvCell(r[h], delimiter)).join(delimiter));
      return [head, ...lines].join("\n");
  }

  function downloadFilteredCsv() {
      if (!headers.length || !data.length) return;

      const rows = filteredRowsByClienteYMes();

      const cliente = selLabel("dem_clienteSelect").replace(/[^\w\-]+/g, "_");
      const mes = selLabel("dem_mesSelect").replace(/[^\w\-]+/g, "_");

      const csv = rowsToCsv(rows, DELIM);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `DEMORAS_filtrado_${cliente}_${mes}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
  }

  function monthSortKey(m) {
      if (!m) return new Date(0);

      const ym = m.match(/^(\d{4})-(\d{2})$/);
      if (ym) return new Date(+ym[1], +ym[2] - 1, 1);

      const meses = {
          "enero": 0, "febrero": 1, "marzo": 2, "abril": 3,
          "mayo": 4, "junio": 5, "julio": 6, "agosto": 7,
          "septiembre": 8, "octubre": 9, "noviembre": 10, "diciembre": 11
      };

      const k = norm(m).toLowerCase();
      if (k in meses) return new Date(2000, meses[k], 1);

      return new Date(0);
  }

  /* ============================
     DATE / MONTH
  ============================ */
  function parseDateAny(s) {
      const t = clean(s);
      if (!t) return null;

      let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

      m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

      return null;
  }

  function monthKey(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthKeyFromRow(r) {
      if (MES_COL) {
          const m = clean(r[MES_COL]);
          return m || null;
      }
      if (FECHA_COL) {
          const d = parseDateAny(r[FECHA_COL]);
          return d ? monthKey(d) : null;
      }
      return null;
  }

  /* ============================
     CSV PARSER (quotes safe)
  ============================ */
  function parseDelimited(text, delimiter = ";") {
      const rows = [];
      let row = [];
      let cur = "";
      let inQuotes = false;

      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      for (let i = 0; i < text.length; i++) {
          const ch = text[i];

          if (ch === '"') {
              if (inQuotes && text[i + 1] === '"') {
                  cur += '"';
                  i++;
              } else {
                  inQuotes = !inQuotes;
              }
          } else if (ch === delimiter && !inQuotes) {
              row.push(cur);
              cur = "";
          } else if (ch === "\n" && !inQuotes) {
              row.push(cur);
              rows.push(row);
              row = [];
              cur = "";
          } else {
              cur += ch;
          }
      }

      if (cur || row.length) {
          row.push(cur);
          rows.push(row);
      }

      return rows;
  }

  /* ============================
     DETECT COLUMNS
  ============================ */
  function detectColumns() {
      const hNorm = headers.map(norm);
      const findCol = (cands) => {
          for (const c of cands) {
              const idx = hNorm.indexOf(norm(c));
              if (idx >= 0) return headers[idx];
          }
          return null;
      };

      CLIENT_COL = findCol(CLIENT_CANDIDATES);
      GC_COL = findCol(GC_CANDIDATES);
      MES_COL = findCol(MES_CANDIDATES);
      FECHA_COL = findCol(FECHA_CANDIDATES);

      const expectedNorm = new Set(AREA_EXPECTED.map(norm));
      const found = [];

      for (const h of headers) {
          const hn = norm(h);
          if (expectedNorm.has(hn)) found.push(h);
      }

      AREA_COLS = found.filter(c => norm(c) !== "TOTAL");

      if (!AREA_COLS.length) {
          const keys = ["COMPRAS", "ALMACEN", "PROYECTO", "EQUIPOS", "BLEND", "AGV"];
          AREA_COLS = headers.filter(h => keys.some(k => norm(h).includes(k)));
      }

      const motExpected = new Set(MOTIVO_EXPECTED.map(norm));
      const motFound = [];
      for (const h of headers) {
          const hn = norm(h);
          if (motExpected.has(hn)) motFound.push(h);
      }
      if (!motFound.length) {
          const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL, ...AREA_COLS].filter(Boolean).map(norm));
          MOTIVO_COLS = headers.filter(h => {
              const hn = norm(h);
              if (exclude.has(hn)) return false;
              return hn.includes(" CS") || hn.endsWith("CS") || hn.includes("OBRA") || hn.includes("CERCANA");
          });
      } else {
          MOTIVO_COLS = motFound;
      }
  }

  /* ============================
     FILTERS
  ============================ */
  function filteredRows() {
      let rows = data;

      const cs = getSelValues("dem_clienteSelect");
      if (cs.length && CLIENT_COL) {
          const set = new Set(cs);
          rows = rows.filter(r => set.has(clean(r[CLIENT_COL])));
      }

      const gcs = getCheckedClasif();
      if (gcs.length && GC_COL) {
          const set = new Set(gcs);
          rows = rows.filter(r => set.has(norm(r[GC_COL])));
      }

      return rows;
  }

  function filteredRowsByClienteYMes() {
      const rows = filteredRows();
      const ms = getSelValues("dem_mesSelect");
      if (!ms.length) return rows;
      const set = new Set(ms);
      return rows.filter(r => set.has(getMonthKeyFromRow(r)));
  }

  /* ============================
     SELECTS
  ============================ */
  function renderClientes() {
      const sel = document.getElementById("dem_clienteSelect");
      if (!sel) return;

      if (!sel.querySelector("option[value='__ALL__']")) {
          const optAll = document.createElement("option");
          optAll.value = "__ALL__";
          optAll.textContent = "Todos";
          sel.appendChild(optAll);
      }

      const prevSet = new Set([...sel.selectedOptions].map(o => o.value));
      sel.querySelectorAll("option:not([value='__ALL__'])").forEach(o => o.remove());

      if (!CLIENT_COL) return;

      const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "es"));

      for (const c of clientes) {
          const o = document.createElement("option");
          o.value = c;
          o.textContent = c;
          if (prevSet.has(c)) o.selected = true;
          sel.appendChild(o);
      }

      enforceAllOption(sel);
  }

  function renderGC() {
      const container = document.getElementById("dem_clasifList");
      if (!container) return;

      if (!GC_COL) return;

      const prevChecked = new Set(
          [...container.querySelectorAll("input[type='checkbox']:not(.check-all-cb):checked")]
              .map(cb => cb.value)
      );
      const allWasChecked = (() => {
          const allCb = container.querySelector(".check-all-cb");
          return !allCb || allCb.checked;
      })();

      container.innerHTML = "";

      const gcs = [...new Set(data.map(r => norm(r[GC_COL])).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "es"));

      const allLabel = document.createElement("label");
      allLabel.className = "check-all";
      const allCb = document.createElement("input");
      allCb.type = "checkbox";
      allCb.className = "check-all-cb";
      allCb.checked = prevChecked.size === 0 && allWasChecked;
      allLabel.appendChild(allCb);
      allLabel.appendChild(document.createTextNode(" Todos"));
      container.appendChild(allLabel);

      for (const g of gcs) {
          const lbl = document.createElement("label");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = g;
          cb.checked = (prevChecked.size === 0 && allWasChecked) || prevChecked.has(g);
          lbl.appendChild(cb);
          lbl.appendChild(document.createTextNode(" " + g));
          container.appendChild(lbl);
      }

      allCb.addEventListener("change", () => {
          const itemCbs = [...container.querySelectorAll("input[type='checkbox']:not(.check-all-cb)")];
          itemCbs.forEach(c => c.checked = allCb.checked);
          applyAll();
      });

      container.querySelectorAll("input[type='checkbox']:not(.check-all-cb)").forEach(cb => {
          cb.addEventListener("change", () => {
              const items = [...container.querySelectorAll("input[type='checkbox']:not(.check-all-cb)")];
              allCb.checked = items.every(c => c.checked);
              applyAll();
          });
      });

      const hint = document.getElementById("dem_clasifHint");
      if (hint) hint.textContent = `Columna: ${GC_COL}`;
  }

  function getCheckedClasif() {
      const container = document.getElementById("dem_clasifList");
      if (!container) return [];
      const allCb = container.querySelector(".check-all-cb");
      if (allCb && allCb.checked) return [];
      const checked = [...container.querySelectorAll("input[type='checkbox']:not(.check-all-cb):checked")]
          .map(cb => cb.value);
      return checked;
  }

  function buildMesSelect(rows) {
      const sel = document.getElementById("dem_mesSelect");
      if (!sel) return [];

      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

      sel.innerHTML = "";

      const oAll = document.createElement("option");
      oAll.value = "__ALL__";
      oAll.textContent = "Todos";
      sel.appendChild(oAll);

      for (const m of months) {
          const o = document.createElement("option");
          o.value = m;

          let displayText = m;
          const parts = m.split("-");
          if (parts.length === 2) {
              const [year, monthNum] = parts;
              const name = MONTH_NAMES[monthNum];
              if (name) displayText = `${name} ${year}`;
          }

          o.textContent = displayText;
          if (prevSet.has(m)) o.selected = true;
          sel.appendChild(o);
      }

      const hasPrevValid = [...prevSet].some(v => v && v !== "__ALL__" && months.includes(v));
      if (!hasPrevValid) {
          const allOpt = sel.querySelector("option[value='__ALL__']");
          if (allOpt) allOpt.selected = true;
      }

      enforceAllOption(sel);
      return months;
  }

  /* ============================
     AGG CALCS
  ============================ */
  function countDemoras(rows) {
      return rows.length;
  }

  function aggByMonth(rows) {
      const m = new Map();

      for (const r of rows) {
          const mk = getMonthKeyFromRow(r);
          if (!mk) continue;
          m.set(mk, (m.get(mk) || 0) + 1);
      }
      const months = [...m.keys()].sort((a, b) => monthSortKey(a) - monthSortKey(b));
      const counts = months.map(k => m.get(k) || 0);
      return { months, counts };
  }

  function aggAreas(rows) {
      const out = new Map();

      for (const a of AREA_COLS) {
          out.set(a, 0);
      }

      for (const r of rows) {
          for (const [a, currentVal] of out.entries()) {
              if (isTruthyAreaValue(r[a])) out.set(a, currentVal + 1);
          }
      }
      return out;
  }

  function topArea(areaMap) {
      let best = null;
      let bestVal = -1;
      let total = 0;

      for (const [k, v] of areaMap.entries()) {
          total += v;
          if (v > bestVal) { bestVal = v; best = k; }
      }
      return { best, bestVal, total };
  }

  /* ============================
     KPIs UI
  ============================ */
  function updateKPIs() {
      const rowsMes = filteredRowsByClienteYMes();
      const dem = countDemoras(rowsMes);

      document.getElementById("dem_kpiDemorasMes").textContent = fmtInt(dem);

      const areaMap = aggAreas(rowsMes);
      const t = topArea(areaMap);

      if (!t.best || dem === 0) {
          document.getElementById("dem_kpiTopArea").textContent = "-";
          document.getElementById("dem_kpiTopAreaSub").textContent = "-";
          document.getElementById("dem_kpiTopPct").textContent = "-";
          return;
      }

      const pct = t.total ? (t.bestVal / t.total) : NaN;

      document.getElementById("dem_kpiTopArea").textContent = t.best;
      document.getElementById("dem_kpiTopAreaSub").textContent = `Cant: ${fmtInt(t.bestVal)}`;
      document.getElementById("dem_kpiTopPct").textContent = fmtPct01(pct);
  }

  /* ============================
     CHART DEFAULTS
  ============================ */
  function applyChartDefaults() {
      Chart.register(ChartDataLabels);

      Chart.defaults.color = "#0b1220";
      Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
      Chart.defaults.font.weight = "800";

      Chart.defaults.interaction.mode = "index";
      Chart.defaults.interaction.intersect = false;

      Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.97)";
      Chart.defaults.plugins.tooltip.titleColor = "#0b1220";
      Chart.defaults.plugins.tooltip.bodyColor = "#0b1220";
      Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.18)";
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.padding = 10;
  }

  /* ============================
     CHARTS
  ============================ */
  function buildChartMes() {
      const el = document.getElementById("dem_chartMes");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRows();
      let months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      if (!months.length || !AREA_COLS.length) {
          if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
          el.innerHTML = "<div class='hint'>Sin datos para graficar.</div>";
          return;
      }

      const montlyTotals = new Map();
      const maxByMonth = new Map();

      months.forEach(m => {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          let sum = 0;
          let maxVal = -1;
          let maxArea = "";
          const mp = aggAreas(rowsM);

          for (const [area, v] of mp.entries()) {
              sum += v;
              if (v > maxVal) {
                  maxVal = v;
                  maxArea = area;
              }
          }
          montlyTotals.set(m, sum);
          maxByMonth.set(m, { val: maxVal, area: maxArea });
      });

      const basePalette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const sortedNames = [...AREA_COLS].sort();
      const colorMap = new Map();
      sortedNames.forEach((name, i) => {
          colorMap.set(name, basePalette[i % basePalette.length]);
      });

      const visibleAreas = AREA_COLS.filter(area => {
          const na = norm(area);
          if (na === norm("EQUIPOS MENORES")) return false;
          return true;
      });

      const seriesBars = visibleAreas.map((areaName) => ({
          name: getDisplayName(areaName),
          type: "bar",
          itemStyle: {
              color: colorMap.get(areaName)
          },
          barGap: '10%',
          barCategoryGap: '30%',
          data: months.map(m => {
              const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
              const mp = aggAreas(rowsM);
              const val = mp.get(areaName) || 0;

              const monMax = maxByMonth.get(m);
              const isMax = (monMax && monMax.area === areaName && val > 0);

              const areaColor = colorMap.get(areaName);

              return {
                  value: val,
                  month: m,
                  isMax: isMax,
                  area: areaName,
                  itemStyle: {
                      color: isMax ? "#dc3545" : areaColor
                  }
              };
          }),
          label: {
              show: true,
              rotate: 90,
              align: 'left',
              verticalAlign: 'middle',
              position: 'insideBottom',
              distance: 12,
              formatter: (params) => {
                  const v = params.value;
                  if (!v) return "";
                  const d = params.data;
                  const total = montlyTotals.get(d.month) || 0;
                  const pct = total ? ((v / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';

                  if (d.isMax) {
                      return `{max|${v} - ${pct} - ${getDisplayName(params.seriesName)}}`;
                  }
                  return ` {norm|${v} - ${pct} - ${getDisplayName(params.seriesName)}} `;
              },
              rich: {
                  max: {
                      color: '#fff',
                      backgroundColor: '#dc3545',
                      padding: [4, 6],
                      borderRadius: 4,
                      fontWeight: 800,
                      fontSize: 11,
                      shadowBlur: 2,
                      shadowColor: 'rgba(0,0,0,0.3)'
                  },
                  norm: {
                      color: '#000',
                      backgroundColor: 'rgba(255,255,255, 0.85)',
                      padding: [3, 4],
                      borderRadius: 3,
                      fontWeight: 700,
                      fontSize: 10,
                      borderColor: 'rgba(0,0,0,0.1)',
                      borderWidth: 1
                  }
              }
          }
      }));

      if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
      chartMes = echarts.init(el, null, { renderer: "canvas" });

      const option = {
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const m = p.data.month;
                  const total = montlyTotals.get(m) || 0;
                  const pct = total ? ((p.value / total) * 100).toFixed(1) + '%' : '-';
                  return `<b>${p.seriesName}</b><br/>
                  Mes: ${m}<br/>
                  Cantidad: <b>${p.value}</b> (${pct})`;
              }
          },
          legend: { bottom: 0, type: "scroll", textStyle: { fontWeight: 600 } },
          grid: {
              left: 50, right: 30, top: 30, bottom: 85,
              containLabel: true
          },
          dataZoom: [
              {
                  type: 'slider',
                  show: true,
                  xAxisIndex: 0,
                  startValue: 0,
                  endValue: 4,
                  bottom: 40,
                  height: 22,
                  zoomLock: true,
                  brushSelect: false
              },
              {
                  type: 'inside',
                  xAxisIndex: 0,
                  zoomOnMouseWheel: false,
                  moveOnMouseWheel: true
              }
          ],
          xAxis: {
              type: "category",
              data: months,
              axisLabel: { fontWeight: 700, interval: 0 },
              axisTick: { alignWithLabel: true }
          },
          yAxis: { type: "value", splitLine: { lineStyle: { type: 'dashed' } } },
          series: seriesBars
      };

      chartMes.setOption(option, true);

      if (!chartMesResizeBound) {
          chartMesResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartMes) chartMes.resize();
          }, { passive: true });
      }
  }

  function buildChartAreas() {
      const el = document.getElementById("dem_chartAreas");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRowsByClienteYMes();
      const areaMap = aggAreas(rows);

      const items = [];
      for (const [k, v] of areaMap.entries()) {
          if (!v) continue;
          items.push({ name: k, value: v });
      }

      if (!items.length) {
          if (chartAreas && typeof chartAreas.dispose === "function") {
              chartAreas.dispose();
              chartAreas = null;
          }
          el.innerHTML = "<div class='hint'>Sin datos para el mes seleccionado.</div>";
          return;
      }

      if (chartAreas && typeof chartAreas.dispose === "function") chartAreas.dispose();
      chartAreas = echarts.init(el, null, { renderer: "canvas" });

      const maxVal = Math.max(...items.map(d => d.value));
      const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;

      const palette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const stableNames = [...items.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
      const colorByName = new Map();
      stableNames.forEach((name, i) => colorByName.set(name, palette[i % palette.length]));

      const dataWithColors = items.map((it) => {
          const isMax = it.value === maxVal;
          const baseColor = colorByName.get(it.name) || "#6c757d";
          return {
              ...it,
              itemStyle: {
                  color: isMax ? "#dc3545" : baseColor,
                  borderWidth: isMax ? 4 : 2,
                  shadowBlur: isMax ? 14 : 0,
                  shadowColor: isMax ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0)"
              }
          };
      });

      const option = {
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const pct = (p.value / total) * 100;
                  return `${getDisplayName(p.name)}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
              }
          },
          legend: {
              orient: "vertical",
              right: 10,
              top: "middle",
              itemWidth: 18,
              itemHeight: 10,
              formatter: (name) => {
                  const it = items.find(x => x.name === name);
                  const v = it ? it.value : 0;
                  const pct = (v / total) * 100;
                  return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
              }
          },
          series: [
              {
                  name: "% demoras por área",
                  type: "pie",
                  radius: ["40%", "72%"],
                  center: ["40%", "50%"],
                  avoidLabelOverlap: true,
                  itemStyle: {
                      borderColor: "#fff",
                      borderWidth: 2
                  },
                  label: {
                      show: true,
                      position: "outside",
                      fontSize: 12,
                      fontWeight: "bold",
                      formatter: (p) => `${getDisplayName(p.name)}\n${p.value} (${p.percent.toFixed(1).replace(".", ",")}%)`
                  },
                  labelLine: {
                      length: 12,
                      length2: 8,
                      smooth: true
                  },
                  data: dataWithColors
              }
          ]
      };

      chartAreas.setOption(option, true);

      if (!chartAreasResizeBound) {
          chartAreasResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartAreas) chartAreas.resize();
          }, { passive: true });
      }
  }

  function aggMotivosProyecto(rows) {
      const out = new Map();
      for (const m of MOTIVO_COLS) {
          out.set(m, 0);
      }

      for (const r of rows) {
          for (const m of MOTIVO_COLS) {
              if (isTruthyAreaValue(r[m])) out.set(m, (out.get(m) || 0) + 1);
          }
      }
      return out;
  }

  function buildChartMotivos() {
      const el = document.getElementById("dem_chartMotivos");
      if (!el || typeof echarts === "undefined") return;

      const rows = filteredRowsByClienteYMes();
      const sumsMap = aggMotivosProyecto(rows);

      const sums = [];
      for (const [k, v] of sumsMap.entries()) {
          if (!v) continue;
          sums.push({ name: k, value: v });
      }

      if (!sums.length) {
          if (chartMotivos && typeof chartMotivos.dispose === "function") {
              chartMotivos.dispose();
              chartMotivos = null;
          }
          el.innerHTML = "<div class='hint'>Sin datos para el mes seleccionado en la subcategoría Proyecto.</div>";
          return;
      }

      if (chartMotivos && typeof chartMotivos.dispose === "function") chartMotivos.dispose();
      chartMotivos = echarts.init(el, null, { renderer: "canvas" });

      const total = sums.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;
      const maxVal = Math.max(...sums.map(d => d.value));

      const palette = [
          "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14", "#198754", "#0dcaf0", "#6c757d"
      ];

      const stableNames = [...sums.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
      const colorByName = new Map();
      stableNames.forEach((name, i) => colorByName.set(name, palette[i % palette.length]));

      const dataPie = sums.map((it) => {
          const isMax = it.value === maxVal;
          const baseColor = colorByName.get(it.name) || "#6c757d";
          return {
              ...it,
              itemStyle: {
                  color: isMax ? "#dc3545" : baseColor,
                  borderWidth: isMax ? 4 : 2,
                  shadowBlur: isMax ? 14 : 0,
                  shadowColor: isMax ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0)"
              }
          };
      });

      chartMotivos.setOption({
          tooltip: {
              trigger: "item",
              formatter: (p) => {
                  const pct = (p.value / total) * 100;
                  return `${getDisplayName(p.name)}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
              }
          },
          legend: {
              orient: "vertical",
              right: 10,
              top: "middle",
              itemWidth: 18,
              itemHeight: 10,
              formatter: (name) => {
                  const it = sums.find(x => x.name === name);
                  const v = it ? it.value : 0;
                  const pct = (v / total) * 100;
                  return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
              },
              textStyle: { fontSize: 12 }
          },
          series: [{
              name: "Demoras proyecto",
              type: "pie",
              radius: ["60%", "86%"],
              center: ["40%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: {
                  borderColor: "#ffffff",
                  borderWidth: 2
              },
              emphasis: {
                  scale: true,
                  scaleSize: 10,
                  itemStyle: {
                      shadowBlur: 18,
                      shadowColor: "rgba(0,0,0,0.35)"
                  }
              },
              label: {
                  show: true,
                  backgroundColor: "rgba(255,255,255,0.85)",
                  borderRadius: 4,
                  padding: [4, 6],
                  fontSize: 13,
                  fontWeight: "bold",
                  color: "#0b1220",
                  formatter: (p) =>
                      `${getDisplayName(p.name)}\n${fmtInt(p.value)} (${String(p.percent).replace(".", ",")}%)`
              },
              labelLine: {
                  length: 16,
                  length2: 10,
                  smooth: true
              },
              data: dataPie
          }]
      }, true);

      chartMotivos.on('legendselectchanged', (params) => {
          const selected = params.selected;
          let vTotal = 0;
          sums.forEach(s => {
              if (selected[s.name] !== false) vTotal += s.value;
          });

          chartMotivos.setOption({
              legend: {
                  formatter: (name) => {
                      const it = sums.find(x => x.name === name);
                      const v = it ? it.value : 0;
                      const pct = vTotal > 0 ? (v / vTotal) * 100 : 0;
                      return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
                  }
              }
          });
      });
      chartMotivos.resize();

      if (!chartMotivosResizeBound) {
          chartMotivosResizeBound = true;
          window.addEventListener("resize", () => {
              if (chartMotivos) chartMotivos.resize();
          }, { passive: true });
      }
  }

  function applyHeatmapPorFilaGeneric(tbl) {
      const trs = Array.from(tbl.querySelectorAll("tbody tr"));
      trs.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll("td.td-num"));
          const vals = cells.map(td => Number(td.dataset.v ?? 0));
          if (!vals.length) return;
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const range = max - min;
          cells.forEach((td, i) => {
              const v = vals[i];
              const t = range === 0 ? 0 : (v - min) / range;
              td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");
              td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
              td.style.fontWeight = t >= 0.85 ? "800" : "600";
          });
      });
  }

  /* ============================
     TABLE
  ============================ */
  function buildTabla() {
      const rows = filteredRows();
      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const thead = document.querySelector("#dem_tablaAreas thead");
      const tbody = document.querySelector("#dem_tablaAreas tbody");
      if (!thead || !tbody) return;

      const visibleAreas = AREA_COLS.filter(area => {
          const na = norm(area);
          if (na === norm("EQUIPOS MENORES")) return false;
          return true;
      });
      const cols = ["Mes", ...visibleAreas.map(getDisplayName)];
      thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

      const lines = [];
      for (const m of months) {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          const areaMap = aggAreas(rowsM);

          const tds = [
              `<td class="td-strong">${m}</td>`,
              ...visibleAreas.map(a => {
                  const v = areaMap.get(a) || 0;
                  return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
              })
          ];
          lines.push(`<tr>${tds.join("")}</tr>`);
      }

      tbody.innerHTML = lines.join("");
      applyHeatmapPorFila();
  }

  function buildTablaMotivos() {
      const rows = filteredRows();
      const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
          .sort((a, b) => monthSortKey(a) - monthSortKey(b));

      const thead = document.querySelector("#dem_tablaMotivos thead");
      const tbody = document.querySelector("#dem_tablaMotivos tbody");
      if (!thead || !tbody) return;

      const cols = ["Mes", ...MOTIVO_COLS.map(getDisplayName)];
      thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

      const lines = [];
      for (const m of months) {
          const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
          const sumsMap = aggMotivosProyecto(rowsM);

          const tds = [
              `<td class="td-strong">${m}</td>`,
              ...MOTIVO_COLS.map(a => {
                  const v = sumsMap.get(a) || 0;
                  return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
              })
          ];
          lines.push(`<tr>${tds.join("")}</tr>`);
      }

      tbody.innerHTML = lines.join("");
      const tbl = document.getElementById("dem_tablaMotivos");
      if (tbl) applyHeatmapPorFilaGeneric(tbl);
  }

  /* ============================
     APPLY ALL
  ============================ */
  function applyAll() {
      const rows = filteredRows();
      buildMesSelect(rows);

      updateKPIs();
      buildChartMes();
      buildChartAreas();
      buildChartMotivos();
      buildTablaMotivos();
      buildTabla();
  }

  /* ============================
     EXPOSE DEFERRED INITIALIZATION LIFE CYCLE HOOK
  =========================== */
  window.initDemoras = function() {
      if (window.demorasInitialized) return;
      window.demorasInitialized = true;

      applyChartDefaults();

      const _lu = (window.LAST_UPDATE || "").toString().trim();
      const _elLU = document.getElementById("lastUpdate");
      if (_elLU) _elLU.textContent = _lu || "--/--/----";

      // fetchWithCache optimized
      fetchWithCache(csvUrl + "?t=" + window.CACHE_BUSTER)
          .then(text => {
              const m = parseDelimited(text, DELIM);
              if (!m.length || m.length < 2) {
                  showError("El CSV está vacío o no tiene filas.");
                  return;
              }

              headers = m[0].map(clean);
              detectColumns();

              if (!CLIENT_COL) {
                  showError("No encontré columna CLIENTE/OBRA/ALMACÉN. Probé: " + CLIENT_CANDIDATES.join(" / "));
                  return;
              }

              if (!MES_COL && !FECHA_COL) {
                  showError(
                      "No encontré MES ni FECHA para armar el eje temporal."
                  );
                  return;
              }

              if (!AREA_COLS.length) {
                  showError("No pude detectar columnas de ÁREA.");
                  return;
              }

              data = m.slice(1).map(row => {
                  const o = {};
                  headers.forEach((h, i) => (o[h] = clean(row[i])));
                  return o;
              });

              document.getElementById("dem_clienteHint").textContent = `Columna cliente: ${CLIENT_COL}`;

              renderClientes();
              renderGC();
              applyAll();

              document.getElementById("dem_btnDownloadFiltrado")?.addEventListener("click", downloadFilteredCsv);
              
              document.getElementById("dem_clienteSelect")?.addEventListener("change", (e) => { 
                enforceAllOption(e.target); 
                applyAll(); 
              });

              document.getElementById("dem_mesSelect")?.addEventListener("change", (e) => {
                  enforceAllOption(e.target);
                  updateKPIs();
                  buildChartAreas();
                  buildChartMotivos();
              });
          })
          .catch(err => {
              console.error(err);
              showError("Error cargando CSV: " + err.message);
          });
  };

  /* =========================================================
     HEATMAP (POR FILA / POR MES) — blanco → naranja → rojo
   ========================================================= */
  function lerp(a, b, t) {
      return a + (b - a) * t;
  }

  function mixRGB(c1, c2, t) {
      const r = Math.round(lerp(c1[0], c2[0], t));
      const g = Math.round(lerp(c1[1], c2[1], t));
      const b = Math.round(lerp(c1[2], c2[2], t));
      return `rgb(${r},${g},${b})`;
  }

  function heatColorWhiteOrangeRed(t) {
      t = Math.max(0, Math.min(1, t));

      const WHITE = [255, 255, 255];
      const ORANGE = [255, 165, 0];
      const RED = [220, 53, 69];

      if (t <= 0.5) {
          return mixRGB(WHITE, ORANGE, t / 0.5);
      }
      return mixRGB(ORANGE, RED, (t - 0.5) / 0.5);
  }

  function applyHeatmapPorFila() {
      const trs = document.querySelectorAll("#dem_tablaAreas tbody tr");

      trs.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll("td.td-num"));
          const vals = cells.map(td => Number(td.dataset.v ?? 0));
          if (!vals.length) return;

          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const range = max - min;

          cells.forEach((td, i) => {
              const v = vals[i];
              const t = range === 0 ? 0 : (v - min) / range;

              td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");
              td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
              td.style.fontWeight = t >= 0.85 ? "800" : "600";
          });
      });
  }

})();
