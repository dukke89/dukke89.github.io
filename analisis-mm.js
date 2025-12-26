/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

// columnas (con candidatos por si cambian mayúsculas/acentos)
const CLIENT_CANDIDATES = ["ALMACEN", "Almacén", "Almacen"];
const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM"];
const LIBRE_CANDIDATES = ["Libre utilización", "Libre utilizacion", "LIBRE UTILIZACION", "Libre Utilizacion"];
const ESTADO_CANDIDATES = ["Estado", "ESTADO", "estado", "Id Estado", "ID ESTADO", "IdEstado", "ESTADO ITEM", "Estado Item", "ESTADO_ITEM", "Estado_item", "ESTADOITEM"];

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let COL_CLIENT = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().trim();

function byFirstExisting(candidates) {
  // match de headers sin importar mayúsculas/minúsculas
  const norm = headers.map(h => String(h).toLowerCase());
  for (const c of candidates) {
    const idx = norm.indexOf(String(c).toLowerCase());
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
function renderEstadosTable(){ /* tabla eliminada */ }


/* ============================
   APPLY ALL
============================ */
/* ============================
   D3 PIE (gráfico + leyenda)
============================ */
function renderPie(items, total){
  const root = document.getElementById("pieChart");
  const legend = document.getElementById("pieLegend");
  if(!root || !legend) return;

  root.innerHTML = "";
  legend.innerHTML = "";

  const data = (items || []).filter(d => d && d.estado && d.cant > 0);
  if(!data.length){
    root.innerHTML = '<div class="muted">Sin datos para graficar</div>';
    return;
  }
  data.sort((a,b)=> b.cant - a.cant);

  const w = Math.min(520, root.clientWidth || 520);
  const h = 360;
  const r = Math.min(w, h) / 2 - 8;

  const svg = d3.select(root)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`);

  const g = svg.append("g")
    .attr("transform", `translate(${w/2}, ${h/2})`);

  const palette = ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f","#edc948","#b07aa1","#ff9da7"];
  const color = d3.scaleOrdinal()
    .domain(data.map(d => d.estado))
    .range(palette);

  const pie = d3.pie().sort(null).value(d => d.cant);
  const arcs = pie(data);
  const maxIdx = d3.maxIndex(arcs, a => a.data.cant);

  const arc = d3.arc().innerRadius(0).outerRadius(r);

  g.selectAll("path")
    .data(arcs)
    .enter()
    .append("path")
    .attr("fill", d => color(d.data.estado))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .attr("d", arc)
    .attr("transform", (d,i) => {
      if(i !== maxIdx) return null;
      const mid = (d.startAngle + d.endAngle) / 2;
      return `translate(${Math.cos(mid)*10},${Math.sin(mid)*10})`;
    });

  const fmtPctLocal = (n) => total ? Math.round((n/total)*100) + "%" : "0%";

  g.selectAll("text")
    .data(arcs)
    .enter()
    .append("text")
    .text(d => fmtPctLocal(d.data.cant))
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-weight", 900)
    .attr("font-size", 26)
    .attr("fill", "white")
    .attr("transform", (d,i) => {
      const c = arc.centroid(d);
      if(i === maxIdx){
        const mid = (d.startAngle + d.endAngle) / 2;
        return `translate(${c[0]+Math.cos(mid)*10},${c[1]+Math.sin(mid)*10})`;
      }
      return `translate(${c[0]},${c[1]})`;
    });

  data.forEach(d => {
    const pct = total ? (d.cant/total*100) : 0;

    const row = document.createElement("div");
    row.className = "legend-item";

    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = color(d.estado);

    const box = document.createElement("div");

    const title = document.createElement("div");
    title.className = "legend-title";
    title.textContent = d.estado;

    const pctEl = document.createElement("div");
    pctEl.className = "legend-pct";
    pctEl.textContent = `${Math.round(pct)}%`;
    pctEl.style.color = color(d.estado);

    const sub = document.createElement("div");
    sub.className = "legend-sub";
    sub.textContent = `${fmtInt(d.cant)} materiales`;

    box.appendChild(title);
    box.appendChild(pctEl);
    box.appendChild(sub);

    row.appendChild(dot);
    row.appendChild(box);

    legend.appendChild(row);
  });
}

function applyAll() {
  const rows = filteredRows();

  const k = calcKPIs(rows);
  safeSetText("kpiMat", fmtInt(k.totalMat));
  safeSetText("kpiDisp", fmtInt(k.dispMat));
  safeSetText("kpiPct", fmtPct(k.pct));

  const e = calcEstados(rows);
  renderPie(e.items, e.total);
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


