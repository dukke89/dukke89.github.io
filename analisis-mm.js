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

// columnas indicadoras para descargas
const IND_STOCK_NULO_CANDIDATES = ["Stock nulo","STOCK NULO","Stock Nulo","STOCK_NULO","Stock_nulo"];
const IND_MENOR_PP_CANDIDATES = ["Menor a PP","MENOR A PP","Menor a Pp","Menor a punto de pedido","MENOR A PUNTO DE PEDIDO"];
const IND_MAYOR_STOCK_MAX_CANDIDATES = ["Mayor a Stock Maximo","MAYOR A STOCK MAXIMO","Mayor a stock máximo","MAYOR A STOCK MÁXIMO"];


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

/* ===== Header normalization helpers (accents/spaces/BOM) ===== */
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
  x = x.replace(/\s/g, "");
  // 1.234,56 o 1234,56
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
  // admite: "78.506.400,32" o "$ 78.506.400,32"
  const s = String(v).trim().replace(/[^0-9,.-]+/g, "");
  if (!s) return 0;
  // si viene con coma decimal, eliminar separadores de miles
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // si viene con punto decimal
  return Number(s.replace(/,/g, "")) || 0;
}

function fmtPct(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(2).replace(".", ",") + "%";
}

/* CSV parser simple (quotes safe) */
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
  // Estado -> Set(material)
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
   RENDER: TABLA + DONA
