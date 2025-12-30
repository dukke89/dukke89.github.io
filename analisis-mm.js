/* ============================
   CONFIG
=========================== */

const CSV_PATH = "ANALISIS-MM.csv";
const DELIM = ";";

// Columnas posibles (tolerantes a variantes)
const CLIENT_CANDIDATES  = ["ALMACEN", "Cliente", "CLIENTE", "OBRA", "CENTRO"];
const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM", "Codigo Item", "CODIGO"];
const LIBRE_CANDIDATES   = ["Libre utilizacion", "Libre utilización", "LIBRE UTILIZACION", "LIBRE UTILIZACIÓN", "LIBRE", "Libre"];
const ESTADO_CANDIDATES  = ["Estado", "ESTADO", "estado"];

// 👇 Para valorización real (tu segunda imagen)
const RUBRO_CANDIDATES   = ["RUBRO", "Rubro", "rubro", "CLASIFICACION", "CLASIFICACIÓN"];
const VALOR_CANDIDATES   = [
  "Valor libre utilización", "Valor libre utilizacion",
  "VALOR LIBRE UTILIZACION", "VALOR LIBRE UTILIZACIÓN",
  "VALOR", "Valor"
];

let headers = [];
let dataRows = [];

let COL_CLIENT = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

let COL_RUBRO = null;
let COL_VALOR = null;

let chartDonut = null;

/* ============================
   HELPERS
=========================== */

function normLoose(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
}

function clean(s) {
  return String(s ?? "").trim();
}

function safeSetText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtInt(n) {
  const v = Number(n);
  if (!isFinite(v)) return "-";
  return Math.round(v).toLocaleString("es-AR");
}

