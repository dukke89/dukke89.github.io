/* ============================
   DEMORAS - CONFIG
============================ */
const csvUrl = "DEMORAS.csv";   // OJO: nombre EXACTO del repo
const DELIM = ";";

// candidatos para detectar columnas
const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
const MES_CANDIDATES = ["MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];
const FECHA_CANDIDATES = [
  "FECHA", "Fecha", "FECHA ENTREGA", "Fecha entrega",
  "FECHA ENTREGA ESPERADA", "FECHA ENTREGA OC", "Fecha OC"
];

// áreas “esperadas” (las que me pasaste)
const AREA_EXPECTED = [
  "CADENA DE SUMINISTRO",
  "ALMACEN",
  "ALMACÉN",
  "BLEN",
  "EQUIPOS MENORES",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS AGV",
  "TOTAL"
];

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];

let chartMes = null;
let chartAreas = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function norm(s) {
  return clean(s)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin acentos
    .replace(/\s+/g, " ")
    .trim();
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
  if (t === "0") return false;
  // si viene "X" o "SI" o "1" o "2" etc.
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
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}


function monthSortKey(m) {
  if (!m) return new Date(0);

  // formato yyyy-mm
  const ym = m.match(/^(\d{4})-(\d{2})$/);
  if (ym) return new Date(+ym[1], +ym[2] - 1, 1);

  // nombres de meses en español
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

  // dd/mm/yyyy o dd-mm-yyyy
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  // yyyy-mm-dd
  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeyFromRow(r) {
  // 1) si hay MES explícito
  if (MES_COL) {
    const m = clean(r[MES_COL]);
    // admite "2025-11" o "noviembre" etc → si no es yyyy-mm lo dejamos como texto
    return m || null;
  }
  // 2) si hay FECHA
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
  MES_COL = findCol(MES_CANDIDATES);
  FECHA_COL = findCol(FECHA_CANDIDATES);

  // áreas: 1) por lista esperada 2) si no, por heurística
  const expectedNorm = new Set(AREA_EXPECTED.map(norm));
  const found = [];

  for (const h of headers) {
    const hn = norm(h);
    if (expectedNorm.has(hn)) found.push(h);
  }

  // sacamos TOTAL si existe (no la queremos como área en gráficos)
  AREA_COLS = found.filter(c => norm(c) !== "TOTAL");

  // si no encontró nada, fallback: buscar columnas que contengan palabras clave típicas
  if (!AREA_COLS.length) {
    const keys = ["COMPRAS", "ALMACEN", "CADENA", "EQUIPOS", "BLEN", "AGV", "PROYECTO"];
    AREA_COLS = headers.filter(h => keys.some(k => norm(h).includes(k)));
  }
}

/* ============================
   FILTERS
============================ */
function filteredRows() {
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  if (!c || !CLIENT_COL) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function filteredRowsByClienteYMes() {
  const rows = filteredRows();
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return rows;
  return rows.filter(r => getMonthKeyFromRow(r) === mes);
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  if (!CLIENT_COL) return;

  const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
    .sort((a,b) => monthSortKey(a) - monthSortKey(b));

  const prev = sel.value;

  sel.innerHTML = "";
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  sel.value = months.includes(prev) ? prev : (months[months.length - 1] || "");

  const hint = document.getElementById("mesHint");
  if (hint) hint.textContent = sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses";

  return months;
}

/* ============================
   AGG CALCS
============================ */
function countDemoras(rows) {
  // 1 fila = 1 pedido con demora
  return rows.length;
}

function aggByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    if (!mk) continue;
    m.set(mk, (m.get(mk) || 0) + 1);
  }
  const months = [...m.keys()].sort((a,b) => monthSortKey(a) - monthSortKey(b));
  const counts = months.map(k => m.get(k) || 0);
  return { months, counts };
}

function aggAreas(rows) {
  const out = new Map();
  for (const a of AREA_COLS) out.set(a, 0);

  for (const r of rows) {
    for (const a of AREA_COLS) {
      if (isTruthyAreaValue(r[a])) out.set(a, (out.get(a) || 0) + 1);
    }
  }
  return out;
}

