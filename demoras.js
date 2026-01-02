/* ============================
   DEMORAS - CONFIG
============================ */
const csvUrl = "DEMORAS.csv";

// candidatos de columnas
const CLIENT_CANDIDATES = ["Cliente", "CLIENTE"];
const MES_CANDIDATES    = ["Mes", "MES", "MES ENTREGA", "MES DE ENTREGA", "MES_SELECCIONADO"];
const FECHA_CANDIDATES  = ["Fecha", "FECHA", "FECHA ENTREGA", "FECHA DE ENTREGA"];

// áreas (se detectan por headers)
const AREA_EXPECTED = [
  "EQUIPOS MENORES",
  "CADENA DE SUMINISTROS",
  "CADENA D' SUMINISTRO",
  "ALMACÉN",
  "ALMACEN",
  "BLEN",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS EQUIPOS MENORES",
  "COMPRAS AGV",
  "COMPRAS EQUIPOS  ",
  "COMPRAS EQUIPOS MENORES  "
];

// motivos (heurística)
const MOTIVO_EXPECTED = [
  "CERCANA CS",
  "LEJANA CS",
  "OBRA CS",
  "CERCANA OBRA",
  "LEJANA OBRA",
  "OBRA OBRA"
];

/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];
let MOTIVO_COLS = [];

let chartMes = null;
let chartAreas = null;
let chartMotivos = null;
let chartAreasResizeBound = false;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "")
  .toString()
  .replace(/^\uFEFF/, "")
  .replace(/\s+/g, " ")
  .trim();

function norm(s) {
  return clean(s)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function isTruthyAreaValue(v) {
  const t = clean(v);
  if (!t) return false;
  if (t === "0") return false;
  const u = norm(t);
  if (["NO", "FALSE"].includes(u)) return false;
  return true;
}

function fmtInt(n) {
  return (Number(n) || 0).toLocaleString("es-AR");
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

function parseCSV(text, delimiter = ";") {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const head = lines[0].split(delimiter).map(clean);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter);
    const obj = {};
    for (let j = 0; j < head.length; j++) obj[head[j]] = clean(parts[j]);
    rows.push(obj);
  }
  return { headers: head, rows };
}

function parseDateAny(v) {
  if (!v) return null;
  const s = clean(v);
  let d = new Date(s);
  if (!isNaN(d)) return d;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]);
    d = new Date(yy, mm, dd);
    if (!isNaN(d)) return d;
  }
  return null;
}

function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthSortKey(mk) {
  if (/^\d{4}-\d{2}$/.test(mk)) {
    const [y, mm] = mk.split("-").map(Number);
    return y * 100 + mm;
  }
  return 0;
}

function getMonthKeyFromRow(r) {
  if (MES_COL && r[MES_COL]) {
    const s = clean(r[MES_COL]);
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = parseDateAny(s);
    if (d) return monthKey(d);
  }
  if (FECHA_COL && r[FECHA_COL]) {
    const d = parseDateAny(r[FECHA_COL]);
    if (d) return monthKey(d);
  }
  return null;
}

/* ============================
   COLUMN DETECTION
============================ */
function detectColumns() {
  const hNorm = headers.map(norm);
  const findCol = (cands) => {
    for (const c of cands) {
      const idx = hNorm.indexOf(norm(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };

  CLIENT_COL = findCol(CLIENT_CANDIDATES);
  MES_COL = findCol(MES_CANDIDATES);
  FECHA_COL = findCol(FECHA_CANDIDATES);

  // Áreas: por lista esperada
  const expectedNorm = new Set(AREA_EXPECTED.map(norm));
  const foundAreas = [];
  for (const h of headers) {
    if (expectedNorm.has(norm(h))) foundAreas.push(h);
  }

  // fallback heurístico si no encontró nada
  if (!foundAreas.length) {
    const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL].filter(Boolean).map(norm));
    AREA_COLS = headers.filter(h => !exclude.has(norm(h)) && /ALMACEN|ALMACÉN|COMPRAS|CADENA|EQUIPOS|BLEN/i.test(h));
  } else {
    AREA_COLS = foundAreas;
  }

  // Motivos
  const motExpected = new Set(MOTIVO_EXPECTED.map(norm));
  const motFound = [];
  for (const h of headers) if (motExpected.has(norm(h))) motFound.push(h);

  if (!motFound.length) {
    const exclude = new Set([CLIENT_COL, MES_COL, FECHA_COL, ...AREA_COLS].filter(Boolean).map(norm));
    MOTIVO_COLS = headers.filter(h => {
      const hn = norm(h);
      if (exclude.has(hn)) return false;
      return hn.includes(" CS") || hn.endsWith("CS") || hn.includes("OBRA") || hn.includes("CERCANA");
    });
  } else {
    MOTIVO_COLS = motFound;
  }
}

/* ============================
   FILTERS
============================ */
function filteredRows() {
  const cliente = document.getElementById("clienteSelect")?.value || "Todos";
  const mes = document.getElementById("mesSelect")?.value || "Todos";

  return data.filter(r => {
    const okCliente = (cliente === "Todos") || (CLIENT_COL && clean(r[CLIENT_COL]) === cliente);
    const mk = getMonthKeyFromRow(r);
    const okMes = (mes === "Todos") || (mk === mes);
    return okCliente && okMes;
  });
}

/* ============================
   AGGREGATIONS
============================ */
function aggByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    if (!mk) continue;
    m.set(mk, (m.get(mk) || 0) + 1);
  }
  const months = [...m.keys()].sort((a, b) => monthSortKey(a) - monthSortKey(b));
  const counts = months.map(k => m.get(k) || 0);
  return { months, counts };
}

