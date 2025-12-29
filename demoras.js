/* ============================
   DEMORAS - CONFIG
============================ */
const csvUrl = "DEMORAS.csv";   // OJO: nombre EXACTO del repo
const DELIM = ";";

// candidatos para detectar columnas
const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
const MES_CANDIDATES = ["MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];
const FECHA_CANDIDATES = [
  "FECHA", "Fecha", "FECHA ENTREGA", "Fecha entrega",
  "FECHA ENTREGA ESPERADA", "FECHA ENTREGA OC", "Fecha OC"
];

// áreas “esperadas” (las que me pasaste)
const AREA_EXPECTED = [
  "CADENA DE SUMINISTRO",
  "ALMACEN",
  "ALMACÉN",
  "BLEN",
  "EQUIPOS MENORES",
  "COMPRAS",
  "COMPRAS EQUIPOS",
  "COMPRAS AGV",];


// categorías / motivos (según tu tabla)
const MOTIVO_EXPECTED = [
  "LIBERACION SOLPED CS",
  "COLOCACION OC CS",
  "LIBERACION OC CS",
  "PLAZO DE ENTREGA EXCEDIDO CS",
  "ENTREGA DEL PROVEEDOR CS",
  "REGISTRO DE ALMACENAMIENTO OBRA",
  "FECHA ENTREGA MUY CERCANA",
  "FECHAENTREGAMUYCERCANA" // por si viene sin espacios
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
  .replace(/^\uFEFF/, "")  // quita BOM
  .replace(/\s+/g, " ")
  .trim();

function norm(s) {
  return clean(s)
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin acentos
    .replace(/\s+/g, " ")
    .trim();
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
  // si viene "X" o "SI" o "1" o "2" etc.
  if (["NO", "FALSE"].includes(norm(t))) return false;
  return true;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct01(x) {
  if (!isFinite(x)) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function showError(msg) {
  const el = document.getElementById("msg");
  if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}



/* ============================
   DOWNLOAD (CSV filtrado)
============================ */
function escapeCsvCell(v, delimiter = ";") {
  const s = (v ?? "").toString();
  const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
  const out = s.replace(/"/g, '""');
  return mustQuote ? `"${out}"` : out;
}

function rowsToCsv(rows, delimiter = ";") {
  const head = headers.map(h => escapeCsvCell(h, delimiter)).join(delimiter);
  const lines = rows.map(r => headers.map(h => escapeCsvCell(r[h], delimiter)).join(delimiter));
  return [head, ...lines].join("\n");
}

function downloadFilteredCsv() {
  if (!headers.length || !data.length) return;

  // Aplica filtros actuales: CLIENTE + MES (si MES = "Todos", trae todo)
  const rows = filteredRowsByClienteYMes();

  const cliente = (document.getElementById("clienteSelect")?.value || "Todos").replace(/[^\w\-]+/g, "_");
  const mes = (document.getElementById("mesSelect")?.value || "Todos").replace(/[^\w\-]+/g, "_");

  const csv = rowsToCsv(rows, DELIM);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `DEMORAS_filtrado_${cliente}_${mes}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}
function monthSortKey(m) {
  if (!m) return new Date(0);

  // formato yyyy-mm
  const ym = m.match(/^(\d{4})-(\d{2})$/);
  if (ym) return new Date(+ym[1], +ym[2] - 1, 1);

  // nombres de meses en español
  const meses = {
    "enero": 0, "febrero": 1, "marzo": 2, "abril": 3,
    "mayo": 4, "junio": 5, "julio": 6, "agosto": 7,
    "septiembre": 8, "octubre": 9, "noviembre": 10, "diciembre": 11
  };

  const k = norm(m).toLowerCase();
  if (k in meses) return new Date(2000, meses[k], 1);

  return new Date(0);
}


/* ============================
   DATE / MONTH
============================ */
function parseDateAny(s) {
  const t = clean(s);
  if (!t) return null;

  // dd/mm/yyyy o dd-mm-yyyy
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  // yyyy-mm-dd
  m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeyFromRow(r) {
  // 1) si hay MES explícito
  if (MES_COL) {
    const m = clean(r[MES_COL]);
    // admite "2025-11" o "noviembre" etc → si no es yyyy-mm lo dejamos como texto
    return m || null;
  }
  // 2) si hay FECHA
  if (FECHA_COL) {
    const d = parseDateAny(r[FECHA_COL]);
    return d ? monthKey(d) : null;
  }
  return null;
}

/* ============================
   CSV PARSER (quotes safe)
============================ */
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
   DETECT COLUMNS
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

  // áreas: 1) por lista esperada 2) si no, por heurística
  const expectedNorm = new Set(AREA_EXPECTED.map(norm));
  const found = [];

  for (const h of headers) {
    const hn = norm(h);
    if (expectedNorm.has(hn)) found.push(h);
  }

  // sacamos TOTAL si existe (no la queremos como área en gráficos)
  AREA_COLS = found.filter(c => norm(c) !== "TOTAL");

  // si no encontró nada, fallback: buscar columnas que contengan palabras clave típicas
  if (!AREA_COLS.length) {
    const keys = ["COMPRAS", "ALMACEN", "CADENA", "EQUIPOS", "BLEN", "AGV", "PROYECTO"];
    AREA_COLS = headers.filter(h => keys.some(k => norm(h).includes(k)));
  }

  // motivos/categorías (tabla + dona por mes)
  const motExpected = new Set(MOTIVO_EXPECTED.map(norm));
  const motFound = [];
  for (const h of headers) {
    const hn = norm(h);
    if (motExpected.has(hn)) motFound.push(h);
  }
  // fallback: columnas que incluyan " CS" o "OBRA" o "CERCANA" y que no sean claves ni áreas
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
  const sel = document.getElementById("clienteSelect");
  const c = sel ? sel.value : "";
  if (!c || !CLIENT_COL) return data;
  return data.filter(r => clean(r[CLIENT_COL]) === c);
}

function filteredRowsByClienteYMes() {
  const rows = filteredRows();
  const mes = document.getElementById("mesSelect")?.value || "";
  if (!mes) return rows;
  return rows.filter(r => getMonthKeyFromRow(r) === mes);
}

/* ============================
   SELECTS
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  sel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  if (!CLIENT_COL) return;

  const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
}

function buildMesSelect(rows) {
  const sel = document.getElementById("mesSelect");
  if (!sel) return [];

  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
    .sort((a,b) => monthSortKey(a) - monthSortKey(b));

  const prev = sel.value;

  sel.innerHTML = "";
  // Opción "Todos"
  {
    const oAll = document.createElement("option");
    oAll.value = "";
    oAll.textContent = "Todos";
    sel.appendChild(oAll);
  }
  for (const m of months) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }

  // Si venía "Todos" (""), lo respetamos. Si no, dejamos el último mes.
  sel.value = (prev === "" ? "" : (months.includes(prev) ? prev : (months[months.length - 1] || "")));

  const hint = document.getElementById("mesHint");
  if (hint) hint.textContent = (sel.options.length ? `Mes seleccionado: ${sel.value || "Todos"}` : "Sin meses");

  return months;
}

/* ============================
   AGG CALCS
============================ */
function countDemoras(rows) {
  // 1 fila = 1 pedido con demora
  return rows.length;
}

function aggByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const mk = getMonthKeyFromRow(r);
    if (!mk) continue;
    m.set(mk, (m.get(mk) || 0) + 1);
  }
  const months = [...m.keys()].sort((a,b) => monthSortKey(a) - monthSortKey(b));
  const counts = months.map(k => m.get(k) || 0);
  return { months, counts };
}

function aggAreas(rows) {
  const out = new Map();
  for (const a of AREA_COLS) out.set(a, 0);

  for (const r of rows) {
    for (const a of AREA_COLS) {
      if (isTruthyAreaValue(r[a])) out.set(a, (out.get(a) || 0) + 1);
    }
  }
  return out;
}

function topArea(areaMap) {
  let best = null;
  let bestVal = -1;
  let total = 0;

  for (const [k,v] of areaMap.entries()) {
    total += v;
    if (v > bestVal) { bestVal = v; best = k; }
  }
  return { best, bestVal, total };
}

/* ============================
   KPIs UI
============================ */
function updateKPIs() {
  const rowsMes = filteredRowsByClienteYMes();
  const dem = countDemoras(rowsMes);

  document.getElementById("kpiDemorasMes").textContent = fmtInt(dem);

  const areaMap = aggAreas(rowsMes);
  const t = topArea(areaMap);

  if (!t.best || dem === 0) {
    document.getElementById("kpiTopArea").textContent = "-";
    document.getElementById("kpiTopAreaSub").textContent = "-";
    document.getElementById("kpiTopPct").textContent = "-";
    return;
  }

  // share sobre total de marcas de área
  const pct = t.total ? (t.bestVal / t.total) : NaN;

  document.getElementById("kpiTopArea").textContent = t.best;
  document.getElementById("kpiTopAreaSub").textContent = `Cant: ${fmtInt(t.bestVal)}`;
  document.getElementById("kpiTopPct").textContent = fmtPct01(pct);
}

/* ============================
   CHART DEFAULTS
============================ */
function applyChartDefaults() {
  Chart.register(ChartDataLabels);

  Chart.defaults.color = "#0b1220";
  Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  Chart.defaults.font.weight = "800";

  Chart.defaults.interaction.mode = "index";
  Chart.defaults.interaction.intersect = false;

  Chart.defaults.plugins.tooltip.backgroundColor = "rgba(255,255,255,0.97)";
  Chart.defaults.plugins.tooltip.titleColor = "#0b1220";
  Chart.defaults.plugins.tooltip.bodyColor = "#0b1220";
  Chart.defaults.plugins.tooltip.borderColor = "rgba(2,8,20,.18)";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
}

/* ============================
   CHARTS
============================ */
function buildChartMes() {
  const rows = filteredRows();
  const { months, counts } = aggByMonth(rows);

  const canvas = document.getElementById("chartMes");
  if (!canvas) return;

  if (chartMes) chartMes.destroy();

  chartMes = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Demoras",
          data: counts,
          borderWidth: 0
        },
        {
          type: "line",
          label: "Tendencia",
          data: counts,
          tension: 0,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "transparent" } },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { position: "bottom" },
        datalabels: {
          // ✅ mostrar etiquetas SOLO en las barras (evita duplicado con la línea)
          display: (ctx) => {
            const t = ctx.dataset?.type || ctx.chart?.config?.data?.datasets?.[ctx.datasetIndex]?.type;
            return t !== "line";
          },
          formatter: (v) => (v ? fmtInt(v) : ""),
          anchor: "end",
          align: "end",
          offset: 2
        }
      }
    }
  });
}

function buildChartAreas() {
  // ✅ Migrado a Apache ECharts (sin tocar filtros / KPIs / otros gráficos)
  const el = document.getElementById("chartAreas");
  if (!el || typeof echarts === "undefined") return;

  const rows = filteredRowsByClienteYMes();
  const areaMap = aggAreas(rows);

  const items = [];
  for (const [k, v] of areaMap.entries()) {
    if (!v) continue;
    items.push({ name: k, value: v });
  }

  // sin datos
  if (!items.length) {
    if (chartAreas && typeof chartAreas.dispose === "function") {
      chartAreas.dispose();
      chartAreas = null;
    }
    el.innerHTML = "<div class='hint'>Sin datos para el mes seleccionado.</div>";
    return;
  }

  // (re)crear instancia
  if (chartAreas && typeof chartAreas.dispose === "function") chartAreas.dispose();
  chartAreas = echarts.init(el, null, { renderer: "canvas" });

  const maxVal = Math.max(...items.map(d => d.value));
  const total = items.reduce((a, b) => a + (Number(b.value) || 0), 0) || 1;

  // Paleta fija para que cada categoría tenga color propio (manteniendo rojo para la mayor)
  // Usamos orden estable para que el color de cada área no "salte" entre meses.
  const palette = [
    "#0d6efd", // azul
    "#20c997", // verde agua
    "#ffc107", // amarillo
    "#6f42c1", // violeta
    "#fd7e14", // naranja
    "#198754", // verde
    "#0dcaf0", // cian
    "#6c757d"  // gris
  ];

  const stableNames = [...items.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
  const colorByName = new Map();
  stableNames.forEach((name, i) => colorByName.set(name, palette[i % palette.length]));

  // Datos con color por item (rojo para la mayor)
  const dataWithColors = items.map((it) => {
    const isMax = it.value === maxVal;
    return {
      ...it,
      itemStyle: {
        color: isMax ? "#dc3545" : (colorByName.get(it.name) || "#6c757d")
      }
    };
  });

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
      right: 10,
      top: "middle",
      itemWidth: 18,
      itemHeight: 10,
      formatter: (name) => {
        const it = items.find(x => x.name === name);
        const v = it ? it.value : 0;
        const pct = (v / total) * 100;
        return `${name} - ${pct.toFixed(1).replace(".", ",")}%`;
      }
    },
    series: [
      {
        name: "% demoras por área",
        type: "pie",
        radius: ["62%", "85%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#ffffff",
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: (p) => `${fmtInt(p.value)} (${String(p.percent).replace(".", ",")}%)`,
          fontWeight: 700
        },
        labelLine: { length: 14, length2: 10 },
        data: dataWithColors
      }
    ]
  };

  chartAreas.setOption(option, true);

  // resize (bind una sola vez)
  if (!chartAreasResizeBound) {
    chartAreasResizeBound = true;
    window.addEventListener(
      "resize",
      () => {
        if (chartAreas && typeof chartAreas.resize === "function") chartAreas.resize();
      },
      { passive: true }
    );
  }
}


/* ============================
   MOTIVOS (DONA + TABLA)
============================ */
function getMesRowValue(r) {
  if (MES_COL) return clean(r[MES_COL]);
  if (FECHA_COL) {
    const d = parseDateAny(r[FECHA_COL]);
    if (!d) return "";
    // devolvemos nombre de mes en español
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return meses[d.getMonth()];
  }
  return "";
}

function buildTablaMotivos() {
  const tbl = document.getElementById("tablaMotivos");
  if (!tbl) return;

  const thead = tbl.querySelector("thead");
  const tbody = tbl.querySelector("tbody");
  if (!thead || !tbody) return;

  if (!MOTIVO_COLS.length) {
    thead.innerHTML = "<tr><th>Mes</th></tr>";
    tbody.innerHTML = "";
    return;
  }

  const rows = filteredRows(); // solo por cliente
  const map = new Map(); // mes -> {col: sum}
  for (const r of rows) {
    const mes = getMesRowValue(r);
    if (!mes) continue;
    if (!map.has(mes)) {
      const o = {};
      MOTIVO_COLS.forEach(c => (o[c] = 0));
      map.set(mes, o);
    }
    const acc = map.get(mes);
    for (const c of MOTIVO_COLS) acc[c] += toNumber(r[c]);
  }

  const meses = [...map.keys()].sort((a,b) => monthSortKey(a) - monthSortKey(b));

  // ✅ colgroup para que TODAS las columnas queden del mismo ancho
  // (evita la barra horizontal y mantiene el layout estable)
  const totalCols = 1 + MOTIVO_COLS.length;
  const w = (100 / Math.max(totalCols, 1)).toFixed(4) + "%";
  const prevCg = tbl.querySelector("colgroup");
  if (prevCg) prevCg.remove();
  const cg = document.createElement("colgroup");
  for (let i = 0; i < totalCols; i++) {
    const col = document.createElement("col");
    col.style.width = w;
    cg.appendChild(col);
  }
  tbl.prepend(cg);

  // header
  const ths = ["<th>Mes</th>"].concat(MOTIVO_COLS.map(c => `<th>${clean(c)}</th>`));
  thead.innerHTML = `<tr>${ths.join("")}</tr>`;

  // rows
  const lines = [];
  for (const m of meses) {
    const obj = map.get(m);
    const tds = [`<td>${clean(m)}</td>`].concat(
      MOTIVO_COLS.map(c => {
        const v = obj ? (obj[c] || 0) : 0;
        return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
      })
    );
    lines.push(`<tr>${tds.join("")}</tr>`);
  }
  tbody.innerHTML = lines.join("");

  // heatmap por fila sobre motivos
  applyHeatmapPorFilaGeneric(tbl);
}

function buildChartMotivos() {
  const el = document.getElementById("chartMotivos");
  if (!el || typeof echarts === "undefined") return;

  const rows = filteredRowsByClienteYMes();
  if (!rows.length || !MOTIVO_COLS.length) {
    if (chartMotivos) { chartMotivos.dispose(); chartMotivos = null; }
    el.innerHTML = "";
    return;
  }

  const sums = MOTIVO_COLS.map(c => ({ name: clean(c), value: rows.reduce((a,r)=>a+toNumber(r[c]),0) }))
    .filter(x => x.value > 0);

  const total = sums.reduce((a,x)=>a+x.value,0) || 1;

  const palette = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f",
    "#bcbd22","#17becf"
  ];

  // resaltar el mayor en rojo
  let maxIdx = -1, maxVal = -Infinity;
  sums.forEach((s,i)=>{ if (s.value > maxVal){ maxVal=s.value; maxIdx=i; }});

  const dataPie = sums.map((s,i)=>({
    ...s,
    itemStyle: i===maxIdx ? { color: "#e03131" } : { color: palette[i % palette.length] }
  }));

  if (!chartMotivos) chartMotivos = echarts.init(el);

  chartMotivos.setOption({
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        const pct = total ? (p.value/total*100) : 0;
        return `${p.name}<br><b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
      }
    },
    legend: {
      orient: "vertical",
      right: 10,
      top: "middle",
      textStyle: { fontSize: 12 }
    },
    series: [{
      type: "pie",
      radius: ["55%","75%"],
      center: ["40%","50%"],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: (p) => `${fmtInt(p.value)} (${String(p.percent).replace(".", ",")}%)`
      },
      labelLine: { length: 10, length2: 8 },
      data: dataPie
    }]
  }, true);

  chartMotivos.resize();
}

