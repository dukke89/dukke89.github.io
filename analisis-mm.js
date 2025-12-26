/* ============================
   CONFIG
============================ */
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

// columnas (con candidatos por si cambian mayúsculas/acentos)
const CLIENT_CANDIDATES = ["ALMACEN", "Almacén", "Almacen"];
const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM"];
const LIBRE_CANDIDATES = ["Libre utilización", "Libre utilizacion", "LIBRE UTILIZACION", "Libre Utilizacion"];
const ESTADO_CANDIDATES = ["Estado", "ESTADO", "Id Estado", "ID ESTADO", "IdEstado"];

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
  return candidates.find(c => headers.includes(c)) || null;
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
  // D3 pie (nítido + "explode" en el mayor) + leyenda tipo callout
  if (!host || typeof d3 === "undefined") return;

  host.innerHTML = "";

  const maxW = 560;
  const W = Math.min(maxW, host.clientWidth || maxW);
  const H = W;
  const R = Math.floor(W / 2);

  const svg = d3.select(host)
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img");

  const g = svg.append("g")
    .attr("transform", `translate(${W/2},${H/2})`);

  const palette = ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f","#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ab"];
  const color = d3.scaleOrdinal()
    .domain(items.map(d => d.estado))
    .range(palette);

  const pie = d3.pie()
    .sort(null)
    .value(d => d.qty);

  const arcs = pie(items);
  const maxIdx = d3.maxIndex(arcs, d => d.value);

  const arc = d3.arc()
    .innerRadius(0)
    .outerRadius(R - 8);

  // slices
  g.selectAll("path")
    .data(arcs)
    .join("path")
    .attr("d", d => arc(d))
    .attr("fill", d => color(d.data.estado))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .attr("transform", (d, i) => {
      if (i !== maxIdx) return null;
      const [cx, cy] = arc.centroid(d);
      const len = Math.hypot(cx, cy) || 1;
      const k = 14; // explode
      return `translate(${(cx/len)*k}, ${(cy/len)*k})`;
    });

  // percent labels inside
  const labelArc = d3.arc().innerRadius(R * 0.55).outerRadius(R * 0.55);

  g.selectAll("text")
    .data(arcs)
    .join("text")
    .attr("transform", d => `translate(${labelArc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-weight", 900)
    .style("font-size", "30px")
    .style("fill", "white")
    .style("paint-order", "stroke")
    .style("stroke", "rgba(0,0,0,.25)")
    .style("stroke-width", "2px")
    .text(d => {
      if (!total) return "";
      const p = d.value / total;
      if (p < 0.06) return "";
      return Math.round(p * 100) + "%";
    });

  // Legend (callouts)
  const legend = document.getElementById("donutLegend");
  if (!legend) return;

  legend.innerHTML = "";
  items.forEach((it) => {
    const p = total ? it.qty / total : 0;

    const card = document.createElement("div");
    card.className = "legend-card";

    const top = document.createElement("div");
    top.className = "legend-top";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = color(it.estado);

    const titleWrap = document.createElement("div");

    const title = document.createElement("div");
    title.className = "legend-title";
    title.textContent = it.estado;

    const pct = document.createElement("div");
    pct.className = "legend-pct";
    pct.style.color = color(it.estado);
    pct.textContent = Math.round(p * 100) + "%";

    const sub = document.createElement("div");
    sub.className = "legend-sub";
    sub.textContent = `${fmtInt(it.qty)} materiales`;

    titleWrap.appendChild(title);
    titleWrap.appendChild(pct);
    titleWrap.appendChild(sub);

    top.appendChild(dot);
    top.appendChild(titleWrap);
    card.appendChild(top);

    legend.appendChild(card);
  });
}
          }
        },
        datalabels: {
          formatter: (v) => {
            if (!total) return "";
            const p = v / total;
            if (p < 0.06) return ""; // no ensuciar con porciones chicas
            return (p * 100).toFixed(0) + "%";
          },
          font: { weight: "900" }
        }
      }
    }
  });

  // leyenda simple
  const legend = document.getElementById("donutLegend");
  if (!legend) return;

  legend.innerHTML = "";
  items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "legend-row";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    // color real del dataset
    const color = chartDonut.getDatasetMeta(0).data[i]?.options?.backgroundColor;
    if (color) dot.style.background = color;

    const txt = document.createElement("span");
    const p = total ? it.qty / total : 0;
    txt.textContent = `${it.estado} · ${fmtInt(it.qty)} (${fmtPct(p)})`;

    row.appendChild(dot);
    row.appendChild(txt);
    legend.appendChild(row);
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
  // tabla removida
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