function aggAreas(rows) {
  const out = new Map();
  for (const a of AREA_COLS) out.set(a, 0);

  for (const r of rows) {
    for (const a of AREA_COLS) {
      const raw = r[a];
      let v = toNumber(raw);
      if (v > 0) {
        // numérico
      } else if (isTruthyAreaValue(raw)) {
        v = 1; // flag
      } else {
        v = 0;
      }
      if (v) out.set(a, (out.get(a) || 0) + v);
    }
  }
  return out;
}

function topArea(areaMap) {
  let best = null;
  let bestV = -1;
  for (const [k, v] of areaMap.entries()) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return { area: best, value: bestV };
}

/* ============================
   KPIs
============================ */
function updateKPIs() {
  const rows = filteredRows();

  const mesSel = document.getElementById("mesSelect")?.value || "Todos";
  const demMes = (mesSel !== "Todos") ? fmtInt(rows.length) : "-";
  const elMes = document.getElementById("kpiDemorasMes");
  if (elMes) elMes.textContent = demMes;

  const areaMap = aggAreas(rows);
  const total = [...areaMap.values()].reduce((a, b) => a + (b || 0), 0) || 1;
  const t = topArea(areaMap);
  const pct = (t.value || 0) / total;

  const elTop = document.getElementById("kpiTopArea");
  const elSub = document.getElementById("kpiTopAreaSub");
  const elPct = document.getElementById("kpiTopPct");

  if (elTop) elTop.textContent = t.area || "-";
  if (elSub) elSub.textContent = t.area ? `${fmtInt(t.value)} demoras` : "-";
  if (elPct) elPct.textContent = t.area ? (pct * 100).toFixed(1).replace(".", ",") + "%" : "-";
}

/* =========================================================
   ✅✅✅ CAMBIO PRINCIPAL: buildChartMes()
   - barras agrupadas por ÁREA por mes
   - línea “Demoras” total por mes
========================================================= */
function buildChartMes() {
  const rows = filteredRows();

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;

  if (chartMes) chartMes.destroy();

  // meses (ordenados)
  const { months } = aggByMonth(rows);
  if (!months.length) {
    chartMes = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false }
    });
    return;
  }

  // Barras por ÁREA dentro de cada mes
  const byArea = {};
  for (const a of AREA_COLS) byArea[a] = new Array(months.length).fill(0);
  const total = new Array(months.length).fill(0);

  const monthIndex = new Map(months.map((m, i) => [m, i]));

  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    const i = monthIndex.get(mk);
    if (i == null) continue;

    for (const a of AREA_COLS) {
      const raw = r[a];
      let v = toNumber(raw);
      if (v > 0) {
        // numérico
      } else if (isTruthyAreaValue(raw)) {
        // flag
        v = 1;
      } else {
        v = 0;
      }

      if (v) {
        byArea[a][i] += v;
        total[i] += v;
      }
    }
  }

  const areaDatasets = AREA_COLS.map((a) => ({
    type: "bar",
    label: a,
    data: byArea[a],
    borderWidth: 0,
    datalabels: { display: false }
  }));

  // Línea total (se mantiene)
  const lineDataset = {
    type: "line",
    label: "Demoras",
    data: total,
    tension: 0.3,
    pointRadius: 4,
    borderWidth: 3,
    fill: false,
    datalabels: {
      display: true,
      formatter: (v) => (v ? fmtInt(v) : ""),
      anchor: "end",
      align: "top",
      offset: 2
    }
  };

  chartMes = new Chart(canvas.getContext("2d"), {
    data: {
      labels: months,
      datasets: [...areaDatasets, lineDataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          stacked: false,
          grid: { color: "transparent" },
          ticks: { maxRotation: 35, minRotation: 35 }
        },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { enabled: true },
        datalabels: {
          display: (ctx) => (ctx.dataset?.type === "line"),
          formatter: (v) => (v ? fmtInt(v) : "")
        }
      }
    }
  });
}

