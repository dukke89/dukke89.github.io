/* ============================
   DEMORAS - DASHBOARD
   - Lee DEMORAS.csv (del repo)
   - Mantiene filtros existentes: clienteSelect / mesSelect
   - Gráfico mensual: Chart.js (barras + línea tendencia)
   - Donas + leyendas: Apache ECharts
   - Tablas: heatmap blanco->naranja->rojo (por fila)
============================ */

const csvUrl = "DEMORAS.csv";
const DELIM = ";";

// candidatos para detectar columnas
const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
const MES_CANDIDATES = ["MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];
const AREA_CANDIDATES = ["AREA", "ÁREA", "AREA RESPONSABLE", "ÁREA RESPONSABLE"];
const MOTIVO_CANDIDATES = ["MOTIVO", "MOTIVO DEMORA", "CATEGORIA", "CATEGORÍA", "CLASIFICACION", "CLASIFICACIÓN"];

// áreas esperadas (para detectar columnas wide)
const AREA_EXPECTED = [
  "EQUIPOS MENORES",
  "CADENA DE SUMINISTRO",
  "ALMACÉN",
  "BLEN",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS AGV"
];

// motivos esperados (para detectar columnas wide)
const MOTIVOS_EXPECTED = [
  "LIBERACION SOLPED CS",
  "COLOCACION OC CS",
  "LIBERACION OC CS",
  "PLAZO DE ENTREGA EXCEDIDO CS",
  "ENTREGA DEL PROVEEDOR CS",
  "REGISTRO DE ALMACENAMIENTO OBRA",
  "FECHAENTREGAMUYCERCANA"
];

let RAW = [];
let COLS = [];
let colCliente = null;
let colMes = null;
let colArea = null;
let colMotivo = null;

let chartMes = null;      // Chart.js
let echAreas = null;      // ECharts instance
let echMotivos = null;    // ECharts instance

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "")
  .toString()
  .replace(/^\uFEFF/, "")
  .replace(/\s+/g, " ")
  .trim();

function norm(s){
  return clean(s).toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}+/gu, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "");
}