function fmtMoney(n) {
  const v = Number(n);
  if (!isFinite(v)) return "-";
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(p) {
  const v = Number(p);
  if (!isFinite(v)) return "-";
  return (v * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="alert alert-error">${msg}</div>`;
}

function showInfo(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="alert alert-info">${msg}</div>`;
}

function byFirstExisting(cands) {
  const hnorm = headers.map(h => normLoose(h));
  for (const c of cands) {
    const i = hnorm.indexOf(normLoose(c));
    if (i >= 0) return headers[i];
  }
  return null;
}

function parseDelimited(text, delim) {
  const lines = text.split(/\r?\n/).filter(x => x.trim() !== "");
  return lines.map(line => line.split(delim));
}

// ✅ num parser robusto: soporta "$ 1.234.567,89", espacios, etc.
function toNum(val) {
  let s = String(val ?? "").trim();
  if (!s) return NaN;

  // deja solo dígitos, separadores y signo
  s = s.replace(/[^0-9,.\-]/g, "");

  // Caso AR: 1.234.567,89  -> 1234567.89
  // Caso simple: 1234,56 -> 1234.56
  // Caso US: 1234.56 -> 1234.56 (no tocamos)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // asumimos puntos miles y coma decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // coma decimal
    s = s.replace(",", ".");
  } else {
    // dot decimal o entero: dejamos
  }

  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

/* ============================
   FILTERS
=========================== */

function getSelectedClient() {
  const sel = document.getElementById("clienteSelect");
  return sel ? clean(sel.value) : "";
}

function filteredRows() {
  const c = getSelectedClient();
  if (!c) return dataRows;
  return dataRows.filter(r => clean(r[COL_CLIENT]) === c);
}

/* ============================
   KPIs
=========================== */

function calcKPIs(rows) {
  const mats = new Set();
  const disp = new Set();

  for (const r of rows) {
    const mat = clean(r[COL_MATERIAL]);
    if (!mat) continue;
    mats.add(mat);

    const libre = toNum(r[COL_LIBRE]);
    if (isFinite(libre) && libre > 0) disp.add(mat);
  }

  const totalMat = mats.size;
  const dispMat = disp.size;
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

  // ✅ Orden por prefijo numérico 01..04
  const prefNum = (s) => {
    const m = String(s || "").trim().match(/^\s*(\d{1,3})\b/);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };
  items.sort((a, b) => {
    const na = prefNum(a.estado);
    const nb = prefNum(b.estado);
    if (na !== nb) return na - nb;
    return String(a.estado).localeCompare(String(b.estado), "es", { sensitivity: "base" });
  });

  const total = items.reduce((s, x) => s + x.qty, 0);
  return { items, total };
}

/* ============================
   RENDER: DONA + LEYENDA
=========================== */

function buildDonut(items, total) {
  if (!window.echarts) return;

  const host = document.getElementById("donutEstados");
  const legend = document.getElementById("donutLegend");
  if (!host || !legend) return;

  legend.innerHTML = "";

  if (!items.length) {
    host.innerHTML = "";
    legend.innerHTML = `<div class="hint">Sin datos para mostrar.</div>`;
    return;
  }

  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#22c55e", "#f97316", "#64748b"];
  const isStockNulo = (name) => normLoose(name) === normLoose("01-STOCK NULO") || normLoose(name) === normLoose("Stock nulo");

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
        const pct = total ? (v / total) * 100 : 0;
        return `<b>${p.name}</b><br/>${fmtInt(v)} materiales<br/>${pct.toFixed(2)}%`;
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
        }
      },
      labelLine: { length: 12, length2: 10 },
      data: seriesData
    }]
  });

  // ✅ leyenda custom ordenada (items ya viene ordenado 01..04)
  items.forEach(it => {
    const c = colorByName[it.estado] || "#64748b";

    const card = document.createElement("div");
    card.className = "legend-card";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = c;

    const body = document.createElement("div");
    body.className = "legend-body";

    const title = document.createElement("div");
    title.className = "legend-title";
    title.textContent = it.estado;

    const pct = total ? ((it.qty / total) * 100).toFixed(0) + "%" : "-";

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
   VALORIZACIÓN STOCK (TABLA REAL)
   - Usa RUBRO + Valor libre utilización (como tu 2da imagen)
=========================== */

function buildValorizacionStock(rows) {
  const table = document.getElementById("tablaValorizacion");
  if (!table) return;

  const tb = table.querySelector("tbody");
  if (!tb) return;

  tb.innerHTML = "";

  // Si no existen columnas, no rompemos nada: dejamos la tabla vacía con un hint
  if (!COL_RUBRO || !COL_VALOR) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.innerHTML = `<span class="hint">No encuentro columnas de valorización (RUBRO / Valor libre utilización).</span>`;
    tr.appendChild(td);
    tb.appendChild(tr);
    safeSetText("valTotal", "-");
    return;
  }

  // Agrupar por rubro sumando valor
  const map = new Map();
  let total = 0;

  for (const r of rows) {
    const rubro = clean(r[COL_RUBRO]) || "(Sin rubro)";
    const v = toNum(r[COL_VALOR]);
    if (!isFinite(v)) continue;
    total += v;
    map.set(rubro, (map.get(rubro) || 0) + v);
  }

  const items = [...map.entries()].map(([rubro, val]) => ({ rubro, val }));
  items.sort((a, b) => b.val - a.val);

  let acum = 0;
  for (const it of items) {
    const pct = total ? it.val / total : 0;
    acum += pct;

    const tr = document.createElement("tr");

    const tdR = document.createElement("td");
    tdR.textContent = it.rubro;

    const tdV = document.createElement("td");
    tdV.className = "num";
    tdV.textContent = fmtMoney(it.val);

    const tdP = document.createElement("td");
    tdP.className = "num";
    tdP.textContent = (pct * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

    const tdA = document.createElement("td");
    tdA.className = "num";
    tdA.textContent = (acum * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

    tr.appendChild(tdR);
    tr.appendChild(tdV);
    tr.appendChild(tdP);
    tr.appendChild(tdA);

    tb.appendChild(tr);
  }

  safeSetText("valTotal", fmtMoney(total));
}

/* ============================
   APPLY ALL
=========================== */

function applyAll() {
  const rows = filteredRows();

  const k = calcKPIs(rows);
  safeSetText("kpiMat", fmtInt(k.totalMat));
  safeSetText("kpiDisp", fmtInt(k.dispMat));
  safeSetText("kpiPct", fmtPct(k.pct));

  const e = calcEstados(rows);
  buildDonut(e.items, e.total);

  // ✅ tabla como antes
  buildValorizacionStock(rows);
}

/* ============================
   INIT
=========================== */

window.addEventListener("DOMContentLoaded", () => {
  safeSetText("mmSourceName", CSV_PATH);

  fetch(CSV_PATH, { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error(`No se pudo leer ${CSV_PATH} (HTTP ${r.status})`);
      const lm = r.headers.get("last-modified");
      if (lm) {
        try {
          const d = new Date(lm);
          safeSetText("lastUpdate", d.toLocaleDateString("es-AR"));
        } catch(e) {}
      }
      return r.text();
    })
    .then(text => {
      const m = parseDelimited(text, DELIM);
      if (!m.length || m.length < 2) {
        showError("El CSV está vacío o no tiene filas.");
        return;
      }

      headers = m[0].map(clean);

      COL_CLIENT  = byFirstExisting(CLIENT_CANDIDATES);
      COL_MATERIAL = byFirstExisting(MATERIAL_CANDIDATES);
      COL_LIBRE   = byFirstExisting(LIBRE_CANDIDATES);
      COL_ESTADO  = byFirstExisting(ESTADO_CANDIDATES);

      // ✅ columnas valorización (tu tabla)
      COL_RUBRO   = byFirstExisting(RUBRO_CANDIDATES);
      COL_VALOR   = byFirstExisting(VALOR_CANDIDATES);

      if (!COL_CLIENT || !COL_MATERIAL || !COL_LIBRE || !COL_ESTADO) {
        showError(
          `No encuentro columnas necesarias.<br>
          CLIENTE: ${COL_CLIENT || "NO"} · MATERIAL: ${COL_MATERIAL || "NO"} · LIBRE: ${COL_LIBRE || "NO"} · ESTADO: ${COL_ESTADO || "NO"}`
        );
        return;
      }

      safeSetText("clienteHint", `Columna cliente: ${COL_CLIENT}`);

      dataRows = [];
      for (let i = 1; i < m.length; i++) {
        const row = m[i];
        const obj = {};
        headers.forEach((h, idx) => obj[h] = row[idx] ?? "");
        dataRows.push(obj);
      }

      // Selector clientes
      const sel = document.getElementById("clienteSelect");
      if (sel) {
        const uniq = new Set();
        dataRows.forEach(r => {
          const v = clean(r[COL_CLIENT]);
          if (v) uniq.add(v);
        });

        const list = [...uniq].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
        sel.innerHTML = `<option value="">Todos</option>` + list.map(v => `<option value="${v}">${v}</option>`).join("");
        sel.addEventListener("change", () => applyAll());
      }

      showInfo("Datos cargados.");
      applyAll();
    })
    .catch(err => {
      console.error(err);
      showError(err.message || String(err));
    });
});