// heatmap genérico (tabla ya armada con td.td-num)
function applyHeatmapPorFilaGeneric(tbl) {
  const trs = Array.from(tbl.querySelectorAll("tbody tr"));
  trs.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll("td.td-num"));
    const vals = cells.map(td => Number(td.dataset.v ?? 0));
    if (!vals.length) return;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;
    cells.forEach((td, i) => {
      const v = vals[i];
      const t = range === 0 ? 0 : (v - min) / range;
      td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");
      td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
      td.style.fontWeight = t >= 0.85 ? "800" : "600";
    });
  });
}


/* ============================
   TABLE
============================ */
function buildTabla() {
  const rows = filteredRows();
  const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
  .sort((a,b) => monthSortKey(a) - monthSortKey(b));

  const thead = document.querySelector("#tablaAreas thead");
  const tbody = document.querySelector("#tablaAreas tbody");
  if (!thead || !tbody) return;

  // header
  const cols = ["Mes", ...AREA_COLS];
  thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

  // body
  const lines = [];
  for (const m of months) {
    const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
    const areaMap = aggAreas(rowsM);

    const tds = [
      `<td class="td-strong">${m}</td>`,
      ...AREA_COLS.map(a => {
        const v = areaMap.get(a) || 0;
        return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
      })
    ];
    lines.push(`<tr>${tds.join("")}</tr>`);
  }

  tbody.innerHTML = lines.join("");
  applyHeatmapPorFila(); // ✅ se aplica al final, cuando la tabla ya existe
}