function toNum(v){
  if (v === null || v === undefined) return 0;
  const s = clean(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// CSV parser (soporta comillas)
function parseCSV(text, delim=";"){
  const rows = [];
  let cur = [];
  let val = "";
  let inQ = false;

  for (let i=0; i<text.length; i++){
    const ch = text[i];
    const next = text[i+1];

    if (ch === '"'){
      if (inQ && next === '"'){ // escape
        val += '"'; i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }

    if (!inQ && ch === delim){
      cur.push(val); val = ""; continue;
    }

    if (!inQ && (ch === "\n" || ch === "\r")){
      if (ch === "\r" && next === "\n") i++;
      cur.push(val);
      if (cur.some(c => clean(c) !== "")) rows.push(cur);
      cur = []; val = "";
      continue;
    }

    val += ch;
  }
  cur.push(val);
  if (cur.some(c => clean(c) !== "")) rows.push(cur);
  return rows;
}

function findColumnByCandidates(headers, candidates){
  const H = headers.map(h => norm(h));
  for (const c of candidates){
    const target = norm(c);
    const idx = H.findIndex(h => h === target);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function pickWideColumns(headers, expectedList){
  const hNorm = new Map(headers.map(h => [norm(h), h]));
  const cols = [];
  for (const ex of expectedList){
    const hit = hNorm.get(norm(ex));
    if (hit) cols.push(hit);
  }
  return cols;
}

function uniqSorted(arr){
  return [...new Set(arr)].sort((a,b)=> a.localeCompare(b, "es"));
}

/* ============================
   DATA ACCESS
============================ */
function getSelCliente(){
  const el = document.getElementById("clienteSelect");
  return el ? clean(el.value) : "Todos";
}
function getSelMes(){
  const el = document.getElementById("mesSelect");
  return el ? clean(el.value) : "";
}

function rowsFiltered({byMes=true} = {}){
  const cliente = getSelCliente();
  const mes = getSelMes();

  return RAW.filter(r => {
    if (colCliente && cliente && cliente !== "Todos"){
      if (clean(r[colCliente]) !== cliente) return false;
    }
    if (byMes && colMes && mes){
      if (clean(r[colMes]) !== mes) return false;
    }
    return true;
  });
}

/* ============================
   AGGREGATIONS
============================ */
function aggByMonth(rows){
  const map = new Map();
  for (const r of rows){
    const m = colMes ? clean(r[colMes]) : "";
    if (!m) continue;
    map.set(m, (map.get(m) || 0) + 1);
  }
  return map;
}

function getRowForMonthWide(rows){
  // Si el CSV viene ya agregado por mes (1 fila por mes), devolvemos la fila del mes
  const mes = getSelMes();
  if (!colMes || !mes) return null;
  return rows.find(r => clean(r[colMes]) === mes) || null;
}

function aggAreas(rows){
  // caso A: columna AREA (raw)
  if (colArea){
    const map = new Map();
    for (const r of rows){
      const a = clean(r[colArea]);
      if (!a) continue;
      map.set(a, (map.get(a) || 0) + 1);
    }
    return map;
  }

  // caso B: columnas wide (EQUIPOS MENORES, etc)
  const wide = pickWideColumns(COLS, AREA_EXPECTED);
  if (!wide.length) return new Map();

  // si hay 1 fila por mes, usamos esa fila
  const one = getRowForMonthWide(rows);
  const map = new Map();
  const sourceRows = one ? [one] : rows; // fallback suma
  for (const c of wide){
    let s = 0;
    for (const r of sourceRows) s += toNum(r[c]);
    map.set(c, s);
  }
  return map;
}

function aggMotivos(rows){
  // caso A: columna MOTIVO (raw)
  if (colMotivo){
    const map = new Map();
    for (const r of rows){
      const k = clean(r[colMotivo]);
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  // caso B: columnas wide
  const wide = pickWideColumns(COLS, MOTIVOS_EXPECTED);
  if (!wide.length) return new Map();

  const one = getRowForMonthWide(rows);
  const map = new Map();
  const sourceRows = one ? [one] : rows;
  for (const c of wide){
    let s = 0;
    for (const r of sourceRows) s += toNum(r[c]);
    map.set(c, s);
  }
  return map;
}

/* ============================
   COLORS / HEATMAP
============================ */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// blanco -> naranja -> rojo
function heatColor(t){
  t = clamp01(t);
  const white = [255,255,255];
  const orange = [255,165,0];
  const red = [220,53,69];

  let c1, c2, tt;
  if (t < 0.5){
    c1 = white; c2 = orange; tt = t/0.5;
  } else {
    c1 = orange; c2 = red; tt = (t-0.5)/0.5;
  }
  const r = Math.round(lerp(c1[0], c2[0], tt));
  const g = Math.round(lerp(c1[1], c2[1], tt));
  const b = Math.round(lerp(c1[2], c2[2], tt));
  return `rgb(${r},${g},${b})`;
}

function isDarkBg(rgbStr){
  const m = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return false;
  const r = +m[1], g = +m[2], b = +m[3];
  // luminancia aproximada
  return (0.2126*r + 0.7152*g + 0.0722*b) < 140;
}

/* ============================
   CHARTS
============================ */
function buildChartMes(){
  const rows = rowsFiltered({byMes:false}); // por cliente, todos los meses
  const map = aggByMonth(rows);

  // orden por aparición (más seguro)
  const labelsInOrder = [];
  for (const r of rows){
    const m = colMes ? clean(r[colMes]) : "";
    if (m && !labelsInOrder.includes(m)) labelsInOrder.push(m);
  }
  const labelsFinal = labelsInOrder.length ? labelsInOrder : [...map.keys()].sort((a,b)=>a.localeCompare(b,"es"));
  const data = labelsFinal.map(m => map.get(m) || 0);

  // línea tendencia simple (moving average 3)
  const trend = data.map((_,i)=>{
    const a = data[i-1] ?? data[i];
    const b = data[i];
    const c = data[i+1] ?? data[i];
    return Math.round((a+b+c)/3);
  });

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;

  if (chartMes){ chartMes.destroy(); chartMes = null; }

  chartMes = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labelsFinal,
      datasets: [
        { label: "Demoras", data },
        { label: "Tendencia", type: "line", data: trend, tension: 0.2, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function buildEchartsDona(domId, title, map){
  const el = document.getElementById(domId);
  if (!el) return null;

  const data = [];
  for (const [k,v] of map.entries()){
    const n = Number(v);
    if (!n) continue;
    data.push({name: k, value: n});
  }
  data.sort((a,b)=> b.value - a.value);

  const total = data.reduce((s,d)=> s + d.value, 0) || 1;
  const topName = data[0]?.name;

  // paleta fija (distinta por segmento)
  const palette = [
    "#0d6efd", "#20c997", "#fd7e14", "#6f42c1", "#198754",
    "#ffc107", "#dc3545", "#0dcaf0", "#6610f2", "#adb5bd"
  ];

  const inst = echarts.init(el, null, { renderer: "canvas" });

  inst.setOption({
    title: {
      text: title,
      left: 10,
      top: 8,
      textStyle: { fontSize: 14, fontWeight: 700 }
    },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const pct = ((p.value/total)*100).toFixed(2).replace(".", ",");
        return `${p.name}<br/>${p.value} (${pct}%)`;
      }
    },
    legend: {
      orient: "vertical",
      right: 12,
      top: "middle",
      itemWidth: 14,
      itemHeight: 10,
      formatter: (name) => {
        const found = data.find(d => d.name === name);
        const pct = found ? ((found.value/total)*100).toFixed(1).replace(".", ",") : "0,0";
        return `${name} - ${pct}%`;
      }
    },
    series: [{
      type: "pie",
      radius: ["55%","72%"],
      center: ["38%","55%"],
      avoidLabelOverlap: true,
      itemStyle: {
        borderColor: "#fff",
        borderWidth: 2,
        color: (params) => {
          // mayor en rojo
          if (params.name === topName) return "#dc3545";
          return palette[params.dataIndex % palette.length];
        }
      },
      label: {
        show: true,
        formatter: (p) => {
          const pct = ((p.value/total)*100).toFixed(2).replace(".", ",");
          return `${p.value} (${pct}%)`;
        }
      },
      labelLine: { length: 12, length2: 10 },
      data
    }]
  });

  window.addEventListener("resize", () => inst.resize());
  return inst;
}

/* ============================
   TABLES
============================ */
function renderHeatTable(tableId, rows, colNames){
  const table = document.getElementById(tableId);
  if (!table) return;

  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const trh = document.createElement("tr");
  for (const c of colNames){
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  for (const r of rows){
    const tr = document.createElement("tr");

    // heat scale por fila sobre columnas numéricas (desde col 1)
    const nums = r.slice(1).map(v => Number(v) || 0);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const denom = (max - min) || 1;

    r.forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = (idx === 0) ? v : (Number(v)||0).toLocaleString("es-AR");
      if (idx > 0){
        const t = (((Number(v)||0) - min) / denom);
        const bg = heatColor(t);
        td.style.background = bg;
        if (isDarkBg(bg)) td.classList.add("heat-strong");
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }
}

function buildTableAreas(){
  const rowsAll = rowsFiltered({byMes:false}); // por cliente
  const months = uniqSorted(rowsAll.map(r => colMes ? clean(r[colMes]) : "").filter(Boolean));

  // determinar columnas de áreas
  let areaCols = [];
  if (colArea){
    areaCols = uniqSorted(rowsAll.map(r => clean(r[colArea])).filter(Boolean));
  } else {
    areaCols = pickWideColumns(COLS, AREA_EXPECTED);
  }

  const outRows = [];

  if (colArea){
    // pivot raw
    for (const m of months){
      const rowsM = rowsAll.filter(r => clean(r[colMes]) === m);
      const map = new Map();
      for (const a of areaCols) map.set(a, 0);
      for (const r of rowsM){
        const a = clean(r[colArea]);
        if (!a) continue;
        map.set(a, (map.get(a) || 0) + 1);
      }
      outRows.push([m, ...areaCols.map(a => map.get(a) || 0)]);
    }
  } else {
    // wide: asumimos 1 fila por mes (si hay más, suma)
    for (const m of months){
      const rowsM = rowsAll.filter(r => clean(r[colMes]) === m);
      const row = [m];
      for (const c of areaCols){
        let s = 0;
        for (const r of rowsM) s += toNum(r[c]);
        row.push(s);
      }
      outRows.push(row);
    }
  }

  // ✅ SIN TOTAL
  renderHeatTable("tableAreas", outRows, ["Mes", ...areaCols]);
}

function buildTableMotivos(){
  const rowsAll = rowsFiltered({byMes:false});
  const months = uniqSorted(rowsAll.map(r => colMes ? clean(r[colMes]) : "").filter(Boolean));

  let motivoCols = [];
  if (colMotivo){
    motivoCols = uniqSorted(rowsAll.map(r => clean(r[colMotivo])).filter(Boolean));
  } else {
    motivoCols = pickWideColumns(COLS, MOTIVOS_EXPECTED);
  }

  const outRows = [];

  if (colMotivo){
    for (const m of months){
      const rowsM = rowsAll.filter(r => clean(r[colMes]) === m);
      const map = new Map();
      for (const k of motivoCols) map.set(k, 0);
      for (const r of rowsM){
        const k = clean(r[colMotivo]);
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
      outRows.push([m, ...motivoCols.map(k => map.get(k) || 0)]);
    }
  } else {
    for (const m of months){
      const rowsM = rowsAll.filter(r => clean(r[colMes]) === m);
      const row = [m];
      for (const c of motivoCols){
        let s = 0;
        for (const r of rowsM) s += toNum(r[c]);
        row.push(s);
      }
      outRows.push(row);
    }
  }

  renderHeatTable("tableMotivos", outRows, ["Mes", ...motivoCols]);
}

/* ============================
   DONUTS (ECharts)
============================ */
function buildChartAreas(){
  const rows = rowsFiltered({byMes:true});
  const map = aggAreas(rows);

  if (echAreas){ echAreas.dispose(); echAreas = null; }
  echAreas = buildEchartsDona("chartAreas", "% de demoras por ÁREA (mes seleccionado)", map);
}

function buildChartMotivos(){
  const rows = rowsFiltered({byMes:true});
  const map = aggMotivos(rows);

  if (echMotivos){ echMotivos.dispose(); echMotivos = null; }
  echMotivos = buildEchartsDona("chartMotivos", "% de demoras según mes seleccionado", map);
}

/* ============================
   KPIs (si existen en el HTML)
============================ */
function setText(id, txt){
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function updateKPIs(){
  const rowsM = rowsFiltered({byMes:true});
  setText("kpiDemorasMes", rowsM.length.toLocaleString("es-AR"));
}

/* ============================
   UI INIT
============================ */
function fillSelect(elId, values, includeTodos){
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = "";
  if (includeTodos){
    const opt = document.createElement("option");
    opt.value = "Todos";
    opt.textContent = "Todos";
    el.appendChild(opt);
  }
  for (const v of values){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  }
}

function refreshAll(){
  updateKPIs();
  buildChartMes();
  buildChartAreas();
  buildTableAreas();
  buildChartMotivos();
  buildTableMotivos();
}

async function init(){
  const res = await fetch(csvUrl, { cache: "no-store" });
  const txt = await res.text();
  const matrix = parseCSV(txt, DELIM);

  COLS = matrix[0].map(clean);
  RAW = matrix.slice(1).map(row => {
    const obj = {};
    COLS.forEach((h,i)=> obj[h] = clean(row[i]));
    return obj;
  });

  colCliente = findColumnByCandidates(COLS, CLIENT_CANDIDATES);
  colMes = findColumnByCandidates(COLS, MES_CANDIDATES);
  colArea = findColumnByCandidates(COLS, AREA_CANDIDATES);
  colMotivo = findColumnByCandidates(COLS, MOTIVO_CANDIDATES);

  setText("clienteHint", colCliente ? `Columna cliente: ${colCliente}` : "Columna cliente: -");
  setText("mesHint", colMes ? "Mes seleccionado: -" : "Mes seleccionado: - (no detectado)");

  const clientes = colCliente ? uniqSorted(RAW.map(r => clean(r[colCliente])).filter(Boolean)) : [];
  const meses = colMes ? uniqSorted(RAW.map(r => clean(r[colMes])).filter(Boolean)) : [];

  fillSelect("clienteSelect", clientes, true);
  fillSelect("mesSelect", meses, false);

  // default mes = último si existe
  const mesEl = document.getElementById("mesSelect");
  if (mesEl && meses.length) mesEl.value = meses[meses.length-1];

  document.getElementById("clienteSelect")?.addEventListener("change", refreshAll);
  document.getElementById("mesSelect")?.addEventListener("change", refreshAll);

  refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