function topArea(areaMap) {
  let best = null;
  let bestVal = -1;
  let total = 0;

  for (const [k,v] of areaMap.entries()) {
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

  document.getElementById("kpiDemorasMes").textContent = fmtInt(dem);

  const areaMap = aggAreas(rowsMes);
  const t = topArea(areaMap);

  if (!t.best || dem === 0) {
    document.getElementById("kpiTopArea").textContent = "-";
    document.getElementById("kpiTopAreaSub").textContent = "-";
    document.getElementById("kpiTopPct").textContent = "-";
    return;
  }

  // share sobre total de marcas de área
  const pct = t.total ? (t.bestVal / t.total) : NaN;

  document.getElementById("kpiTopArea").textContent = t.best;
  document.getElementById("kpiTopAreaSub").textContent = `Cant: ${fmtInt(t.bestVal)}`;
  document.getElementById("kpiTopPct").textContent = fmtPct01(pct);
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
  const rows = filteredRows();
  const { months, counts } = aggByMonth(rows);

  const el = document.getElementById("chartMes");
  if (!el) return;

  if (!months.length) {
    if (window.echarts) {
      const inst = echarts.getInstanceByDom(el);
      if (inst) inst.dispose();
    }
    el.innerHTML = "<div class='muted' style='padding:12px;'>Sin datos para el período.</div>";
    return;
  }

  const chart = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: "canvas" });

  const option = {
    grid: { left: 55, right: 25, top: 25, bottom: 55 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (params) => {
        const bar = params.find(p => p.seriesType === "bar");
        const line = params.find(p => p.seriesType === "line");
        const m = bar ? bar.axisValue : (line ? line.axisValue : "");
        const v = bar ? bar.data : (line ? line.data : 0);
        return `<b>${m}</b><br/>Demoras: <b>${fmtInt(v)}</b>`;
      }
    },
    xAxis: {
      type: "category",
      data: months,
      axisLabel: { rotate: 30, fontWeight: 700 },
      axisTick: { alignWithLabel: true }
    },
    yAxis: {
      type: "value",
      min: 0,
      splitLine: { lineStyle: { color: "rgba(0,0,0,0.08)" } }
    },
    series: [
      {
        name: "Demoras",
        type: "bar",
        data: counts,
        barMaxWidth: 46,
        itemStyle: { borderRadius: [10, 10, 0, 0], opacity: 0.85 },
        label: {
          show: true,
          position: "top",
          fontWeight: 800,
          formatter: (p) => fmtInt(p.value)
        },
        emphasis: { focus: "series" }
      },
      {
        name: "Tendencia",
        type: "line",
        data: counts,
        smooth: false,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 3 },
        itemStyle: { },
        z: 5
      }
    ],
    legend: { top: 0, left: "center" }
  };

  chart.setOption(option, true);
  window.addEventListener("resize", () => chart.resize(), { passive: true });
}


