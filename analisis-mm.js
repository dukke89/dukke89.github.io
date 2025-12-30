/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const evolUrl = "EVOLUCION.csv";
const DELIM = ";";

// ANALISIS-MM columnas
const CLIENT_CANDIDATES = ["ALMACEN","Almacén","Almacen","ALMACÉN","Cliente","CLIENTE","CLIENTE (ALMACEN)"];
const MATERIAL_CANDIDATES = ["Material","MATERIAL","Código Item","CODIGO ITEM","Codigo Item","CODIGOITEM"];
const LIBRE_CANDIDATES = ["Libre utilización","Libre utilizacion","LIBRE UTILIZACION","Libre Utilizacion","Libre utilización ","Libre utilizacion "];
const ESTADO_CANDIDATES = ["Estado","ESTADO","Id Estado","ID ESTADO","IdEstado","IDESTADO","Id_Estado","id estado","Estado Item","ESTADO ITEM"];

// EVOLUCION columnas (flexibles)
const EVO_MES_CANDIDATES = ["MES","Mes","Periodo","PERIODO","Fecha","FECHA","Mes/Año","MES AÑO","MES_ANIO","MES-AÑO","MES ANIO"];
const EVO_CLIENT_CANDIDATES = ["ALMACEN","Almacén","Almacen","ALMACÉN","Cliente","CLIENTE"];
const EVO_PROM_CANDIDATES = ["Promedio dias de demora","PROMEDIO DIAS DEMORA","Promedio días de demora","PROMEDIO DÍAS DE DEMORA","Promedio demora","PROMEDIO DEMORA"];
const EVO_NOENT_CANDIDATES = ["No entregados","NO ENTREGADOS","No_Entregados","NO_ENTREGADOS"];
const EVO_AT_CANDIDATES = ["Entregados AT","ENTREGADOS AT","Entregados a tiempo","ENTREGADOS A TIEMPO","Entregados AT %","ENTREGADOS AT %"];
const EVO_FT_CANDIDATES = ["Entregados FT","ENTREGADOS FT","Entregados fuera de termino","ENTREGADOS FUERA DE TERMINO","Entregados FT %","ENTREGADOS FT %"];

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

// Evolución
let evoData = [];
let evoHeaders = [];
let EVO_COL_MES = null;
let EVO_COL_CLIENT = null;
let EVO_COL_PROM = null;
let EVO_COL_NOENT = null;
let EVO_COL_AT = null;
let EVO_COL_FT = null;
let chartEvo = null;

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

