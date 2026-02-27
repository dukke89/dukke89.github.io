/* ============================
   DEMORAS - CONFIG
============================ */
const csvUrl = "DEMORAS.csv";   // OJO: nombre EXACTO del repo
const DELIM = ";";

// candidatos para detectar columnas
const CLIENT_CANDIDATES = ["CLIENTE", "CLIENTE / OBRA", "CLIENTE NRO.", "OBRA", "ALMACEN", "ALMACÉN"];
// filtro "CLASIFICACIÓN" en Demoras (columna: CARACTER DE GC)
const GC_CANDIDATES = ["CARACTER DE GC", "CARÁCTER DE GC", "CARACTER GC", "CARACTER_DE_GC", "CARACTER"];

// CAMBIO REALIZADO: Se agregó "AÑOMES" y "AñoMes" al principio para priorizar tu nueva columna
const MES_CANDIDATES = ["AÑOMES", "AñoMes", "MES", "Mes", "MES ENTREGA", "MES DE ENTREGA"];

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

const MONTH_NAMES = {
    "01": "ENERO",
    "02": "FEBRERO",
    "03": "MARZO",
    "04": "ABRIL",
    "05": "MAYO",
    "06": "JUNIO",
    "07": "JULIO",
    "08": "AGOSTO",
    "09": "SEPTIEMBRE",
    "10": "OCTUBRE",
    "11": "NOVIEMBRE",
    "12": "DICIEMBRE"
};


/* ============================
   GLOBAL
============================ */
let data = [];
let headers = [];

let CLIENT_COL = null;
let GC_COL = null;
let MES_COL = null;
let FECHA_COL = null;
let AREA_COLS = [];
let MOTIVO_COLS = [];

let chartMes = null;
let chartAreas = null;
let chartMotivos = null;
let chartEvolution = null;
let chartEvolutionResizeBound = false;
let chartAreasResizeBound = false;
let chartMesResizeBound = false;

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "")
    .toString()
    .replace(/^\uFEFF/, "")  // quita BOM
    .replace(/\s+/g, " ")
    .trim();

function norm(s) {
    return clean(s)
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin acentos
        .replace(/\s+/g, " ")
        .trim();
}

// Función para mapear nombres de áreas a su versión de visualización
function getDisplayName(name) {
    const normalized = norm(name);
    if (normalized === norm("CADENA DE SUMINISTRO")) {
        return "PROYECTO";
    }
    return name;
}

function enforceAllOption(sel) {
    if (!sel) return;
    const allOpt = [...sel.options].find(o => o.value === "__ALL__");
    if (!allOpt) return;

    const selected = [...sel.selectedOptions].map(o => o.value);
    if (selected.includes("__ALL__") && selected.length > 1) {
        [...sel.options].forEach(o => { o.selected = (o.value === "__ALL__"); });
        return;
    }
    if (!selected.length) {
        allOpt.selected = true;
    } else if (!selected.includes("__ALL__")) {
        allOpt.selected = false;
    }
}

function getSelValues(id) {
    const sel = document.getElementById(id);
    if (!sel) return [];
    enforceAllOption(sel);
    const vals = [...sel.selectedOptions].map(o => o.value);
    if (!vals.length) return [];
    if (vals.includes("__ALL__")) return [];
    return vals.filter(v => v !== "");
}

