/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

// columnas (con candidatos por si cambian mayúsculas/acentos)
const CLIENT_CANDIDATES = ["ALMACEN","Almacén","Almacen","ALMACÉN","Cliente","CLIENTE","CLIENTE (ALMACEN)"];
const MATERIAL_CANDIDATES = ["Material","MATERIAL","Código Item","CODIGO ITEM","Codigo Item","CODIGOITEM"];
const LIBRE_CANDIDATES = ["Libre utilización","Libre utilizacion","LIBRE UTILIZACION","Libre Utilizacion","Libre utilización ","Libre utilizacion "];
const ESTADO_CANDIDATES = ["Estado","ESTADO","Id Estado","ID ESTADO","IdEstado","IDESTADO","Id_Estado","id estado","Estado Item","ESTADO ITEM"];

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let COL_CLIENT = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

let chartDonut = null;

/* ============================
   HELPERS
============================ */
function normalizeHeaderName(s){
  if (s == null) return "";
  return String(s)
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const clean = (v) => (v ?? "").toString().trim();

function byFirstExisting(candidates) {
  const norm = headers.map(h => normalizeHeaderName(h));
  for (const c of candidates) {
    const idx = norm.indexOf(normalizeHeaderName(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

/* ============================
   FILTERS
============================ */
function getSelectedCliente() {
  const sel = document.getElementById("clienteSelect");
  return sel ? sel.value : "";
}

function filteredRows() {
  const c = getSelectedCliente();
  if (!c) return data;
  return data.filter(r => clean(r[COL_CLIENT]) === c);
}

/* ============================
   CALCS
============================ */
function calcKPIs(rows) {
  const allMaterials = new Set();
  const availableMaterials = new Set();

  for (const r of rows) {
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;
    allMaterials.add(mat);

    const libre = toNumber(r[COL_LIBRE]);
    if (libre > 0) availableMaterials.add(mat);
  }

  const totalMat = allMaterials.size;
  const dispMat = availableMaterials.size;
  const pct = totalMat ? dispMat / totalMat : NaN;

  return { totalMat, dispMat, pct };
}

function calcEstados(rows) {
  const map = new Map();

  for (const r of rows) {
    const estado = clean(r[COL_ESTADO]) || "(Sin estado)";
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;

    if (!map.has(estado)) map.set(estado, new Set());
    map.get(estado).add(mat);
  }

  let items = [...map.entries()].map(([estado, setMat]) => ({
    estado,
    qty: setMat.size
  }));

  /* =====================================================
     🔹 ORDEN FORZADO DE LEYENDA: 01 → 04 (CAMBIO ÚNICO)
  ===================================================== */
  items.sort((a, b) => {
    const na = parseInt(a.estado, 10);
    const nb = parseInt(b.estado, 10);

    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;

    return a.estado.localeCompare(b.estado, "es");
  });

  const total = items.reduce((s, x) => s + x.qty, 0);
  return { items, total };
}

/* ============================
   DONUT
============================ */
function buildDonut(items, total) {
  const host = document.getElementById("donutEstados");
  const legend = document.getElementById("donutLegend");
  if (!host || !legend || !window.echarts) return;

  legend.innerHTML = "";
  if (chartDonut) chartDonut.dispose();

  chartDonut = echarts.init(host);

  const palette = ["#ef4444", "#f59e0b", "#16a34a", "#2563eb"];

  const seriesData = items.map((it, i) => ({
    name: it.estado,
    value: it.qty,
    itemStyle: { color: palette[i % palette.length] }
  }));

  chartDonut.setOption({
    tooltip: {
      trigger: "item",
      formatter: p => `${p.name}<br>${fmtInt(p.value)} (${fmtPct(p.value / total)})`
    },
    series: [{
      type: "pie",
      radius: ["45%", "75%"],
      label: { show: true },
      data: seriesData
    }]
  });

  // leyenda custom
  items.forEach((it, i) => {
    const pct = total ? Math.round((it.qty / total) * 100) : 0;

    const card = document.createElement("div");
    card.className = "callout";

    const dot = document.createElement("span");
    dot.className = "callout-dot";
    dot.style.background = palette[i % palette.length];

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="callout-title">${it.estado}</div>
      <div class="callout-pct">${pct}%</div>
      <div class="callout-sub">${fmtInt(it.qty)} materiales</div>
    `;

    card.appendChild(dot);
    card.appendChild(body);
    legend.appendChild(card);
  });

  window.addEventListener("resize", () => chartDonut.resize());
}

/* ============================
   APPLY
============================ */
function applyAll() {
  const rows = filteredRows();

  const k = calcKPIs(rows);
  safeSetText("kpiMat", fmtInt(k.totalMat));
  safeSetText("kpiDisp", fmtInt(k.dispMat));
  safeSetText("kpiPct", fmtPct(k.pct));

  const e = calcEstados(rows);
  buildDonut(e.items, e.total);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  fetch(csvUrl)
    .then(r => r.text())
    .then(text => {
      const rows = text.split("\n").map(r => r.split(DELIM));
      headers = rows[0];

      COL_CLIENT = byFirstExisting(CLIENT_CANDIDATES);
      COL_MATERIAL = byFirstExisting(MATERIAL_CANDIDATES);
      COL_LIBRE = byFirstExisting(LIBRE_CANDIDATES);
      COL_ESTADO = byFirstExisting(ESTADO_CANDIDATES);

      data = rows.slice(1).map(r => {
        const o = {};
        headers.forEach((h, i) => o[h] = r[i]);
        return o;
      });

      applyAll();
    })
    .catch(() => showError("Error cargando ANALISIS-MM.csv"));
});