/* ============================
   APPLY ALL
============================ */
function applyAll() {
  const rows = filteredRows();
  buildMesSelect(rows);

  updateKPIs();
  buildChartMes();
  buildChartAreas();
  buildChartMotivos();
  buildTablaMotivos();
  buildTabla();
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
  applyChartDefaults();

  // fecha “hoy” en header
  const d = new Date();
  document.getElementById("lastUpdate").textContent =
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

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
      detectColumns();

      if (!CLIENT_COL) {
        showError("No encontré columna CLIENTE/OBRA/ALMACÉN. Probé: " + CLIENT_CANDIDATES.join(" / "));
        return;
      }

      // MES_COL o FECHA_COL (al menos uno)
      if (!MES_COL && !FECHA_COL) {
        showError(
          "No encontré MES ni FECHA para armar el eje temporal. Probé MES: " +
          MES_CANDIDATES.join(" / ") + " | FECHA: " + FECHA_CANDIDATES.join(" / ")
        );
        return;
      }

      if (!AREA_COLS.length) {
        showError("No pude detectar columnas de ÁREA. Asegurate de tener columnas como: " + AREA_EXPECTED.join(", "));
        return;
      }

      data = m.slice(1).map(row => {
        const o = {};
        headers.forEach((h, i) => (o[h] = clean(row[i])));
        return o;
      });

      document.getElementById("clienteHint").textContent = `Columna cliente: ${CLIENT_COL}`;

      renderClientes();
      applyAll();

      // Descargar CSV con todas las columnas según filtros actuales
      document.getElementById("btnDownloadFiltrado")?.addEventListener("click", downloadFilteredCsv);

      document.getElementById("clienteSelect")?.addEventListener("change", applyAll);
      document.getElementById("mesSelect")?.addEventListener("change", () => {
        updateKPIs();
        buildChartAreas();
        buildChartMotivos();
      });
    })
    .catch(err => {
      console.error(err);
      showError("Error cargando CSV. Revisá el nombre del archivo y que esté en la raíz del repo.");
    });
});


