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
  
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (pctAT >= 0.75) ? "#16a34a" : "#ef4444";
setText("kpiATqty", `Cantidad: ${fmtInt(t.at)}`);

  // Color rule: AT > 80% => rojo
  const elAT = document.getElementById("kpiATpct");
  if (elAT) elAT.style.color = (pctAT > 0.8) ? "#e53935" : "";

  // Demora promedio (general)
  const avgG = avgDelay(rows);
  setText("kpiDemoraAvg", isNaN(avgG) ? "-" : (Math.round(avgG) + " d"));

  
  const elDemG = document.getElementById("kpiDemoraAvg");
  if (elDemG) elDemG.style.color = (!isNaN(avgG) && avgG > 7) ? "#ef4444" : "#16a34a";
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
  
  const elATmes = document.getElementById("kpiATmes");
  if (elATmes) elATmes.style.color = (isFinite(cur.pctAT) && cur.pctAT >= 0.75) ? "#16a34a" : "#ef4444";
setText("kpiFTmes", fmtPct01(cur.pctFT));
  setText("kpiNOmes", fmtPct01(cur.pctNO));

  // Demora promedio del mes seleccionado
  const mesRows = rows.filter(r => getMonthKeyFromRow(r) === mes);
  const avgM = avgDelay(mesRows);
  setText("kpiDemoraMes", isNaN(avgM) ? "-" : (Math.round(avgM) + " d"));

  
  const elDemM = document.getElementById("kpiDemoraMes");
  if (elDemM) elDemM.style.color = (!isNaN(avgM) && avgM > 7) ? "#ef4444" : "#16a34a";
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
   CHART DEFAULTS (ECharts)
============================ */
function applyChartDefaults() {
  // nada global por ahora
}

