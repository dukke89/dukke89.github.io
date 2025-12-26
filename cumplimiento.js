function _fmtPct(v){ if(v==null||isNaN(v)) return ""; const n=Math.round(v*10)/10; return n.toString().replace(".", ",") + "%"; }
function _fmtNum1(v){ if(v==null||isNaN(v)) return ""; const n=Math.round(v*10)/10; return n.toString().replace(".", ","); }

function makeDemoraAnnotations(xs, ys){
  const ann = [];
  for(let i=0;i<xs.length;i++){
    const y = ys[i];
    if(y==null || isNaN(y)) continue;
    ann.push({
      x: xs[i],
      y: y,
      xref: "x",
      yref: "y2",
      text: Math.round(y) + " d",
      showarrow: true,
      arrowhead: 2,
      arrowsize: 1,
      arrowwidth: 1,
      ax: 0,
      ay: -18,
      bgcolor: "rgba(255,255,255,0.85)",
      bordercolor: "rgba(0,0,0,0.25)",
      borderwidth: 1,
      borderpad: 3,
      font: {size: 11, color: "#111"},
      align: "center"
    });
  }
  return ann;
}


function toNumAny(v){
  if(v==null) return NaN;
  if(typeof v === "number") return v;
  const s = String(v).trim();
  if(!s) return NaN;
  // soporta "7,8" y "7.8" y también miles "1.234,5"
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(norm);
  return isNaN(n) ? NaN : n;
}
/* ============================
   CONFIG
============================ */
const csvUrl = "CUMPLIMIENTO_2025.csv";  // nombre EXACTO en tu repo
const DELIM = ";";

const FECHA_COL = "FECHA ENTREGA ESPERADA";
const DEMORA_COL = "DIAS DE DEMORA";

function avgDelay(rows){
  let s = 0, c = 0;
  for (const r of rows){
    const v = toNumAny(r[DEMORA_COL]);
    if (!isNaN(v)){ s += v; c++; }
  }
  return c ? (s / c) : NaN;
}
const CLIENT_CANDIDATES = ["CLIENTE / OBRA", "CLIENTE NRO.", "CLIENTE"];

// NUEVOS FILTROS
const CLASIF2_CANDIDATES = ["CLASIFICACION 2", "CLASIFICACIÓN 2", "CLASIFICACION2", "CLASIFICACION_2"];
const GCOC_CANDIDATES = ["GRUPO DE COMPRAS OC", "GRUPO DE COMPRAS_OC", "GRUPO DE COMPRA OC"];

const AT_COL = "ENTREGADOS AT";
const FT_COL = "ENTREGADOS FT";
const NO_COL = "NO ENTREGADOS";

/* ============================
   COLORES (match KPIs)
============================ */
const COLORS = {
  blue:  "#1d4ed8",
  green: "#16a34a",
  amber: "#f59e0b",
  red:   "#ef4444",
  grid:  "rgba(15, 23, 42, 0.10)",
  text:  "#0b1220",
  muted: "#526172",
};

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let CLASIF2_COL = null;
let GCOC_COL = null;

let chartMes = null;
let chartTendencia = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  // soporte 1.234,56 y 1234,56 y 1234.56
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct01(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function safeFilePart(s) {
  return clean(s).replace(/[^\w\-]+/g, "_").slice(0, 80) || "Todos";
}

function showError(msg) {
  setHTML("msg", `<div class="error">${msg}</div>`);
}

/* ============================
   DATE PARSING
   dd/mm/yyyy | dd-mm-yyyy | yyyy-mm-dd
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
  const d = parseDateAny(r[FECHA_COL]);
  return d ? monthKey(d) : null;
}

/* ============================
   CSV parser (quotes safe)
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
   SELECT UTIL
============================ */
function fillSelect(selectId, values, placeholder = "Todos") {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const prev = sel.value;

  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);

  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }

  // mantener selección si existe, sino “Todos”
  sel.value = values.includes(prev) ? prev : "";
}