function byFirstExisting(candidates, headerArray) {
  const hs = headerArray ?? headers;
  const norm = hs.map(h => normalizeHeaderName(h));
  for (const c of candidates) {
    const idx = norm.indexOf(normalizeHeaderName(c));
    if (idx >= 0) return hs[idx];
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
  x = x.replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(v){
  if (v == null) return 0;
  const s = String(v).trim().replace(/[^0-9,.-]+/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(s.replace(/,/g, "")) || 0;
}

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

/* CSV parser (quotes safe) */
function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cur); cur = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(cur); rows.push(row);
      row = []; cur = "";
    } else {
      cur += ch;
    }
  }

  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
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
   UI: CLIENTES
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  const clientes = [...new Set(data.map(r => clean(r[COL_CLIENT])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

/* ============================
   CALCS (MM)
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

  const items = [...map.entries()].map(([estado, setMat]) => ({
    estado,
    qty: setMat.size
  }));

  items.sort((a, b) => b.qty - a.qty);
  const total = items.reduce((s, x) => s + x.qty, 0);

  return { items, total };
}

/* ============================
   DONUT (ECharts) + LEYENDA
============================ */
function buildDonut(items, total) {
  if (!window.echarts) return;

  const host = document.getElementById("donutEstados");
  const legend = document.getElementById("donutLegend");
  if (!host || !legend) return;

  legend.innerHTML = "";

  if (chartDonut) {
    try { chartDonut.dispose(); } catch(e) {}
    chartDonut = null;
  }

  const orderedItems = [...items].sort((a, b) => {
    const getPref = (s) => {
      const m = String(s || "").trim().match(/^\s*(\d{1,2})\s*[-.:_\s]/);
      return m ? parseInt(m[1], 10) : 999;
    };
    const pa = getPref(a.estado);
    const pb = getPref(b.estado);
    if (pa !== pb) return pa - pb;
    if ((b.qty || 0) !== (a.qty || 0)) return (b.qty || 0) - (a.qty || 0);
    return String(a.estado).localeCompare(String(b.estado), "es");
  });

  const palette = [
    "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9",
    "#10b981", "#a3a3a3", "#eab308", "#14b8a6", "#fb7185"
  ];

  const normLoose = (s) => normalizeHeaderName(s)
    .replace(/^[0-9]+\s*[-.:_\s]*/g, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();

  const isStockNulo = (name) => normLoose(name) === normLoose("Stock nulo");

  const colorByName = {};
  let palIdx = 0;
  orderedItems.forEach(it => {
    if (isStockNulo(it.estado)) colorByName[it.estado] = "#ef4444";
    else { colorByName[it.estado] = palette[palIdx % palette.length]; palIdx++; }
  });

  const seriesData = orderedItems.map(it => {
    const isSN = isStockNulo(it.estado);
    return ({
      name: it.estado,
      value: it.qty,
      itemStyle: { color: colorByName[it.estado] },
      ...(isSN ? {
        label: { color: "#ef4444", fontWeight: 950 },
        labelLine: { lineStyle: { color: "#ef4444", width: 2 } }
      } : {})
    });
  });

  chartDonut = echarts.init(host, null, { renderer: "canvas" });

  chartDonut.setOption({
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const v = p.value || 0;
        const pct = total ? ((v / total) * 100) : 0;
        return `${p.name}<br/>${fmtInt(v)} materiales (${pct.toFixed(2).replace(".", ",")}%)`;
      }
    },
    series: [{
      type: "pie",
      radius: ["45%", "78%"],
      center: ["50%", "48%"],
      minAngle: 2,
      padAngle: 2,
      itemStyle: { borderColor: "rgba(255,255,255,.95)", borderWidth: 2 },
      label: {
        show: true,
        formatter: (p) => {
          const v = p.value || 0;
          if (!total) return "";
          const pct = (v / total) * 100;
          if (pct < 3) return "";
          return `${p.name}\n${pct.toFixed(0)}%`;
        },
        fontWeight: 950,
        fontSize: 12,
        color: "#0b1220"
      },
      labelLine: { show: true, length: 14, length2: 10 },
      data: seriesData
    }]
  });

  orderedItems.forEach((it) => {
    const p = total ? it.qty / total : 0;
    const pct = (p * 100).toFixed(0) + "%";
    const c = colorByName[it.estado] || "#2d6cdf";

    const card = document.createElement("div");
    card.className = "callout";
    if (isStockNulo(it.estado)) card.classList.add("is-stock-nulo");

    const dot = document.createElement("span");
    dot.className = "callout-dot";
    dot.style.background = c;

    const body = document.createElement("div");

    const title = document.createElement("div");
    title.className = "callout-title";
    title.textContent = it.estado;

    const big = document.createElement("div");
    big.className = "callout-pct";
    big.style.color = c;
    big.textContent = pct;

    const sub = document.createElement("div");
    sub.className = "callout-sub";
    sub.textContent = `${fmtInt(it.qty)} materiales`;

    body.appendChild(title);
    body.appendChild(big);
    body.appendChild(sub);

    card.appendChild(dot);
    card.appendChild(body);
    legend.appendChild(card);
  });

  window.addEventListener("resize", () => {
    try { chartDonut && chartDonut.resize(); } catch(e) {}
  }, { passive: true });
}

/* ============================
   VALORIZACIÓN
============================ */
function buildValorizacionStock(rows){
  const table = document.getElementById("tablaValorizacion");
  if (!table) return;

  const colRubro = "Rubro";
  const colValor = "Valor libre utilización";

  const agg = new Map();
  rows.forEach(r => {
    const rub = (r[colRubro] || "").trim();
    if (!rub) return;
    const val = parseMoney(r[colValor]);
    agg.set(rub, (agg.get(rub) || 0) + (isFinite(val) ? val : 0));
  });

  const arr = Array.from(agg.entries())
    .map(([rubro, valor]) => ({ rubro, valor }))
    .sort((a,b) => b.valor - a.valor);

  const total = arr.reduce((s,d) => s + d.valor, 0);
  let acc = 0;

  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  arr.forEach(d => {
    acc += d.valor;
    const pct = total ? (d.valor / total * 100) : 0;
    const pctAcc = total ? (acc / total * 100) : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.rubro}</td>
      <td class="num">$ ${fmtMoney(d.valor)}</td>
      <td class="num">${pct.toFixed(2).replace(".", ",")}%
      </td>
      <td class="num">${pctAcc.toFixed(2).replace(".", ",")}%
      </td>
    `;
    tbody.appendChild(tr);
  });

  const valTotal = document.getElementById("valTotal");
  if (valTotal) valTotal.textContent = `$ ${fmtMoney(total)}`;
}

/* ============================
   EVOLUCIÓN
============================ */
function parseMesKey(s) {
  const v = clean(s);
  if (!v) return { key: 99999999 };

  let m = v.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (m) return { key: (+m[1])*100 + (+m[2]) };

  m = v.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (m) return { key: (+m[2])*100 + (+m[1]) };

  m = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return { key: (+m[3])*100 + (+m[2]) };

  return { key: 90000000 };
}

function getEvoRowsFiltered() {
  const c = getSelectedCliente();
  if (!c) return evoData;
  if (!EVO_COL_CLIENT) return evoData;
  return evoData.filter(r => clean(r[EVO_COL_CLIENT]) === c);
}

function buildEvolucionChart() {
  if (!window.echarts) return;

  const el = document.getElementById("evolucionChart");
  if (!el) return;

  if (!evoData.length || !EVO_COL_MES) return;

  const rows = getEvoRowsFiltered();

  const agg = new Map();
  rows.forEach(r => {
    const mes = clean(r[EVO_COL_MES]);
    if (!mes) return;
    if (!agg.has(mes)) agg.set(mes, { prom: 0, noent: 0, at: 0, ft: 0, n: 0 });
    const a = agg.get(mes);
    a.prom += toNumber(r[EVO_COL_PROM]);
    a.noent += toNumber(r[EVO_COL_NOENT]);
    a.at += toNumber(r[EVO_COL_AT]);
    a.ft += toNumber(r[EVO_COL_FT]);
    a.n += 1;
  });

  const items = Array.from(agg.entries()).map(([mes, v]) => {
    const k = parseMesKey(mes);
    return { mes, key: k.key, ...v };
  }).sort((a,b) => a.key - b.key || a.mes.localeCompare(b.mes, "es"));

  const x = items.map(d => d.mes);
  const prom = items.map(d => d.n ? +(d.prom / d.n).toFixed(2) : 0);
  const noent = items.map(d => +d.noent.toFixed(0));
  const at = items.map(d => +d.at.toFixed(0));
  const ft = items.map(d => +d.ft.toFixed(0));

  if (chartEvo) { try { chartEvo.dispose(); } catch(e) {} }
  chartEvo = echarts.init(el, null, { renderer: "canvas" });

  chartEvo.setOption({
    grid: { left: 50, right: 18, top: 30, bottom: 55 },
    tooltip: { trigger: "axis" },
    legend: { top: 0, left: 0 },
    xAxis: { type: "category", data: x, axisLabel: { rotate: 35 } },
    yAxis: [
      { type: "value", name: "Cant." },
      { type: "value", name: "Días" }
    ],
    series: [
      { name: "No entregados", type: "bar", yAxisIndex: 0, data: noent, itemStyle: { color: "#ef4444" } },
      { name: "Entregados AT", type: "bar", yAxisIndex: 0, data: at, itemStyle: { color: "#16a34a" } },
      { name: "Entregados FT", type: "bar", yAxisIndex: 0, data: ft, itemStyle: { color: "#f59e0b" } },
      { name: "Promedio días de demora", type: "line", yAxisIndex: 1, data: prom, smooth: true, itemStyle: { color: "#1d4ed8" } }
    ]
  });

  window.addEventListener("resize", () => {
    try { chartEvo && chartEvo.resize(); } catch(e) {}
  }, { passive: true });
}

function loadEvolucion() {
  return fetch(evolUrl)
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(text => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) return;

      evoHeaders = m[0].map(clean);

      EVO_COL_MES = byFirstExisting(EVO_MES_CANDIDATES, evoHeaders);
      EVO_COL_CLIENT = byFirstExisting(EVO_CLIENT_CANDIDATES, evoHeaders);
      EVO_COL_PROM = byFirstExisting(EVO_PROM_CANDIDATES, evoHeaders);
      EVO_COL_NOENT = byFirstExisting(EVO_NOENT_CANDIDATES, evoHeaders);
      EVO_COL_AT = byFirstExisting(EVO_AT_CANDIDATES, evoHeaders);
      EVO_COL_FT = byFirstExisting(EVO_FT_CANDIDATES, evoHeaders);

      if (!EVO_COL_MES || !EVO_COL_PROM || !EVO_COL_NOENT || !EVO_COL_AT || !EVO_COL_FT) return;

      evoData = m.slice(1).map(row => {
        const o = {};
        evoHeaders.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      buildEvolucionChart();
    })
    .catch(() => {});
}

/* ============================
   APPLY ALL
============================ */
function applyAll() {
  const rows = filteredRows();

  const k = calcKPIs(rows);
  safeSetText("kpiMat", fmtInt(k.totalMat));
  safeSetText("kpiDisp", fmtInt(k.dispMat));
  safeSetText("kpiPct", fmtPct(k.pct));

  const e = calcEstados(rows);
  buildDonut(e.items, e.total);
  buildValorizacionStock(rows);

  buildEvolucionChart(); // mantiene EVOLUCIÓN con filtro
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  const d = new Date();
  safeSetText(
    "lastUpdate",
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  );

  fetch(csvUrl)
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(text => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) { showError("El CSV está vacío o no tiene filas."); return; }

      headers = m[0].map(clean);

      COL_CLIENT = byFirstExisting(CLIENT_CANDIDATES, headers);
      COL_MATERIAL = byFirstExisting(MATERIAL_CANDIDATES, headers);
      COL_LIBRE = byFirstExisting(LIBRE_CANDIDATES, headers);
      COL_ESTADO = byFirstExisting(ESTADO_CANDIDATES, headers);

      const missing = [];
      if (!COL_CLIENT) missing.push("ALMACEN");
      if (!COL_MATERIAL) missing.push("Material");
      if (!COL_LIBRE) missing.push("Libre utilización");
      if (!COL_ESTADO) missing.push("Estado");

      if (missing.length) {
        showError(`Faltan columnas en ${csvUrl}: ${missing.join(", ")}`);
        return;
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      renderClientes();

      // carga evolución y luego aplica todo
      loadEvolucion().finally(() => applyAll());

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
    })
    .catch(() => showError(`Error cargando ${csvUrl}. Revisá el nombre EXACTO y que esté en la raíz del repo.`));
});

