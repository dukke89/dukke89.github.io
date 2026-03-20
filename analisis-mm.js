/* ============================
   CONFIG
============================ */
const csvUrl = "./ANALISIS-MM.csv";
const DELIM = ";";

// Descargas por Estado (archivos existentes en el repo)
// Si querés cambiar nombres, editá solo este objeto:
const ESTADO_DOWNLOAD_FILES = {
  1: "STO NULO.csv",           // 01 - Stock nulo
  2: "MENOR AL PP.csv",        // 02 - Menor a Punto de Pedido (si existe)
  3: "MAYOR AL PP.csv",        // 03 - Mayor a Punto de Pedido (si existe)
  4: "MAYOR STOCK MAX.csv"     // 04 - Mayor a Stock Máximo (si existe)
};

// columnas (con candidatos por si cambian mayúsculas/acentos)
const CLIENT_CANDIDATES = ["ALMACEN", "Almacén", "Almacen", "ALMACÉN", "Cliente", "CLIENTE", "CLIENTE (ALMACEN)"];
const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM", "Codigo Item", "CODIGOITEM"];
const LIBRE_CANDIDATES = ["Libre utilización", "Libre utilizacion", "LIBRE UTILIZACION", "Libre Utilizacion", "Libre utilización ", "Libre utilizacion "];
const ESTADO_CANDIDATES = ["Estado", "ESTADO", "Id Estado", "ID ESTADO", "IdEstado", "IDESTADO", "Id_Estado", "id estado", "Estado Item", "ESTADO ITEM"];