function uniqSorted(arr) {
  return [...new Set(arr.map(clean).filter(Boolean))].sort((a,b) => a.localeCompare(b, "es"));
}

/* ============================
   FILTERS (NUEVO: cliente + clasif2 + gcoc)
============================ */
function getSel(id) {
  return document.getElementById(id)?.value || "";
}

function rowsByClienteBase() {
  const c = getSel("clienteSelect");
  if (!c) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function filteredRowsNoMes() {
  let rows = rowsByClienteBase();

  const c2 = getSel("clasif2Select");
  if (c2 && CLASIF2_COL) rows = rows.filter(r => clean(r[CLASIF2_COL]) === c2);

  const gc = getSel("gcocSelect");
  if (gc && GCOC_COL) rows = rows.filter(r => clean(r[GCOC_COL]) === gc);

  return rows;
}

function filteredRowsByAll() {
  const rows = filteredRowsNoMes();
  const mes = getSel("mesSelect");
  if (!mes) return rows;
  return rows.filter(r => getMonthKeyFromRow(r) === mes);
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const clientes = uniqSorted(data.map(r => r[CLIENT_COL]));
  fillSelect("clienteSelect", clientes, "Todos");
}

function renderClasif2(rowsBase) {
  const hint = document.getElementById("clasif2Hint");
  if (!CLASIF2_COL) {
    if (hint) hint.textContent = "Columna: (no encontrada)";
    // deshabilito el select para que no moleste
    const sel = document.getElementById("clasif2Select");
    if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
    return;
  }
  if (hint) hint.textContent = `Columna: ${CLASIF2_COL}`;
  const vals = uniqSorted(rowsBase.map(r => r[CLASIF2_COL]));
  const sel = document.getElementById("clasif2Select");
  if (sel) sel.disabled = false;
  fillSelect("clasif2Select", vals, "Todos");
}

function renderGcoc(rowsBase) {
  const hint = document.getElementById("gcocHint");
  if (!GCOC_COL) {
    if (hint) hint.textContent = "Columna: (no encontrada)";
    const sel = document.getElementById("gcocSelect");
    if (sel) { sel.disabled = true; sel.innerHTML = `<option value="">Todos</option>`; }
    return;
  }
  if (hint) hint.textContent = `Columna: ${GCOC_COL}`;
  const vals = uniqSorted(rowsBase.map(r => r[GCOC_COL]));
  const sel = document.getElementById("gcocSelect");
  if (sel) sel.disabled = false;
  fillSelect("gcocSelect", vals, "Todos");
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
  const prevSelected = sel.value;

  sel.innerHTML = "";
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  // por defecto: último mes disponible
  sel.value = months.includes(prevSelected) ? prevSelected : (months[months.length - 1] || "");

  const hint = document.getElementById("mesHint");
  if (hint) hint.textContent = sel.value ? `Mes seleccionado: ${sel.value}` : "Sin meses";

  return months;
}

/* ============================
   KPI CALCS
============================ */
function calcTotals(rows) {
  let at = 0, ft = 0, no = 0;
  for (const r of rows) {
    at += toNumber(r[AT_COL]);
    ft += toNumber(r[FT_COL]);
    no += toNumber(r[NO_COL]);
  }
  const total = at + ft + no;
  return { at, ft, no, total };
}

function calcMonthTotals(rows, month) {
  let at = 0, ft = 0, no = 0;

  for (const r of rows) {
    if (getMonthKeyFromRow(r) !== month) continue;
    at += toNumber(r[AT_COL]);
    ft += toNumber(r[FT_COL]);
    no += toNumber(r[NO_COL]);
  }

  const total = at + ft + no;
  const pctAT = total ? at / total : NaN;
  const pctFT = total ? ft / total : NaN;
  const pctNO = total ? no / total : NaN;

  return { at, ft, no, total, pctAT, pctFT, pctNO };
}

/* ============================
   DELTAS
============================ */
function deltaInfo(curr, prev) {
  if (!isFinite(curr) || !isFinite(prev)) return { text: "Sin mes anterior", diff: NaN };
  const diff = curr - prev;
  const eps = 0.000001;
  if (Math.abs(diff) < eps) return { text: "• 0,0% vs mes anterior", diff: 0 };
  const arrow = diff > 0 ? "▲" : "▼";
  const txt = `${arrow} ${(Math.abs(diff) * 100).toFixed(1).replace(".", ",")}% vs mes anterior`;
  return { text: txt, diff };
}

function setDelta(el, text, cls) {
  if (!el) return;
  el.classList.remove("delta-good", "delta-bad", "delta-neutral");
  if (cls) el.classList.add(cls);
  el.textContent = text;
}

/* ============================
   KPIs UI
============================ */
function updateKPIsGeneral(rows) {
  const t = calcTotals(rows);
  const pctAT = t.total ? t.at / t.total : NaN;
  const pctFT = t.total ? t.ft / t.total : NaN;
  const pctNO = t.total ? t.no / t.total : NaN;

  setText("kpiTotal", fmtInt(t.total));

  setText("kpiATpct", fmtPct01(pctAT));
  setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);

  // Color rule: AT > 80% => rojo
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (pctAT > 0.8) ? "#e53935" : "";

  // Demora promedio (general)
  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));

  setText("kpiFTpct", fmtPct01(pctFT));
  setText("kpiFTqty", `Cantidad: ${fmtInt(t.ft)}`);

  setText("kpiNOpct", fmtPct01(pctNO));
  setText("kpiNOqty", `Cantidad: ${fmtInt(t.no)}`);
}