/* =========================================================
   HEATMAP (POR FILA / POR MES) — blanco → naranja → rojo
   - En cada fila, el mínimo queda blanco y el máximo rojo.
========================================================= */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRGB(c1, c2, t) {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

// blanco -> naranja -> rojo
function heatColorWhiteOrangeRed(t) {
  t = Math.max(0, Math.min(1, t));

  const WHITE  = [255, 255, 255];
  const ORANGE = [255, 165, 0];   // naranja
  const RED    = [220, 53, 69];   // rojo (similar bootstrap danger)

  if (t <= 0.5) {
    return mixRGB(WHITE, ORANGE, t / 0.5);
  }
  return mixRGB(ORANGE, RED, (t - 0.5) / 0.5);
}

function applyHeatmapPorFila() {
  const trs = document.querySelectorAll("#tablaAreas tbody tr");

  trs.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll("td.td-num"));
    const vals = cells.map(td => Number(td.dataset.v ?? 0));
    if (!vals.length) return;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    cells.forEach((td, i) => {
      const v = vals[i];
      const t = range === 0 ? 0 : (v - min) / range;

      // ✅ fondo heatmap
      td.style.setProperty("background-color", heatColorWhiteOrangeRed(t), "important");

      // ✅ texto: blanco si está muy “alto” (zona roja)
      td.style.setProperty("color", t >= 0.72 ? "#ffffff" : "#0b1220", "important");
      td.style.fontWeight = t >= 0.85 ? "800" : "600";
    });
  });
}