// columnas para tabla "Valorización de stock" (pueden venir con mayúsculas/acentos/espacios)
const RUBRO_CANDIDATES = ["Rubro", "RUBRO", "Rubro "];
const VALOR_CANDIDATES = [
  "Valor libre utilización",
  "Valor libre utilizacion",
  "VALOR LIBRE UTILIZACION",
  "Valor Libre Utilización",
  "Valor Libre utilizacion",
  "Valor libre utilización ",
  "Valor libre utilizacion "
];

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
function normalizeHeaderName(s) {
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

function parseMoney(v) {
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

function getSelectedClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return [];
  enforceAllOption(sel);
  const vals = [...sel.selectedOptions].map(o => o.value);
  if (!vals.length) return [];
  if (vals.includes("__ALL__")) return [];
  return vals.filter(v => v && v !== "__ALL__");
}


function filteredRows() {
  const selected = getSelectedClientes();
  if (!selected || !selected.length) return data; // Todos
  const set = new Set(selected);
  return data.filter(r => set.has(clean(r[COL_CLIENT])));
}
/* ============================
   UI: CLIENTES
============================ */
function renderClientes() {
  const sel = document.getElementById("clienteSelect");
  if (!sel) return;

  const prev = new Set([...sel.selectedOptions].map(o => o.value));

  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = "Todos";
  sel.appendChild(optAll);

  const clientes = [...new Set(data.map(r => clean(r[COL_CLIENT])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  for (const c of clientes) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    if (prev.has(c)) o.selected = true;
    sel.appendChild(o);
  }

  // default: Todos si no había selección previa válida
  const hasPrevValid = [...prev].some(v => v && v !== "__ALL__");
  if (!hasPrevValid) {
    optAll.selected = true;
  } else {
    enforceAllOption(sel);
  }

  sel.addEventListener("change", (e) => {
    enforceAllOption(e.target);
    applyAll();
  });
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
    try { chartDonut.dispose(); } catch (e) { }
    chartDonut = null;
  }

  // Orden de leyenda/series: si el nombre viene con prefijo "01-", "02-", etc.
  // respetar 01 arriba -> 04 abajo (y luego el resto). Si no hay prefijo, mantiene por qty (ya viene ordenado en calcEstados).
  const getPrefixNum = (name) => {
    const m = String(name || "").trim().match(/^\s*(\d{1,2})\s*[-.:_\s]/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  const orderedItems = [...items].sort((a, b) => {
    const pa = getPrefixNum(a.estado);
    const pb = getPrefixNum(b.estado);
    if (pa !== pb) return pa - pb;
    return (b.qty || 0) - (a.qty || 0);
  });

  // paleta base + forzar "Stock nulo" rojo
  const palette = [
    "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9",
    "#10b981", "#a3a3a3", "#eab308", "#14b8a6", "#fb7185"
  ];
  const norm = (s) => normalizeHeaderName(s);
  const normLoose = (s) => norm(s)
    .replace(/^[0-9]+\s*[-.:_\s]*/g, "")   // quita prefijo "01-" etc.
    .replace(/[_\-\s]+/g, " ")
    .trim();

  const isStockNulo = (name) => {
    const n = normLoose(name);
    const t = normLoose("Stock nulo");
    return n === t;
  };
  const colorByName = {};
  let palIdx = 0;
  orderedItems.forEach(it => {
    if (isStockNulo(it.estado)) colorByName[it.estado] = "#ef4444";
    else {
      colorByName[it.estado] = palette[palIdx % palette.length];
      palIdx++;
    }
  });

  const seriesData = orderedItems.map(it => {
    const isSN = isStockNulo(it.estado);
    return ({
      name: it.estado,
      value: it.qty,
      itemStyle: { color: colorByName[it.estado] },
      // forzar estilos en etiqueta y línea SOLO para Stock nulo
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
          // evita amontonar: oculta etiquetas muy chicas
          // if (pct < 3) return ""; // Se comenta para mostrar TODAS las etiquetas
          return `${p.name}
${pct.toFixed(0)}%`;
        },
        fontWeight: 950,
        fontSize: 12,
        color: "#0b1220"
      },
      labelLine: { show: true, length: 14, length2: 10 },
      emphasis: {
        scale: true,
        scaleSize: 8,
        itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 2, shadowColor: "rgba(0,0,0,.25)" }
      },
      data: seriesData
    }]
  });

  // leyenda tipo "callouts"
  orderedItems.forEach((it) => {
    const p = total ? it.qty / total : 0;
    const pct = (p * 100).toFixed(0) + "%";
    const c = colorByName[it.estado] || "#2d6cdf";

    const card = document.createElement("div");
    card.className = "callout";
    if (typeof isStockNulo === "function" && isStockNulo(it.estado)) card.classList.add("is-stock-nulo");

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

    // Botón de descarga a la derecha (01 a 04)
    const mPref = String(it.estado || "").trim().match(/^\s*(\d{1,2})\s*[-.:_\s]/);
    const prefNum = mPref ? Number(mPref[1]) : null;
    const labelByPref = (n) => {
      if (n === 1) return "Stock nulo";
      if (n === 2) return "Menor al PP";
      if (n === 3) return "Mayor al PP";
      if (n === 4) return "Mayor Stock Max";
      return null;
    };
    const btnLabel = labelByPref(prefNum);
    const fileName = (prefNum && ESTADO_DOWNLOAD_FILES) ? ESTADO_DOWNLOAD_FILES[prefNum] : null;

    if (btnLabel && fileName) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `⬇ ${btnLabel}`;

      // estilos mínimos para no tocar CSS global
      btn.style.marginLeft = "auto";
      btn.style.height = "28px";
      btn.style.padding = "0 6px";
      btn.style.borderRadius = "8px";
      btn.style.border = "2px solid rgba(2,8,20,.35)";
      btn.style.background = "#fff";
      btn.style.fontWeight = "900";
      btn.style.fontSize = "11px";
      btn.style.cursor = "pointer";
      btn.style.whiteSpace = "nowrap";
      // Ajuste pedido: ancho fijo pero más reducido (antes 160px)
      btn.style.minWidth = "125px";
      btn.style.textAlign = "center";
      btn.style.justifyContent = "center";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        // 01 Stock nulo: queda estático. 02/03/04: se filtra desde ANALISIS-MM.csv por columna ESTADO.
        if (prefNum === 1) {
          downloadStaticFile(fileName);
        } else {
          downloadByEstadoValue(it.estado, fileName);
        }
      });

      card.appendChild(btn);
    }

    legend.appendChild(card);
  });

  const onResize = () => { try { chartDonut && chartDonut.resize(); } catch (e) { } };
  window.addEventListener("resize", onResize, { passive: true });
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
  document.getElementById("btnDLBaseMM")?.addEventListener("click", () => downloadFilteredBaseMM());
  // ✅ Botón al lado del filtro: descarga filas con Rubro = "?", "OBSOLETO", "OTROS" o vacío (según filtros)
  document.getElementById("btnDLStoNuloPP")?.addEventListener("click", () => downloadSinRubro());
  // Delegación de eventos: asegura que los botones funcionen siempre
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest && ev.target.closest("button");
    if (!t) return;
    if (t.id === "btnDLStockNulo") return downloadByKind("stock_nulo");
    if (t.id === "btnDLMenorPP") return downloadByKind("menor_pp");
    if (t.id === "btnDLMayorStockMax") return downloadByKind("mayor_stock_max");
  });

  // fecha (manual) arriba
  safeSetText("lastUpdate", (window.LAST_UPDATE || "").toString().trim() || "--/--/----");
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

      document.getElementById("btnReset")?.addEventListener("click", () => {

        if (sel) sel.value = "";
        applyAll();
      });
    })
    .catch(err => {
      console.error(err);
      showError(`Error cargando ${csvUrl}. Revisá el nombre EXACTO y que esté en la raíz del repo.`);
    });
});