function selLabel(id) {
    const v = getSelValues(id);
    return v.length ? v.join("-") : "Todos";
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

    const cliente = selLabel("clienteSelect").replace(/[^\w\-]+/g, "_");
    const mes = selLabel("mesSelect").replace(/[^\w\-]+/g, "_");

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

// CAMBIO REALIZADO: Se mejoró para que entienda el formato 2025-01 directamente
function monthSortKey(m) {
    if (!m) return new Date(0);

    // formato yyyy-mm (Tu nueva columna AñoMes)
    const ym = m.match(/^(\d{4})-(\d{2})$/);
    if (ym) return new Date(+ym[1], +ym[2] - 1, 1);

    // nombres de meses en español (Para compatibilidad con el resto del código)
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

    // dd/mm/yyyy o dd-mm/yyyy
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

// CAMBIO REALIZADO: Se simplificó para que tome el valor de la columna AñoMes (MES_COL) de forma directa
function getMonthKeyFromRow(r) {
    // 1) si hay MES explícito (Ahora encontrará AñoMes gracias a MES_CANDIDATES)
    if (MES_COL) {
        const m = clean(r[MES_COL]);
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
    GC_COL = findCol(GC_CANDIDATES);
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
    let rows = data;

    // FILTRO GLOBAL: Excluir EQUIPOS MENORES de todos los cálculos
    if (GC_COL) {
        rows = rows.filter(r => {
            const clasif = norm(clean(r[GC_COL]));
            return clasif !== norm("EQUIPOS MENORES");
        });
    }

    // CLIENTE
    const cs = getSelValues("clienteSelect");
    if (cs.length && CLIENT_COL) {
        const set = new Set(cs);
        rows = rows.filter(r => set.has(clean(r[CLIENT_COL])));
    }

    // CLASIFICACIÓN (CARACTER DE GC) - ya filtrado EQUIPOS MENORES arriba
    const gcs = getSelValues("clasif2Select");
    if (gcs.length && GC_COL) {
        const set = new Set(gcs);
        rows = rows.filter(r => set.has(clean(r[GC_COL])));
    }

    return rows;
}
function filteredRowsByClienteYMes() {
    const rows = filteredRows();
    const ms = getSelValues("mesSelect");
    if (!ms.length) return rows;
    const set = new Set(ms);
    return rows.filter(r => set.has(getMonthKeyFromRow(r)));
}


/* ============================
   SELECTS
============================ */
function renderClientes() {
    const sel = document.getElementById("clienteSelect");
    if (!sel) return;

    // asegurar opción "Todos"
    if (!sel.querySelector("option[value='__ALL__']")) {
        const optAll = document.createElement("option");
        optAll.value = "__ALL__";
        optAll.textContent = "Todos";
        sel.appendChild(optAll);
    }

    const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

    // limpiar dejando "Todos"
    sel.querySelectorAll("option:not([value='__ALL__'])").forEach(o => o.remove());

    if (!CLIENT_COL) return;

    const clientes = [...new Set(data.map(r => clean(r[CLIENT_COL])).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es"));

    for (const c of clientes) {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        if (prevSet.has(c)) o.selected = true;
        sel.appendChild(o);
    }

    // si no hay selección previa válida, dejar "Todos"
    enforceAllOption(sel);
}


function renderGC(rowsBase = null) {
    const sel = document.getElementById("clasif2Select");
    const hint = document.getElementById("clasif2Hint");
    if (!sel) return;

    if (!GC_COL) {
        if (hint) hint.textContent = "Columna: (no encontrada)";
        sel.disabled = true;
        sel.innerHTML = "<option value='__ALL__'>Todos</option>";
        return;
    }

    if (hint) hint.textContent = `Columna: ${GC_COL}`;
    sel.disabled = false;

    // filas base para poblar opciones (por defecto: filtradas por CLIENTE)
    const base = rowsBase || (function () {
        const cs = getSelValues("clienteSelect");
        if (!cs.length || !CLIENT_COL) return data;
        const set = new Set(cs);
        return data.filter(r => set.has(clean(r[CLIENT_COL])));
    })();

    const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

    sel.innerHTML = "";
    const oAll = document.createElement("option");
    oAll.value = "__ALL__";
    oAll.textContent = "Todos";
    sel.appendChild(oAll);

    const vals = [...new Set(base.map(r => clean(r[GC_COL])).filter(Boolean))]
        .filter(v => norm(v) !== norm("EQUIPOS MENORES")) // Excluir EQUIPOS MENORES
        .sort((a, b) => a.localeCompare(b, "es"));

    for (const v of vals) {
        const o = document.createElement("option");
        o.value = v;
        // Reemplazar "PAÑOL" por "ALMACÉN" en la visualización
        const displayText = norm(v) === norm("PAÑOL") ? "ALMACÉN" : v;
        o.textContent = displayText;
        if (prevSet.has(v)) o.selected = true;
        sel.appendChild(o);
    }

    enforceAllOption(sel);
}

function buildMesSelect(rows) {
    const sel = document.getElementById("mesSelect");
    if (!sel) return [];

    const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a, b) => monthSortKey(a) - monthSortKey(b));

    const prevSet = new Set([...sel.selectedOptions].map(o => o.value));

    sel.innerHTML = "";

    // Opción "Todos"
    const oAll = document.createElement("option");
    oAll.value = "__ALL__";
    oAll.textContent = "Todos";
    sel.appendChild(oAll);

    for (const m of months) {
        const o = document.createElement("option");
        o.value = m;

        // Formatear visualización: "2025-01" -> "ENERO 2025"
        let displayText = m;
        const parts = m.split("-");
        if (parts.length === 2) {
            const [year, monthNum] = parts;
            const name = MONTH_NAMES[monthNum];
            if (name) displayText = `${name} ${year}`;
        }

        o.textContent = displayText;
        if (prevSet.has(m)) o.selected = true;
        sel.appendChild(o);
    }

    // default: último mes (mantener comportamiento anterior) si no hay selección previa válida
    const hasPrevValid = [...prevSet].some(v => v && v !== "__ALL__" && months.includes(v));
    if (!hasPrevValid && months.length) {
        const last = months[months.length - 1];
        const optLast = [...sel.options].find(o => o.value === last);
        if (optLast) optLast.selected = true;
    }

    enforceAllOption(sel);
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
    const months = [...m.keys()].sort((a, b) => monthSortKey(a) - monthSortKey(b));
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

    for (const [k, v] of areaMap.entries()) {
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
    // ✅ ACTUALIZADO: Etiquetas "tuneadas" (fondo, resalte max) y Scroll tipo PAN
    const el = document.getElementById("chartMes");
    if (!el || typeof echarts === "undefined") return;

    const rows = filteredRows();
    let months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a, b) => monthSortKey(a) - monthSortKey(b));

    if (!months.length || !AREA_COLS.length) {
        if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
        el.innerHTML = "<div class='hint'>Sin datos para graficar.</div>";
        return;
    }

    // Pre-calcular totales y máximos por mes
    // maxByMonth[mes] = { maxVal: 0, seriesName: "" }
    const montlyTotals = new Map();
    const maxByMonth = new Map();

    months.forEach(m => {
        const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
        let sum = 0;
        let maxVal = -1;
        let maxArea = "";
        const mp = aggAreas(rowsM);

        for (const [area, v] of mp.entries()) {
            sum += v;
            if (v > maxVal) {
                maxVal = v;
                maxArea = area;
            }
        }
        montlyTotals.set(m, sum);
        maxByMonth.set(m, { val: maxVal, area: maxArea });
    });

    // Paleta de colores base (SIN rojo)
    const basePalette = [
        "#0d6efd", // azul
        "#20c997", // verde agua
        "#ffc107", // amarillo
        "#6f42c1", // violeta
        "#fd7e14", // naranja
        "#198754", // verde
        "#0dcaf0", // cian
        "#6c757d"  // gris
    ];

    // Mapeo estable de colores por nombre de área
    // Ordenamos nombres alfabéticamente para consistencia
    const sortedNames = [...AREA_COLS].sort();
    const colorMap = new Map();
    sortedNames.forEach((name, i) => {
        colorMap.set(name, basePalette[i % basePalette.length]);
    });

    // Excluir EQUIPOS MENORES de las series del gráfico
    const visibleAreas = AREA_COLS.filter(area => norm(area) !== norm("EQUIPOS MENORES"));

    const seriesBars = visibleAreas.map((areaName) => ({
        name: getDisplayName(areaName),
        type: "bar",
        itemStyle: {
            color: colorMap.get(areaName) // Color base para la leyenda y barras normales
        },
        barGap: '10%',
        barCategoryGap: '30%',
        data: months.map(m => {
            const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
            const mp = aggAreas(rowsM);
            const val = mp.get(areaName) || 0;

            const monMax = maxByMonth.get(m);
            const isMax = (monMax && monMax.area === areaName && val > 0);

            const areaColor = colorMap.get(areaName);

            return {
                value: val,
                month: m,
                isMax: isMax,
                area: areaName,
                itemStyle: {
                    // Si es el MAX del mes, ROJO. Si no, su color de área.
                    color: isMax ? "#dc3545" : areaColor
                }
            };
        }),
        label: {
            show: true,
            rotate: 90,
            align: 'left',
            verticalAlign: 'middle',
            position: 'insideBottom',
            distance: 12,
            formatter: (params) => {
                const v = params.value;
                if (!v) return "";
                const d = params.data;
                const total = montlyTotals.get(d.month) || 0;
                const pct = total ? ((v / total) * 100).toFixed(1).replace('.', ',') + '%' : '0%';

                if (d.isMax) {
                    return `{max|${v} - ${pct} - ${getDisplayName(params.seriesName)}}`;
                }
                return ` {norm|${v} - ${pct} - ${getDisplayName(params.seriesName)}} `;
            },
            rich: {
                max: {
                    color: '#fff',
                    backgroundColor: '#dc3545', // Rojo intenso para coincidir con background
                    padding: [4, 6],
                    borderRadius: 4,
                    fontWeight: 800,
                    fontSize: 11,
                    shadowBlur: 2,
                    shadowColor: 'rgba(0,0,0,0.3)'
                },
                norm: {
                    color: '#000',
                    backgroundColor: 'rgba(255,255,255, 0.85)',
                    padding: [3, 4],
                    borderRadius: 3,
                    fontWeight: 700,
                    fontSize: 10,
                    borderColor: 'rgba(0,0,0,0.1)',
                    borderWidth: 1
                }
            }
        }
    }));

    if (chartMes && typeof chartMes.dispose === "function") { chartMes.dispose(); chartMes = null; }
    chartMes = echarts.init(el, null, { renderer: "canvas" });

    const option = {
        // Quitamos 'color' global porque definimos por item
        tooltip: {
            trigger: "item",
            formatter: (p) => {
                const m = p.data.month;
                const total = montlyTotals.get(m) || 0;
                const pct = total ? ((p.value / total) * 100).toFixed(1) + '%' : '-';
                return `<b>${p.seriesName}</b><br/>
                Mes: ${m}<br/>
                Cantidad: <b>${p.value}</b> (${pct})`;
            }
        },
        legend: { bottom: 0, type: "scroll", textStyle: { fontWeight: 600 } },
        grid: {
            left: 50, right: 30, top: 30, bottom: 85,
            containLabel: true
        },
        dataZoom: [
            {
                type: 'slider',
                show: true,
                xAxisIndex: 0,
                startValue: 0,
                endValue: 4,
                bottom: 40,
                height: 22,
                zoomLock: true,
                brushSelect: false
            },
            {
                type: 'inside',
                xAxisIndex: 0,
                zoomOnMouseWheel: false,
                moveOnMouseWheel: true
            }
        ],
        xAxis: {
            type: "category",
            data: months,
            axisLabel: { fontWeight: 700, interval: 0 },
            axisTick: { alignWithLabel: true }
        },
        yAxis: { type: "value", splitLine: { lineStyle: { type: 'dashed' } } },
        series: seriesBars
    };

    chartMes.setOption(option, true);

    if (!chartMesResizeBound) {
        chartMesResizeBound = true;
        window.addEventListener("resize", () => {
            if (chartMes) chartMes.resize();
        }, { passive: true });
    }
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
        "#6c757d"  // gris
    ];

    const stableNames = [...items.map(x => x.name)].sort((a, b) => a.localeCompare(b, "es"));
    const colorByName = new Map();
    stableNames.forEach((name, i) => colorByName.set(name, palette[i % palette.length]));

    // Datos con color por item (rojo para la mayor)
    const dataWithColors = items.map((it) => {
        const isMax = it.value === maxVal;
        const baseColor = colorByName.get(it.name) || "#6c757d";
        return {
            ...it,
            itemStyle: {
                color: isMax ? "#dc3545" : baseColor,
                borderWidth: isMax ? 4 : 2,
                shadowBlur: isMax ? 14 : 0,
                shadowColor: isMax ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0)"
            }
        };
    });
    const option = {
        tooltip: {
            trigger: "item",
            formatter: (p) => {
                const pct = (p.value / total) * 100;
                return `${getDisplayName(p.name)}: <b>${fmtInt(p.value)}</b> (${pct.toFixed(1).replace(".", ",")}%)`;
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
                return `${getDisplayName(name)} - ${pct.toFixed(1).replace(".", ",")}%`;
            }
        },
        series: [
            {
                name: "% demoras por área",
                type: "pie",
                radius: ["55%", "75%"], // Un poco más chico para dejar espacio a labels
                center: ["35%", "50%"],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderColor: "#ffffff",
                    borderWidth: 2
                },
                label: {
                    show: true,
                    position: 'outside',
                    formatter: (p) => {
                        // Label externo con línea guía
                        return `${getDisplayName(p.name)}\n${fmtInt(p.value)} (${String(p.percent).replace(".", ",")}%)`;
                    },
                    fontWeight: 700,
                    lineHeight: 14
                },
                labelLine: {
                    show: true,
                    length: 15,
                    length2: 10
                },
                data: (() => {
                    // USAR LA MISMA PALETA QUE EL GRÁFICO DE BARRAS
                    const basePalette = [
                        "#0d6efd", // azul
                        "#20c997", // verde agua
                        "#ffc107", // amarillo
                        "#6f42c1", // violeta
                        "#fd7e14", // naranja
                        "#198754", // verde
                        "#0dcaf0", // cian
                        "#6c757d"  // gris
                    ];

                    // IMPORTANTE: Usar AREA_COLS ordenado alfabéticamente (igual que en barras)
                    const globalSortedNames = [...AREA_COLS].sort();

                    const sortedVals = [...items].sort((a, b) => b.value - a.value);
                    const maxVal = sortedVals[0]?.value || 0;

                    return items.map((it) => {
                        const isMax = (it.value === maxVal && it.value > 0);

                        // Buscar índice en la lista GLOBAL de áreas
                        const idx = globalSortedNames.indexOf(it.name);
                        // Asignar color basado en el índice global
                        let finalColor = basePalette[idx % basePalette.length];

                        // ROJO solo para el máximo
                        if (isMax) {
                            finalColor = "#dc3545";
                        }

                        return {
                            ...it,
                            itemStyle: {
                                color: finalColor,
                                // Resalte adicional para el max
                                borderWidth: isMax ? 3 : 2,
                                borderColor: '#ffffff',
                                shadowBlur: isMax ? 10 : 0,
                                shadowColor: isMax ? "rgba(0,0,0,0.25)" : "transparent"
                            }
                        };
                    });
                })()
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
function buildChartEvolution() {
    const el = document.getElementById("chartEvolution");
    if (!el || typeof echarts === "undefined") return;

    const rows = filteredRows();
    let months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a, b) => monthSortKey(a) - monthSortKey(b));

    if (!months.length || !AREA_COLS.length) {
        if (chartEvolution && typeof chartEvolution.dispose === "function") {
            chartEvolution.dispose();
            chartEvolution = null;
        }
        el.innerHTML = "<div class='hint'>Sin datos para graficar evolución.</div>";
        return;
    }

    // pre-calcular mapa de datos por área y mes
    const dataMap = new Map();
    AREA_COLS.forEach(area => {
        dataMap.set(area, new Map());
    });

    rows.forEach(r => {
        const mk = getMonthKeyFromRow(r);
        if (!mk) return;
        AREA_COLS.forEach(area => {
            if (isTruthyAreaValue(r[area])) {
                const areaMonths = dataMap.get(area);
                areaMonths.set(mk, (areaMonths.get(mk) || 0) + 1);
            }
        });
    });

    // Detectar el máximo de cada mes para la "alerta"
    const monthlyMax = new Map();
    const visibleAreas = AREA_COLS.filter(area => norm(area) !== norm("EQUIPOS MENORES"));

    months.forEach(m => {
        let maxVal = -1;
        visibleAreas.forEach(area => {
            const v = dataMap.get(area).get(m) || 0;
            if (v > maxVal) maxVal = v;
        });
        monthlyMax.set(m, maxVal);
    });

    const basePalette = [
        "#0d6efd", "#20c997", "#ffc107", "#6f42c1", "#fd7e14",
        "#198754", "#0dcaf0", "#6c757d"
    ];

    const sortedNames = [...AREA_COLS].sort();
    const colorMap = new Map();
    sortedNames.forEach((name, i) => {
        colorMap.set(name, basePalette[i % basePalette.length]);
    });

    const series = visibleAreas.map(area => ({
        name: getDisplayName(area),
        type: "line",
        smooth: true,
        symbolSize: 8,
        itemStyle: { color: colorMap.get(area) },
        lineStyle: { width: 3 },
        label: {
            show: true,
            position: 'top',
            formatter: (p) => p.value > 0 ? p.value : '',
            fontWeight: 600
        },
        data: months.map(m => {
            const val = dataMap.get(area).get(m) || 0;
            const isMaxMonth = (val === monthlyMax.get(m) && val > 0);
            return {
                value: val,
                symbol: isMaxMonth ? 'pin' : 'circle',
                symbolSize: isMaxMonth ? 16 : 8,
                label: {
                    show: true,
                    formatter: val > 0 ? val : '',
                    backgroundColor: isMaxMonth ? '#dc3545' : 'transparent',
                    color: isMaxMonth ? '#fff' : colorMap.get(area),
                    padding: isMaxMonth ? [2, 4] : 0,
                    borderRadius: 3,
                    fontWeight: isMaxMonth ? 800 : 600,
                    fontSize: isMaxMonth ? 12 : 11
                }
            };
        })
    }));

    if (chartEvolution && typeof chartEvolution.dispose === "function") chartEvolution.dispose();
    chartEvolution = echarts.init(el, null, { renderer: "canvas" });

    const option = {
        title: {
            text: 'Máximos mensuales destacados con pin rojo',
            left: 'center',
            top: 0,
            textStyle: { fontSize: 12, color: '#666', fontWeight: 'normal' }
        },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: 'cross' }
        },
        legend: { bottom: 0, type: "scroll", textStyle: { fontWeight: 600 } },
        grid: {
            left: 50, right: 30, top: 40, bottom: 60,
            containLabel: true
        },
        xAxis: {
            type: "category",
            data: months,
            axisLabel: { fontWeight: 700 }
        },
        yAxis: { type: "value", splitLine: { lineStyle: { type: 'dashed' } } },
        series: series
    };

    chartEvolution.setOption(option, true);

    if (!chartEvolutionResizeBound) {
        chartEvolutionResizeBound = true;
        window.addEventListener("resize", () => {
            if (chartEvolution) chartEvolution.resize();
        }, { passive: true });
    }
}