function buildChartAreas() {
  const rows = filteredRowsByClienteYMes();
  const areaMap = aggAreas(rows);

  const labels = [];
  const values = [];

  for (const [k,v] of areaMap.entries()) {
    if (!v) continue;
    labels.push(k);
    values.push(v);
  }

  const canvas = document.getElementById("chartAreas");
  if (!canvas) return;

  if (chartAreas) chartAreas.destroy();

  chartAreas = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
          data: values,
          // ✅ mayor porcentaje en rojo
          backgroundColor: values.map(v => v === Math.max(...values) ? "#dc3545" : "rgba(11,90,70,.35)")
        }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            // ✅ leyenda: "ÁREA - xx,x%"
            generateLabels: (chart) => {
              const data = chart.data;
              const ds = data.datasets[0];
              const values = (ds.data || []).map(v => Number(v) || 0);
              const total = values.reduce((a,b)=>a+b,0) || 0;

              return data.labels.map((label, i) => {
                const v = values[i] || 0;
                const pct = total ? (v / total * 100) : 0;
                const meta = chart.getDatasetMeta(0);
                const style = meta.controller.getStyle(i);

                return {
                  text: `${label} - ${pct.toFixed(1).replace(".", ",")}%`,
                  fillStyle: style.backgroundColor,
                  strokeStyle: style.borderColor,
                  lineWidth: style.borderWidth,
                  hidden: !chart.getDataVisibility(i),
                  index: i
                };
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.label}: ${fmtInt(c.parsed)}`
          }
        },
        datalabels: {
          formatter: (v, ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
            if (!total) return "";
            const pct = (v / total) * 100;
            return `${fmtInt(v)} (${pct.toFixed(1).replace(".", ",")}%)`;
          },
          anchor: "end",
          align: "end",
          offset: 10
        }
      }
    }
  });
}

/* ============================
   TABLE
============================ */
function buildTabla() {
  const rows = filteredRows();
  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
  .sort((a,b) => monthSortKey(a) - monthSortKey(b));

  const thead = document.querySelector("#tablaAreas thead");
  const tbody = document.querySelector("#tablaAreas tbody");
  if (!thead || !tbody) return;

  // header
  const cols = ["Mes", "ALMACEN", ...AREA_COLS];
  thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

  // body
  const lines = [];
  for (const m of months) {
    const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
    const areaMap = aggAreas(rowsM);

    const tds = [
      `<td class="td-strong">${m}</td>`,
      `<td class="td-strong">${(document.getElementById("selCliente")?.value || "Todos")}</td>`,
      ...AREA_COLS.map(a => {
        const v = areaMap.get(a) || 0;
        return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
      })
    ];
    lines.push(`<tr>${tds.join("")}</tr>`);
  }

  tbody.innerHTML = lines.join("");
  applyHeatmapPorFila(); // ✅ se aplica al final, cuando la tabla ya existe
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
  buildTabla();
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  applyChartDefaults();

  // fecha “hoy” en header
  const d = new Date();
  document.getElementById("lastUpdate").textContent =
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  fetch(csvUrl)
    .then(r => {
      if (!r.ok) throw new Error(`No pude abrir ${csvUrl} (HTTP ${r.status})`);
      return r.text();
    })
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

      // MES_COL o FECHA_COL (al menos uno)
      if (!MES_COL && !FECHA_COL) {
        showError(
          "No encontré MES ni FECHA para armar el eje temporal. Probé MES: " +
          MES_CANDIDATES.join(" / ") + " | FECHA: " + FECHA_CANDIDATES.join(" / ")
        );
        return;
      }

      if (!AREA_COLS.length) {
        showError("No pude detectar columnas de ÁREA. Asegurate de tener columnas como: " + AREA_EXPECTED.join(", "));
        return;
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      document.getElementById("clienteHint").textContent = `Columna cliente: ${CLIENT_COL}`;

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
      document.getElementById("mesSelect")?.addEventListener("change", () => {
        updateKPIs();
        buildChartAreas();
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});


/* =========================================================
   HEATMAP (POR FILA / POR MES) — blanco → naranja → rojo
   - En cada fila, el mínimo queda blanco y el máximo rojo.
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

// blanco -> naranja -> rojo
function heatColorWhiteOrangeRed(t) {
  t = Math.max(0, Math.min(1, t));

  const WHITE  = [255, 255, 255];
  const ORANGE = [255, 165, 0];   // naranja
  const RED    = [220, 53, 69];   // rojo (similar bootstrap danger)

  if (t <= 0.5) {
    return mixRGB(WHITE, ORANGE, t / 0.5);
  }
  return mixRGB(ORANGE, RED, (t - 0.5) / 0.5);
}

function applyHeatmapPorFila() {
  const trs = document.querySelectorAll("#tablaAreas tbody tr");

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

      // ✅ fondo heatmap
      td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");

      // ✅ texto: blanco si está muy “alto” (zona roja)
      td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
      td.style.fontWeight = t >= 0.85 ? "800" : "600";
    });
  });
}