function updateKPIsMonthly(rows, months) {
  const mes = getSel("mesSelect");
  if (!mes) return;

  const idx = months.indexOf(mes);
  const prevMes = idx > 0 ? months[idx - 1] : null;

  const cur = calcMonthTotals(rows, mes);
  const prev = prevMes ? calcMonthTotals(rows, prevMes) : null;

  setText("kpiTotalMes", fmtInt(cur.total));
  setText("kpiATmes", fmtPct01(cur.pctAT));
  setText("kpiFTmes", fmtPct01(cur.pctFT));
  setText("kpiNOmes", fmtPct01(cur.pctNO));

  // Demora promedio del mes seleccionado
  const mesRows = rows.filter(r => getMonthKeyFromRow(r) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));

  const atSub = document.getElementById("kpiATmesSub");
  const ftSub = document.getElementById("kpiFTmesSub");
  const noSub = document.getElementById("kpiNOmesSub");

  if (!prev) {
    setDelta(atSub, `Cant: ${fmtInt(cur.at)} · Sin mes anterior`, "");
    setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · Sin mes anterior`, "");
    setDelta(noSub, `Cant: ${fmtInt(cur.no)} · Sin mes anterior`, "");
    return;
  }

  const dAT = deltaInfo(cur.pctAT, prev.pctAT);
  const dFT = deltaInfo(cur.pctFT, prev.pctFT);
  const dNO = deltaInfo(cur.pctNO, prev.pctNO);

  /*
    REGLAS:
    AT: baja = rojo, sube o se mantiene = verde
    FT: sube o se mantiene = rojo, baja = verde
    NO: sube = rojo, baja o se mantiene = verde
  */
  let clsAT = "delta-good";
  if (dAT.diff < 0) clsAT = "delta-bad";

  let clsFT = "delta-bad";
  if (dFT.diff < 0) clsFT = "delta-good";

  let clsNO = "delta-good";
  if (dNO.diff > 0) clsNO = "delta-bad";

  setDelta(atSub, `Cant: ${fmtInt(cur.at)} · ${dAT.text}`, clsAT);
  setDelta(ftSub, `Cant: ${fmtInt(cur.ft)} · ${dFT.text}`, clsFT);
  setDelta(noSub, `Cant: ${fmtInt(cur.no)} · ${dNO.text}`, clsNO);
}

/* ============================
   CHART DEFAULTS
============================ */
function applyChartDefaults() {
  // Plotly no necesita defaults globales acá.
}

/* ============================
   CHART 1: 100% stacked bar
============================ */
function buildChartMes(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0, demSum: 0, demCnt: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);

    // Promedio mensual de días de demora
    const rawDem = clean(r[DEMORA_COL]);
    if (rawDem !== "") {
      const dem = toNumber(rawDem);
      if (Number.isFinite(dem)) {
        c.demSum += dem;
        c.demCnt += 1;
      }
    }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pFT = qFT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pNO = qNO.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  // Promedio mensual de días de demora (columna "DIAS DE DEMORA")
  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });


  const el = document.getElementById("chartMes");
  if (!el || !window.Plotly) return;

  const tAT = {
    type: "bar",
    name: "Entregados AT",
    x: months,
    y: pAT,
    customdata: qAT,
    texttemplate: "%{customdata:,} (%{y:.0f}%)",
    textposition: "inside",
    textangle: 0,
    cliponaxis: false,
    insidetextfont: { color: "#ffffff", size: 12, family: "Montserrat, sans-serif" },
    marker: { color: "#16a34a" }, // verde
    hovertemplate: "%{x}<br><b>Entregados AT</b>: %{customdata:,} (%{y:.1f}%)<extra></extra>",
  };
const tFT = {
    type: "bar",
    name: "Entregados FT",
    x: months,
    y: pFT,
    customdata: qFT,
    texttemplate: "%{customdata:,} (%{y:.0f}%)",
    textposition: "inside",
    textangle: 0,
    cliponaxis: false,
    insidetextfont: { color: "#111827", size: 12, family: "Montserrat, sans-serif" },
    marker: { color: "#f59e0b" }, // naranja
    hovertemplate: "%{x}<br><b>Entregados FT</b>: %{customdata:,} (%{y:.1f}%)<extra></extra>",
  };
const tNO = {
    type: "bar",
    name: "No entregados",
    x: months,
    y: pNO,
    customdata: qNO,
    texttemplate: "%{customdata:,} (%{y:.0f}%)",
    textposition: "inside",
    textangle: 0,
    cliponaxis: false,
    insidetextfont: { color: "#ffffff", size: 12, family: "Montserrat, sans-serif" },
    marker: { color: "#ef4444" }, // rojo
    hovertemplate: "%{x}<br><b>No entregados</b>: %{customdata:,} (%{y:.1f}%)<extra></extra>",
  };
const tDem = {
    type: "scatter",
    mode: "lines+markers+text",
    name: "Promedio días de demora",
    x: months,
    y: avgDem,
    yaxis: "y2",
    text: avgDem.map(v => (v==null||isNaN(v)) ? "" : `${Math.round(v)} d`),
    textposition: "top center",
    textfont: { color: "#1d4ed8", size: 12, family: "Montserrat, sans-serif" },
    line: { color: "#1d4ed8", width: 3, shape: "spline" }, // azul
    marker: { color: "#1d4ed8", size: 7, line: { color: "#ffffff", width: 1 } },
    hovertemplate: "%{x}<br><b>Promedio demora</b>: %{y:.1f} días<extra></extra>",
  };
const layout = {
    barmode: "stack",
    barnorm: "percent",
    bargap: 0.18,
    hovermode: "x unified",
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: -0.22,
      xanchor: "left",
      font: { size: 12 }
    },
    margin: { l: 55, r: 70, t: 10, b: 55 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Source Sans 3, system-ui, sans-serif", size: 13, color: "#0E1A2B" },
    uniformtext: { mode: "hide", minsize: 11 },
    xaxis: {
      title: "",
      tickfont: { size: 12 },
      showgrid: false,
      zeroline: false
    },
    yaxis: {
      title: "%",
      rangemode: "tozero",
      ticksuffix: "%",
      tickfont: { size: 12 },
      gridcolor: "rgba(0,0,0,0.08)",
      zeroline: false
    },
    yaxis2: {
      title: "Días de demora",
      overlaying: "y",
      side: "right",
      rangemode: "tozero",
      range: [0, Math.ceil(maxDem + 3)],
      tickfont: { size: 12 },
      gridcolor: "rgba(0,0,0,0)",
      zeroline: false
    },
    annotations: []
  };

  const config = { displayModeBar: false, displaylogo: false, responsive: true };

  Plotly.react(el, [tDem, tNO, tFT, tAT], layout, config);
}

/* ============================
   CHART 2: Trend lines
============================ */
function buildChartTendencia(rows) {
  const agg = new Map();
  const monthsSet = new Set();

  for (const r of rows) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) continue;

    const mk = monthKey(d);
    monthsSet.add(mk);

    if (!agg.has(mk)) agg.set(mk, { at: 0, ft: 0, no: 0 });
    const c = agg.get(mk);

    c.at += toNumber(r[AT_COL]);
    c.ft += toNumber(r[FT_COL]);
    c.no += toNumber(r[NO_COL]);
  }

  const months = [...monthsSet].sort();

  const pAT = months.map(m => {
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.at ?? 0) / t) * 100 : 0;
  });

  const pFT = months.map(m => {
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.ft ?? 0) / t) * 100 : 0;
  });

  const pNO = months.map(m => {
    const c = agg.get(m); const t = (c?.at ?? 0) + (c?.ft ?? 0) + (c?.no ?? 0);
    return t ? ((c.no ?? 0) / t) * 100 : 0;
  });

  const el = document.getElementById("chartTendencia");
  if (!el || !window.Plotly) return;

  const t1 = {
    type: "scatter",
    mode: "lines+markers+text",
    textposition: "top center",
    textfont: {size: 11},
    name: "A Tiempo %",
    x: months,
    y: pAT,
    text: pAT.map(_fmtPct),
    cliponaxis: false,
    hovertemplate: "%{x}<br>AT: %{y:.1f}%<extra></extra>",
  };

  const t2 = {
    type: "scatter",
    mode: "lines+markers+text",
    textposition: "top center",
    textfont: {size: 11},
    name: "Fuera Tiempo %",
    x: months,
    y: pFT,
    text: pFT.map(_fmtPct),
    cliponaxis: false,
    hovertemplate: "%{x}<br>FT: %{y:.1f}%<extra></extra>",
  };

  const t3 = {
    type: "scatter",
    mode: "lines+markers+text",
    textposition: "top center",
    textfont: {size: 11},
    name: "No Entregados %",
    x: months,
    y: pNO,
    text: pNO.map(_fmtPct),
    cliponaxis: false,
    hovertemplate: "%{x}<br>NE: %{y:.1f}%<extra></extra>",
  };

  const layout = {
    margin: { l: 55, r: 15, t: 10, b: 45 },
    xaxis: { automargin: true },
    yaxis: { title: "%", range: [0, 100], ticksuffix: "%", gridcolor: "rgba(0,0,0,0.08)" },
    legend: { orientation: "h", y: -0.2 },
  };

  const config = { displayModeBar: false, displaylogo: false, responsive: true };

  Plotly.react(el, [t1, t2, t3], layout, config);
}

/* ============================
   DOWNLOAD: NO ENTREGADOS
============================ */
function escapeCSV(v) {
  const s = (v ?? "").toString();
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename, rows, cols) {
  const header = cols.map(escapeCSV).join(";");
  const lines = rows.map(r => cols.map(c => escapeCSV(r[c])).join(";"));
  const csv = [header, ...lines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function getNoEntregadosRows(rows) {
  return rows.filter(r => toNumber(r[NO_COL]) > 0);
}

/* ============================
   APPLY ALL (con filtros nuevos)
============================ */
function applyAll() {
  // 1) base por cliente (para refrescar opciones dependientes)
  const baseCliente = rowsByClienteBase();

  // 2) refresco clasif2 desde cliente
  renderClasif2(baseCliente);

  // 3) refresco gcoc desde cliente + clasif2 actual
  const baseParaGc = (() => {
    let r = baseCliente;
    const c2 = getSel("clasif2Select");
    if (c2 && CLASIF2_COL) r = r.filter(x => clean(x[CLASIF2_COL]) === c2);
    return r;
  })();
  renderGcoc(baseParaGc);

  // 4) filas finales (sin mes) para KPIs generales + charts + meses disponibles
  const rows = filteredRowsNoMes();

  // 5) meses disponibles en base a filtros (sin mes)
  const months = buildMesSelect(rows);

  // 6) KPIs y charts con filtros aplicados
  updateKPIsGeneral(rows);
  updateKPIsMonthly(rows, months);

  buildChartMes(rows);
  buildChartTendencia(rows);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  applyChartDefaults();

  // fecha “hoy” en header
  const d = new Date();
  setText("lastUpdate", `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`);

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

      CLIENT_COL = CLIENT_CANDIDATES.find(c => headers.includes(c));
      if (!CLIENT_COL) {
        showError("No encuentro columna CLIENTE. Probé: " + CLIENT_CANDIDATES.join(" / "));
        return;
      }

      // detectar columnas nuevas si existen
      CLASIF2_COL = CLASIF2_CANDIDATES.find(c => headers.includes(c)) || null;
      GCOC_COL = GCOC_CANDIDATES.find(c => headers.includes(c)) || null;

      const required = [FECHA_COL, AT_COL, FT_COL, NO_COL];
      const missing = required.filter(c => !headers.includes(c));
      if (missing.length) {
        showError("Faltan columnas en el CSV: " + missing.join(", "));
        return;
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      setText("clienteHint", `Columna cliente: ${CLIENT_COL}`);
      setText("clasif2Hint", CLASIF2_COL ? `Columna: ${CLASIF2_COL}` : "Columna: (no encontrada)");
      setText("gcocHint", GCOC_COL ? `Columna: ${GCOC_COL}` : "Columna: (no encontrada)");

      renderClientes();
      applyAll();

      // listeners
      document.getElementById("clienteSelect")?.addEventListener("change", () => {
        // al cambiar cliente, reseteo los otros filtros para evitar combinaciones raras
        const c2 = document.getElementById("clasif2Select");
        if (c2) c2.value = "";
        const gc = document.getElementById("gcocSelect");
        if (gc) gc.value = "";
        applyAll();
      });

      document.getElementById("clasif2Select")?.addEventListener("change", () => {
        // al cambiar clasif2, reseteo gcoc (depende del clasif2)
        const gc = document.getElementById("gcocSelect");
        if (gc) gc.value = "";
        applyAll();
      });

      document.getElementById("gcocSelect")?.addEventListener("change", applyAll);

      document.getElementById("mesSelect")?.addEventListener("change", () => {
        const rows = filteredRowsNoMes();
        const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))].sort();
        updateKPIsMonthly(rows, months);
      });

      document.getElementById("btnDownloadNO")?.addEventListener("click", () => {
        const rowsFilt = filteredRowsByAll();
        const noRows = getNoEntregadosRows(rowsFilt);

        if (!noRows.length) {
          alert("No hay NO ENTREGADOS para el filtro actual.");
          return;
        }

        const cols = headers.slice(); // exportar TODAS las columnas

        const cliente = safeFilePart(getSel("clienteSelect") || "Todos");
        const c2 = safeFilePart(getSel("clasif2Select") || "Todos");
        const gc = safeFilePart(getSel("gcocSelect") || "Todos");
        const mes = safeFilePart(getSel("mesSelect") || "Todos");

        const filename = `NO_ENTREGADOS_${cliente}_${c2}_${gc}_${mes}.csv`;
        downloadCSV(filename, noRows, cols);
      });

      // limpio mensaje de error si había
      setHTML("msg", "");
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});