function buildValorizacionStock(rows) {
  const table = document.getElementById("tablaValorizacion");
  if (!table) return;

  // Detecta encabezados reales del CSV (soporta acentos/mayúsculas/espacios)
  const colRubro = byFirstExisting(RUBRO_CANDIDATES);
  const colValor = byFirstExisting(VALOR_CANDIDATES);

  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  // Si no existen columnas, no rompe la página: muestra error y limpia tabla
  if (!colRubro || !colValor) {
    tbody.innerHTML = "";
    const valTotal = document.getElementById("valTotal");
    if (valTotal) valTotal.textContent = "";
    showError(
      `No pude armar la tabla <b>Valorización de stock</b> porque no encontré columnas en ${csvUrl}: ` +
      `${!colRubro ? "<b>Rubro</b>" : ""}${(!colRubro && !colValor) ? " y " : ""}${!colValor ? "<b>Valor libre utilización</b>" : ""}.<br>` +
      `Encabezados detectados: ${headers.join(" · ")}`
    );
    return;
  }

  const agg = new Map();
  rows.forEach(r => {
    const rub = (r[colRubro] || "").trim();
    if (!rub) return;
    const val = parseMoney(r[colValor]);
    agg.set(rub, (agg.get(rub) || 0) + (isFinite(val) ? val : 0));
  });

  const data = Array.from(agg.entries())
    .map(([rubro, valor]) => ({ rubro, valor }))
    .sort((a, b) => b.valor - a.valor);

  const total = data.reduce((s, d) => s + d.valor, 0);
  let acc = 0;

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

    // Resaltar rubros: ?, OBSOLETO, OTROS o vacío
    const rubKey = (d.rubro ?? "").toString().trim().toUpperCase();
    if (!rubKey || rubKey === "?" || rubKey === "OBSOLETO" || rubKey === "OTROS") {
      const tdRubro = tr.querySelector("td");
      if (tdRubro) tdRubro.classList.add("rubro-alert");
    }

    tbody.appendChild(tr);
  });

  const valTotal = document.getElementById("valTotal");
  if (valTotal) valTotal.textContent = `$ ${fmtMoney(total)}`;
}


function downloadStaticFile(filename) {
  const a = document.createElement("a");
  a.href = filename;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ============================
   DOWNLOAD: BASE MM (filtrada)
============================ */
function downloadFilteredBaseMM() {
  if (!headers || !headers.length || !data || !data.length) {
    showError("Todavía no se cargó el archivo ANALISIS-MM.csv.");
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    showError("No hay filas para descargar según el filtro actual.");
    return;
  }

  const csvText = toDelimitedCSV(headers, rows, DELIM);

  // Nombre de archivo descriptivo
  const sel = getSelectedClientes();
  const label = (sel.length === 0 || sel.length > 2) ? "FILTRADO" : sel.join("_");
  const filename = `BASE_MM_${label}.csv`;

  downloadTextFile(csvText, filename);
}

/* ============================
   DOWNLOAD: SIN RUBRO (filtrado)
============================ */
function downloadSinRubro() {
  // Asegura que el CSV ya se cargó y que existen headers
  if (!headers || !headers.length || !data || !data.length) {
    showError("Todavía no se cargó el archivo ANALISIS-MM.csv. Intentá nuevamente en unos segundos.");
    return;
  }

  const colRubro = byFirstExisting(RUBRO_CANDIDATES);
  if (!colRubro) {
    showError(
      `No pude descargar <b>SIN RUBRO</b> porque no encontré la columna <b>Rubro</b> en ${csvUrl}.<br>` +
      `Encabezados detectados: ${headers.join(" · ")}`
    );
    return;
  }

  const rows = filteredRows();
  const out = rows.filter(r => {
    const rub = clean(r[colRubro]);
    const key = rub.trim().toUpperCase();
    return (key === "" || key === "?" || key === "OBSOLETO" || key === "OTROS");
  });

  if (!out.length) {
    showError("No hay filas para descargar con RUBRO vacío / ? / OBSOLETO / OTROS (según el filtro actual).");
    return;
  }

  const csvText = toDelimitedCSV(headers, out, DELIM);
  downloadTextFile(csvText, "SIN RUBRO.csv");
}

function toDelimitedCSV(headerList, rowsObj, delimiter) {
  const esc = (val) => {
    const s = (val ?? "").toString();
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
    const q = s.replace(/"/g, '""');
    return mustQuote ? `"${q}"` : q;
  };

  const lines = [];
  lines.push(headerList.map(esc).join(delimiter));

  for (const r of rowsObj) {
    lines.push(headerList.map(h => esc(r[h])).join(delimiter));
  }
  return lines.join("\n");
}

function downloadTextFile(text, filename) {
  // BOM para Excel (acentos/ñ) + evitar revocar URL demasiado rápido
  const content = "﻿" + (text ?? "");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "descarga.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// === DESCARGA POR ESTADO (FILTRADA DESDE ANALISIS-MM.csv) ===
function downloadByEstadoValue(estadoExacto, filename) {
  if (!headers || !headers.length || !data || !data.length) {
    showError("Todavía no se cargó el archivo ANALISIS-MM.csv.");
    return;
  }
  const rows = filteredRows();
  const wanted = normalizeHeaderName(estadoExacto);
  const out = rows.filter(r => normalizeHeaderName(r[COL_ESTADO]) === wanted);

  if (!out.length) {
    showError(`No hay filas para descargar para el estado: ${estadoExacto}`);
    return;
  }
  const csvText = toDelimitedCSV(headers, out, DELIM);
  downloadTextFile(csvText, filename);
}
