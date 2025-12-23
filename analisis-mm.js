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

let chartDonut = null;

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
  const canvas = document.getElementById("donutEstados");
  if (!canvas) return;

  const labels = items.map(x => x.estado);
  const values = items.map(x => x.qty);

  if (chartDonut) chartDonut.destroy();

  Chart.register(ChartDataLabels);

  // "Explode" la porción más grande (similar a la imagen de referencia)
  let maxIdx = 0;
  values.forEach((v, i) => { if (v > (values[maxIdx] ?? -Infinity)) maxIdx = i; });
  const offsets = values.map((_, i) => (i === maxIdx ? 14 : 0));

  chartDonut = new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        offset: offsets,
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 10 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.parsed || 0;
              const p = total ? v / total : 0;
              return ` ${c.label}: ${fmtInt(v)} (${fmtPct(p)})`;
            }
          }
        },
        datalabels: {
          color: "#ffffff",
          clip: true,
          formatter: (v) => {
            if (!total) return "";
            const p = v / total;
            if (p < 0.06) return ""; // porciones chicas: sin texto
            return Math.round(p * 100) + "%";
          },
          font: (ctx) => {
            const w = ctx.chart.width || 400;
            const size = Math.max(14, Math.min(22, Math.round(w / 22)));
            return { weight: "1000", size };
          }
        }
      }
    }
  });

  // Leyenda tipo "callouts" (label + % grande + detalle)
  const legend = document.getElementById("donutLegend");
  if (!legend) return;

  legend.innerHTML = "";
  items.forEach((it, i) => {
    const p = total ? it.qty / total : 0;

    const card = document.createElement("div");
    card.className = "legend-card";

    const bar = document.createElement("div");
    bar.className = "legend-bar";

    // color real del dataset (generado por Chart.js Colors plugin)
    const color = chartDonut.getDatasetMeta(0).data[i]?.options?.backgroundColor;
    if (color) bar.style.background = color;

    const body = document.createElement("div");

    const title = document.createElement("div");
    title.className = "legend-title";
    title.textContent = it.estado;

    const pct = document.createElement("div");
    pct.className = "legend-pct";
    pct.textContent = Math.round(p * 100) + "%";
    if (color) pct.style.color = color;

    const sub = document.createElement("div");
    sub.className = "legend-sub";
    sub.textContent = `${fmtInt(it.qty)} (${fmtPct(p)})`;

    body.appendChild(title);
    body.appendChild(pct);
    body.appendChild(sub);

    card.appendChild(bar);
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
  renderEstadosTable(e.items, e.total);
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


