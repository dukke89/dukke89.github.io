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
  if (!window.d3) {
    console.warn('D3 no cargó: revisá el <script src="https://d3js.org/d3.v7.min.js">');
    return;
  }

  // D3 Pie (estilo "callouts" + porción mayor separada)
  const host = document.getElementById("donutEstados");
  const legend = document.getElementById("donutLegend");
  if (!host || !legend) return;

  // limpiar
  host.innerHTML = "";
  legend.innerHTML = "";

  // medidas
  const box = host.getBoundingClientRect();
  const width = Math.max(320, Math.floor(box.width || host.clientWidth || 520));
  const height = 340;
  const radius = Math.min(width, height) / 2 - 14;

  // colores consistentes
  const colors = (window.d3?.schemeTableau10 || ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b"]);
  const color = (window.d3 ? d3.scaleOrdinal().domain(items.map(d => d.estado)).range(colors) : null);

  // SVG
  const svg = d3.select(host)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img");

  const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);

  const pie = d3.pie()
    .sort(null)
    .value(d => d.qty);

  const arcs = pie(items);

  // identificar porción mayor
  let maxI = 0;
  arcs.forEach((a, i) => { if (a.value > arcs[maxI].value) maxI = i; });

  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  const arcLabel = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.78);

  // slices
  const slice = g.selectAll("path")
    .data(arcs)
    .enter()
    .append("path")
      .attr("d", arc)
      .attr("fill", d => color ? color(d.data.estado) : "#2d6cdf")
      .attr("stroke", "rgba(255,255,255,.9)")
      .attr("stroke-width", 2)
      .attr("transform", (d, i) => {
        if (i !== maxI) return null;
        const [cx, cy] = arc.centroid(d);
        const k = 0.12; // separación
        return `translate(${cx * k},${cy * k})`;
      });

  // porcentajes dentro (solo porciones no chicas)
  g.selectAll("text.pct")
    .data(arcs.filter(a => total ? (a.value / total) >= 0.06 : false))
    .enter()
    .append("text")
      .attr("class", "pct")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("transform", d => {
        const [x,y] = arcLabel.centroid(d);
        return `translate(${x},${y})`;
      })
      .style("font-weight", "900")
      .style("font-size", "28px")
      .style("fill", "white")
      .text(d => Math.round((d.value / total) * 100) + "%");

  // Callouts en leyenda (tipo imagen referencia)
  items.forEach((it) => {
    const p = total ? it.qty / total : 0;
    const pct = (p * 100).toFixed(0) + "%";
    const c = color ? color(it.estado) : "#2d6cdf";

    const card = document.createElement("div");
    card.className = "callout";

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
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
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

      document.getElementById("btnReset")?.addEventListener("click", () => {
        const sel = document.getElementById("clienteSelect");
        if (sel) sel.value = "";
        applyAll();
      });
    })
    .catch(err => {
      console.error(err);
      showError(`Error cargando ${csvUrl}. Revisá el nombre EXACTO y que esté en la raíz del repo.`);
    });
});