/* ============================
   CHART 1: 100% stacked bar + línea (ECharts)
   - La línea SIEMPRE arriba: zlevel/z alto
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

    const dem = toNumAny(r[DEMORA_COL]);
    if (!isNaN(dem)) { c.demSum += dem; c.demCnt += 1; }
  }

  const months = [...monthsSet].sort();
  const qAT = months.map(m => agg.get(m)?.at ?? 0);
  const qFT = months.map(m => agg.get(m)?.ft ?? 0);
  const qNO = months.map(m => agg.get(m)?.no ?? 0);

  const pAT = qAT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pFT = qFT.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });
  const pNO = qNO.map((v,i)=>{ const t=qAT[i]+qFT[i]+qNO[i]; return t? (v/t)*100 : 0; });

  const avgDem = months.map(m => {
    const c = agg.get(m);
    return (c && c.demCnt) ? (c.demSum / c.demCnt) : null;
  });

  const el = document.getElementById("chartMes");
  if (!el || !window.echarts) return;

  if (!chartMes) chartMes = echarts.init(el, null, { renderer: "canvas" });

  const option = {
    grid: { left: 56, right: 70, top: 16, bottom: 62 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      confine: true,
      formatter: (params) => {
        const axis = params?.[0]?.axisValue ?? "";
        let html = `<b>${axis}</b><br/>`;
        const byName = Object.fromEntries(params.map(p => [p.seriesName, p]));
        const at = byName["Entregados AT"];
        const ft = byName["Entregados FT"];
        const ne = byName["No entregados"];
        const dem = byName["Promedio días de demora"];

        if (at) html += `🟩 AT: <b>${fmtInt(qAT[at.dataIndex])}</b> (${_fmtNum1(at.data)}%)<br/>`;
        if (ft) html += `🟧 FT: <b>${fmtInt(qFT[ft.dataIndex])}</b> (${_fmtNum1(ft.data)}%)<br/>`;
        if (ne) html += `🟥 NE: <b>${fmtInt(qNO[ne.dataIndex])}</b> (${_fmtNum1(ne.data)}%)<br/>`;
        if (dem && dem.data != null) html += `🔵 Demora prom.: <b>${_fmtNum1(dem.data)}</b> días<br/>`;
        return html;
      }
    },
    legend: {
      bottom: 12,
      left: "center",
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { fontWeight: 800 }
    },
    xAxis: {
      type: "category",
      data: months,
      axisTick: { alignWithLabel: true },
      axisLabel: { fontWeight: 700 }
    },
    yAxis: [
      {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(15,23,42,0.10)" } }
      },
      {
        type: "value",
        name: "Días de demora",
        position: "right",
        axisLabel: { fontWeight: 700 },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Entregados AT",
        type: "bar",
        stack: "pct",
        data: pAT.map(v => +(+v).toFixed(4)),
        barMaxWidth: 52,
        itemStyle: { color: COLORS.green, borderRadius: [6, 6, 0, 0] },
        label: {
          show: true,
          position: "inside",
          color: "#fff",
          fontWeight: 900,
          fontSize: 11,
          lineHeight: 12,
          formatter: (p) => {
            const i = p.dataIndex;
            const pct = +p.data || 0;
            const q = (qAT)[i] || 0;
            if (!q) return "";
            // ocultar etiquetas si el segmento es muy chico (evita amontonamiento)
            if (pct < 6) return "";
            return `${fmtInt(q)}\n(${Math.round(pct)}%)`;
          }
        },
        labelLayout: { hideOverlap: true },

        emphasis: { disabled: true },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          label: {
            show: true,
            formatter: "Objetivo 75%",
            fontWeight: 900,
            position: "end"
          },
          lineStyle: { type: "dashed", width: 2, color: "#6b7280" },
          data: [{ yAxis: 75 }]
        },

        z: 1,
        zlevel: 0
      },
      {
        name: "Entregados FT",
        type: "bar",
        stack: "pct",
        data: pFT.map(v => +(+v).toFixed(4)),
        barMaxWidth: 52,
        itemStyle: { color: COLORS.amber },
        label: {
          show: true,
          position: "inside",
          color: "#111",
          fontWeight: 950,
          fontSize: 11,
          lineHeight: 12,
          formatter: (p) => {
            const i = p.dataIndex;
            const pct = +p.data || 0;
            const q = (qFT)[i] || 0;
            if (!q) return "";
            // ocultar etiquetas si el segmento es muy chico (evita amontonamiento)
            if (pct < 6) return "";
            return `${fmtInt(q)}\n(${Math.round(pct)}%)`;
          }
        },
        labelLayout: { hideOverlap: true },

        emphasis: { disabled: true },
        z: 1,
        zlevel: 0
      },
      {
        name: "No entregados",
        type: "bar",
        stack: "pct",
        data: pNO.map(v => +(+v).toFixed(4)),
        barMaxWidth: 52,
        itemStyle: { color: COLORS.red },
        label: {
          show: true,
          position: "inside",
          color: "#fff",
          fontWeight: 900,
          fontSize: 11,
          lineHeight: 12,
          formatter: (p) => {
            const i = p.dataIndex;
            const pct = +p.data || 0;
            const q = (qNO)[i] || 0;
            if (!q) return "";
            // ocultar etiquetas si el segmento es muy chico (evita amontonamiento)
            if (pct < 6) return "";
            return `${fmtInt(q)}\n(${Math.round(pct)}%)`;
          }
        },
        labelLayout: { hideOverlap: true },

        emphasis: { disabled: true },
        z: 1,
        zlevel: 0
      },
      {
        name: "Promedio días de demora",
        type: "line",
        yAxisIndex: 1,
        data: avgDem,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: true,
        connectNulls: true,
        lineStyle: { width: 3, color: COLORS.blue },
        itemStyle: { color: COLORS.blue, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "top",
          backgroundColor: "rgba(255,255,255,0.75)",
          padding: [2, 4],
          borderRadius: 4,
          fontWeight: 950,
          color: "#0b1220",
          formatter: (p) => (p.data == null || isNaN(p.data)) ? "" : `${Math.round(p.data)} d`
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          label: {
            show: true,
            formatter: "Límite 7 días",
            fontWeight: 900,
            position: "end"
          },
          lineStyle: { type: "dashed", width: 2, color: "#9ca3af" },
          data: [{ yAxis: 7 }]
        },

        zlevel: 10,
        z: 10
      }
    ]
  };

  chartMes.setOption(option, true);
  window.addEventListener("resize", () => chartMes && chartMes.resize(), { passive: true });
}

/* ============================
   CHART 2: Trend lines (ECharts)
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
  if (!el || !window.echarts) return;

  if (!chartTendencia) chartTendencia = echarts.init(el, null, { renderer: "canvas" });

  const option = {
    grid: { left: 56, right: 18, top: 16, bottom: 62 },
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (params) => {
        const axis = params?.[0]?.axisValue ?? "";
        let html = `<b>${axis}</b><br/>`;
        for (const p of params) {
          html += `${p.marker} ${p.seriesName}: <b>${_fmtNum1(p.data)}</b>%<br/>`;
        }
        return html;
      }
    },
    legend: {
      bottom: 12,
      left: "center",
      itemWidth: 14,
      itemHeight: 10,
      textStyle: { fontWeight: 800 }
    },
    xAxis: {
      type: "category",
      data: months,
      axisLabel: { fontWeight: 700 }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { color: "rgba(15,23,42,0.10)" } }
    },
    series: [
      {
        name: "A Tiempo %",
        type: "line",
        data: pAT.map(v => +(+v).toFixed(2)),
        symbolSize: 7,
        lineStyle: { width: 3, color: COLORS.green },
        itemStyle: { color: COLORS.green, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
        zlevel: 5, z: 5
      },
      {
        name: "Fuera Tiempo %",
        type: "line",
        data: pFT.map(v => +(+v).toFixed(2)),
        symbolSize: 7,
        lineStyle: { width: 3, color: COLORS.amber },
        itemStyle: { color: COLORS.amber, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
        zlevel: 5, z: 5
      },
      {
        name: "No Entregados %",
        type: "line",
        data: pNO.map(v => +(+v).toFixed(2)),
        symbolSize: 7,
        lineStyle: { width: 3, color: COLORS.red },
        itemStyle: { color: COLORS.red, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "top", fontWeight: 900, formatter: (p) => _fmtPct(p.data) },
        zlevel: 5, z: 5
      }
    ]
  };

  chartTendencia.setOption(option, true);
  window.addEventListener("resize", () => chartTendencia && chartTendencia.resize(), { passive: true });
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