/* ============================
   CHARTS - ÁREAS / MOTIVOS (ECharts)
   (se dejan como estaban)
============================ */
function buildChartAreas() {
  const rows = filteredRows();
  const mesSel = document.getElementById("mesSelect")?.value || "Todos";
  if (mesSel === "Todos") return;

  const el = document.getElementById("chartAreas");
  if (!el || typeof echarts === "undefined") return;

  const areaMap = aggAreas(rows);
  const items = [...areaMap.entries()].map(([name, value]) => ({ name, value }));
  const total = items.reduce((a, b) => a + (b.value || 0), 0) || 1;

  if (chartAreas) {
    try { chartAreas.dispose(); } catch (e) {}
    chartAreas = null;
  }

  chartAreas = echarts.init(el);

  const option = {
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const pct = (p.value / total) * 100;
        return `${p.name}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
      }
    },
    legend: {
      orient: "vertical",
      left: "65%",
      top: "middle"
    },
    series: [
      {
        name: "Áreas",
        type: "pie",
        radius: ["55%", "75%"],
        center: ["32%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: (p) => {
            const pct = (p.value / total) * 100;
            return `${fmtInt(p.value)} (${pct.toFixed(1).replace(".", ",")}%)`;
          }
        },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: items
      }
    ]
  };

  chartAreas.setOption(option);

  if (!chartAreasResizeBound) {
    window.addEventListener("resize", () => {
      if (chartAreas) chartAreas.resize();
      if (chartMotivos) chartMotivos.resize();
    });
    chartAreasResizeBound = true;
  }
}

function buildChartMotivos() {
  const el = document.getElementById("chartMotivos");
  if (!el || typeof echarts === "undefined") return;

  if (chartMotivos) {
    try { chartMotivos.dispose(); } catch (e) {}
    chartMotivos = null;
  }
  chartMotivos = echarts.init(el);

  // (si ya tenías lógica de motivos, acá queda “placeholder” sin romper)
  chartMotivos.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: { type: "category", data: [] },
    yAxis: { type: "value" },
    series: []
  });
}

function buildTablaDemoras() {
  const tbl = document.getElementById("tablaDemoras");
  if (!tbl) return;

  // tabla simple por mes / área (sumas)
  const rows = filteredRows();
  const { months } = aggByMonth(rows);

  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const sums = {};
  for (const a of AREA_COLS) sums[a] = new Array(months.length).fill(0);

  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    const i = monthIndex.get(mk);
    if (i == null) continue;

    for (const a of AREA_COLS) {
      const raw = r[a];
      let v = toNumber(raw);
      if (v > 0) {} else if (isTruthyAreaValue(raw)) v = 1; else v = 0;
      if (v) sums[a][i] += v;
    }
  }

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Mes</th>
        ${AREA_COLS.map(a => `<th>${a}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${months.map((m, i) => `
        <tr>
          <td>${m}</td>
          ${AREA_COLS.map(a => `<td>${fmtInt(sums[a][i] || 0)}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

/* ============================
   LOAD
============================ */
async function load() {
  try {
    if (window.Chart && window.ChartDataLabels) {
      Chart.register(ChartDataLabels);
    }

    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${csvUrl} (${res.status})`);
    const text = await res.text();

    const parsed = parseCSV(text, ";");
    data = parsed.rows;
    headers = parsed.headers;

    if (!data.length) throw new Error("DEMORAS.csv vacío o sin filas.");

    detectColumns();

    // llenar selects
    const clienteSel = document.getElementById("clienteSelect");
    const mesSel = document.getElementById("mesSelect");

    if (clienteSel && CLIENT_COL) {
      const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      clienteSel.innerHTML = `<option value="Todos">Todos</option>` + clientes.map(c => `<option value="${c}">${c}</option>`).join("");
    } else if (clienteSel) {
      clienteSel.innerHTML = `<option value="Todos">Todos</option>`;
    }

    if (mesSel) {
      const months = [...new Set(data.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a, b) => monthSortKey(a) - monthSortKey(b));
      mesSel.innerHTML = `<option value="Todos">Todos</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
    }

    const clienteHint = document.getElementById("clienteHint");
    if (clienteHint) clienteHint.textContent = `Columna cliente: ${CLIENT_COL || "-"}`;

    const mesHint = document.getElementById("mesHint");
    if (mesHint) mesHint.textContent = `Mes seleccionado: -`;

    const applyAll = () => {
      const mesSelVal = document.getElementById("mesSelect")?.value || "Todos";
      if (mesHint) mesHint.textContent = `Mes seleccionado: ${mesSelVal === "Todos" ? "-" : mesSelVal}`;

      updateKPIs();
      buildChartMes();
      buildChartAreas();
      buildChartMotivos();
      buildTablaDemoras();
    };

    clienteSel?.addEventListener("change", applyAll);
    mesSel?.addEventListener("change", applyAll);

    applyAll();

    const last = document.getElementById("lastUpdate");
    if (last) last.textContent = new Date().toLocaleString("es-AR");

  } catch (e) {
    console.error(e);
    showError("Error cargando DEMORAS: " + (e?.message || e));
  }
}

document.addEventListener("DOMContentLoaded", load);