============================ */
function renderEstadosTable(items, total) {
  const tb = document.getElementById("estadosTbody");
  if (!tb) return;

  tb.innerHTML = "";

  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="3" class="muted">Sin datos</td></tr>`;
    return;
  }

  for (const it of items) {
    const tr = document.createElement("tr");

    const tdE = document.createElement("td");
    tdE.textContent = it.estado;

    const tdQ = document.createElement("td");
    tdQ.className = "num";
    tdQ.textContent = fmtInt(it.qty);

    const tdP = document.createElement("td");
    tdP.className = "num";
    const p = total ? it.qty / total : 0;
    tdP.textContent = fmtPct(p);

    tr.appendChild(tdE);
    tr.appendChild(tdQ);
    tr.appendChild(tdP);
    tb.appendChild(tr);
  }

  // total
  const trT = document.createElement("tr");
  trT.className = "total-row";

  const tdTE = document.createElement("td");
  tdTE.textContent = "Total";

  const tdTQ = document.createElement("td");
  tdTQ.className = "num";
  tdTQ.textContent = fmtInt(total);

  const tdTP = document.createElement("td");
  tdTP.className = "num";
  tdTP.textContent = "100,00%";

  trT.appendChild(tdTE);
  trT.appendChild(tdTQ);
  trT.appendChild(tdTP);
  tb.appendChild(trT);
}


function buildDonut(items, total) {
  if (!window.echarts) {
    console.warn('ECharts no cargó: revisá el <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js">');
    return;
  }

  const host = document.getElementById("donutEstados");
  const legend = document.getElementById("donutLegend");
  if (!host || !legend) return;

  legend.innerHTML = "";

  if (chartDonut) {
    try { chartDonut.dispose(); } catch(e) {}
    chartDonut = null;
  }

  // paleta base + forzar "Stock nulo" rojo
  const palette = [
    "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9",
    "#10b981", "#a3a3a3", "#eab308", "#14b8a6", "#fb7185"
  ];
  const norm = (s) => normalizeHeaderName(s);
  const isStockNulo = (name) => {
  const n = norm(name)
    .replace(/^[0-9]+\s*[-.:_\s]*/g, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();
  const t = norm("Stock nulo").replace(/[_\-\s]+/g, " ").trim();
  return n === t;
};

  const colorByName = {};
  let palIdx = 0;
  items.forEach(it => {
    if (isStockNulo(it.estado)) colorByName[it.estado] = "#ef4444";
    else {
      colorByName[it.estado] = palette[palIdx % palette.length];
      palIdx++;
    }
  });

  const seriesData = items.map(it => ({
    name: it.estado,
    value: it.qty,
    itemStyle: { color: colorByName[it.estado] }
  }));

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
      radius: ["52%", "80%"],
      center: ["50%", "50%"],
      minAngle: 2,
      padAngle: 1,
      itemStyle: { borderColor: "rgba(255,255,255,.95)", borderWidth: 2 },
      label: {
        show: true,
        formatter: (p) => {
          const v = p.value || 0;
          if (!total) return "";
          const pct = (v / total) * 100;
          // evita amontonar: oculta etiquetas muy chicas
          if (pct < 3) return "";
          return `${p.name}
${pct.toFixed(0)}%`;
        },
        fontWeight: 900,
        fontSize: 12,
        color: "#0b1220"
      },
      labelLine: { show: true, length: 10, length2: 8 },
      data: seriesData
    }]
  });

  // leyenda tipo "callouts"
  items.forEach((it) => {
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

  const onResize = () => { try { chartDonut && chartDonut.resize(); } catch(e) {} };
  window.addEventListener("resize", onResize, { passive: true });
}



/* ============================
   DOWNLOADS (CSV)
============================ */
function truthyIndicator(v){
  const s = clean(v).toUpperCase();
  if (!s) return false;
  return s === "1" || s === "SI" || s === "SÍ" || s === "TRUE" || s === "VERDADERO" || s === "X" || s === "OK";
}

function csvEscape(value){
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(DELIM)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(filename, rows){
  const cols = headers;
  const lines = [];
  lines.push(cols.map(csvEscape).join(DELIM));
  for (const r of rows){
    lines.push(cols.map(h => csvEscape(r[h])).join(DELIM));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadByKind(kind){
  if (!data.length || !headers.length) return alert("Todavía no se cargaron los datos.");
  const rows = filteredRows();

  const colStock = byFirstExisting(IND_STOCK_NULO_CANDIDATES);
  const colMenor = byFirstExisting(IND_MENOR_PP_CANDIDATES);
  const colMayor = byFirstExisting(IND_MAYOR_STOCK_MAX_CANDIDATES);

  let col = null;
  let label = "";
  if (kind === "stock_nulo") { col = colStock; label = "stock_nulo"; }
  if (kind === "menor_pp") { col = colMenor; label = "menor_a_pp"; }
  if (kind === "mayor_stock_max") { col = colMayor; label = "mayor_stock_max"; }

  if (!col){
    // fallback por Estado (si no hay columnas indicadoras)
    if (!COL_ESTADO) return alert("No encuentro columnas indicadoras ni la columna Estado.");
    const estadoWanted =
      kind === "stock_nulo" ? "stock nulo" :
      kind === "menor_pp" ? "menor a punto de pedido" :
      "mayor a stock maximo";

    const filtered = rows.filter(r => normalizeHeaderName(r[COL_ESTADO]).includes(estadoWanted));
    if (!filtered.length) return alert("No hay filas para descargar con esa condición.");
    const cliente = getSelectedCliente() ? "_" + getSelectedCliente() : "";
    return downloadCsv(`ANALISIS-MM_${label}${cliente}.csv`, filtered);
  }

  const filtered = rows.filter(r => truthyIndicator(r[col]));
  if (!filtered.length) return alert("No hay filas para descargar con esa condición.");
  const cliente = getSelectedCliente() ? "_" + getSelectedCliente() : "";
  downloadCsv(`ANALISIS-MM_${label}${cliente}.csv`, filtered);
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
  // Tabla de estados eliminada
buildDonut(e.items, e.total);
  buildValorizacionStock(rows);
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  // Delegación de eventos para descargas
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest("button");
    if (!btn) return;
    if (btn.id === "btnDLStockNulo") return downloadByKind("stock_nulo");
    if (btn.id === "btnDLMenorPP") return downloadByKind("menor_pp");
    if (btn.id === "btnDLMayorStockMax") return downloadByKind("mayor_stock_max");
  });

  // fecha “hoy” arriba
  const d = new Date();
  safeSetText(
    "lastUpdate",
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  );

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

      COL_CLIENT = byFirstExisting(CLIENT_CANDIDATES);
      COL_MATERIAL = byFirstExisting(MATERIAL_CANDIDATES);
      COL_LIBRE = byFirstExisting(LIBRE_CANDIDATES);
      COL_ESTADO = byFirstExisting(ESTADO_CANDIDATES);

      const missing = [];
      if (!COL_CLIENT) missing.push("ALMACEN");
      if (!COL_MATERIAL) missing.push("Material");
      if (!COL_LIBRE) missing.push("Libre utilización");
      if (!COL_ESTADO) missing.push("Estado");

      if (missing.length) {
        showError(
          `Faltan columnas en ${csvUrl}: ${missing.join(", ")}<br>` +
          `Revisá encabezados (mayúsculas/acentos). Probé Libre: ${LIBRE_CANDIDATES.join(" / ")}`
        );
        return;
      }

      // armar objetos
      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      safeSetText("clienteHint", `Columna cliente: ${COL_CLIENT}`);

      renderClientes();
      applyAll();

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
if (sel) sel.value = "";
        applyAll();
      });
    })
    .catch(err => {
      console.error(err);
      showError(`Error cargando ${csvUrl}. Revisá el nombre EXACTO y que esté en la raíz del repo.`);
    });
});



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

  const data = Array.from(agg.entries())
    .map(([rubro, valor]) => ({ rubro, valor }))
    .sort((a,b) => b.valor - a.valor);

  const total = data.reduce((s,d) => s + d.valor, 0);
  let acc = 0;

  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  data.forEach(d => {
    acc += d.valor;
    const pct = total ? (d.valor / total * 100) : 0;
    const pctAcc = total ? (acc / total * 100) : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.rubro}</td>
      <td class="num">$ ${fmtMoney(d.valor)}</td>
      <td class="num">${pct.toFixed(2).replace(".", ",")}%</td>
      <td class="num">${pctAcc.toFixed(2).replace(".", ",")}%</td>
    `;
    tbody.appendChild(tr);
  });

  const valTotal = document.getElementById("valTotal");
  if (valTotal) valTotal.textContent = `$ ${fmtMoney(total)}`;
}