function getMesRowValue(r) {
    if (MES_COL) return clean(r[MES_COL]);
    if (FECHA_COL) {
        const d = parseDateAny(r[FECHA_COL]);
        if (!d) return "";
        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
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

    const rows = filteredRows();
    const map = new Map();
    for (const r of rows) {
        const mes = getMesRowValue(r);
        if (!mes) continue;
        if (!map.has(mes)) {
            const o = {};
            MOTIVO_COLS.forEach(c => (o[c] = 0));
            map.set(mes, o);
        }
        const acc = map.get(mes);
        for (const c of MOTIVO_COLS) {
            if (toNumber(r[c]) > 0) acc[c] += 1;
        }
    }

    const meses = [...map.keys()].sort((a, b) => monthSortKey(a) - monthSortKey(b));
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

    const ths = ["<th>Mes</th>"].concat(MOTIVO_COLS.map(c => `<th>${clean(c)}</th>`));
    thead.innerHTML = `<tr>${ths.join("")}</tr>`;

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
    applyHeatmapPorFilaGeneric(tbl);
}

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

function buildTabla() {
    const rows = filteredRows();
    const months = [...new Set(rows.map(getMonthKeyFromRow).filter(Boolean))]
        .sort((a, b) => monthSortKey(a) - monthSortKey(b));

    const thead = document.querySelector("#tablaAreas thead");
    const tbody = document.querySelector("#tablaAreas tbody");
    if (!thead || !tbody) return;

    const visibleAreas = AREA_COLS.filter(area => norm(area) !== norm("EQUIPOS MENORES"));
    const cols = ["Mes", ...visibleAreas.map(getDisplayName)];
    thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

    const lines = [];
    for (const m of months) {
        const rowsM = rows.filter(r => getMonthKeyFromRow(r) === m);
        const areaMap = aggAreas(rowsM);
        const tds = [
            `<td class="td-strong">${m}</td>`,
            ...visibleAreas.map(a => {
                const v = areaMap.get(a) || 0;
                return `<td class="td-num" data-v="${v}">${fmtInt(v)}</td>`;
            })
        ];
        lines.push(`<tr>${tds.join("")}</tr>`);
    }
    tbody.innerHTML = lines.join("");
    applyHeatmapPorFila();
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
    buildChartEvolution();
    buildTablaMotivos();
    buildTabla();
}

/* ============================
   INIT
============================ */
window.addEventListener("DOMContentLoaded", () => {
    applyChartDefaults();

    // fecha (manual) en header
    const _lu = (window.LAST_UPDATE || "").toString().trim();
    const _elLU = document.getElementById("lastUpdate");
    if (_elLU) _elLU.textContent = _lu || "--/--/----";
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
            renderGC();
            applyAll();

            // Descargar CSV con todas las columnas según filtros actuales
            document.getElementById("btnDownloadFiltrado")?.addEventListener("click", downloadFilteredCsv);

            document.getElementById("clienteSelect")?.addEventListener("change", (e) => { enforceAllOption(e.target); renderGC(); applyAll(); });
            document.getElementById("clasif2Select")?.addEventListener("change", (e) => { enforceAllOption(e.target); applyAll(); });
            document.getElementById("mesSelect")?.addEventListener("change", (e) => {
                enforceAllOption(e.target);
                updateKPIs();
                buildChartAreas();
                buildChartMotivos();
                buildTablaMotivos();
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

    const WHITE = [255, 255, 255];
    const ORANGE = [255, 165, 0];   // naranja
    const RED = [220, 53, 69];   // rojo (similar bootstrap danger)

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
