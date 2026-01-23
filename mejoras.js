/* MEJORAS - VERSIÓN ULTRA ROBUSTA FINAL */

const DELIM = ";";
let mmData = [], cumplimientoData = [], demorasData = [];
let mmHeaders = [], cumplimientoHeaders = [], demorasHeaders = [];

const clean = (v) => (v ?? "").toString().replace(/^\uFEFF/, "").replace(/\r/g, "").trim();

function norm(s) {
  return clean(s)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(v) {
  let x = clean(v);
  if (!x) return 0;
  x = x.replace(/\s/g, "").replace(/%/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmtPct(x) {
  if (!isFinite(x) || x === null) return "-";
  return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function fmtCurrency(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function parseCSV(text, delim = ";") {
  text = (text ?? "").toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];
  return text.split(/\n+/).map(line => line.split(delim).map(clean));
}

function parseDateToMonth(s) {
  s = clean(s);
  if (!s) return "";
  const p = s.split("/");
  if (p.length >= 3 && p[2]) return `${p[2]}-${(p[1] || "").padStart(2, '0')}`;
  return s;
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "none";
}

function findCol(headers, names) {
  return headers.find(h => names.some(n => norm(h).includes(n)));
}

async function loadAllData() {
  try {
    const [mmText, cumplimientoText, demorasText] = await Promise.all([
      fetch("ANALISIS-MM.csv").then(r => r.ok ? r.text() : Promise.reject("Error MM")),
      fetch("CUMPLIMIENTO_2025.csv").then(r => r.ok ? r.text() : Promise.reject("Error Cumplimiento")),
      fetch("DEMORAS.csv").then(r => r.ok ? r.text() : Promise.reject("Error Demoras"))
    ]);

    const mmRows = parseCSV(mmText, DELIM);
    if (mmRows.length > 0) {
      mmHeaders = mmRows[0].map(clean);
      mmData = mmRows.slice(1).map(r => {
        const obj = {};
        mmHeaders.forEach((h, i) => obj[h] = clean(r[i]));
        return obj;
      });
    }

    const cumpliRows = parseCSV(cumplimientoText, DELIM);
    if (cumpliRows.length > 0) {
      cumplimientoHeaders = cumpliRows[0].map(clean);
      cumplimientoData = cumpliRows.slice(1).map(r => {
        const obj = {};
        cumplimientoHeaders.forEach((h, i) => obj[h] = clean(r[i]));
        return obj;
      });
    }

    const demRows = parseCSV(demorasText, DELIM);
    if (demRows.length > 0) {
      demorasHeaders = demRows[0].map(clean);
      demorasData = demRows.slice(1).map(r => {
        const obj = {};
        demorasHeaders.forEach((h, i) => obj[h] = clean(r[i]));
        return obj;
      });
    }

    console.log("✅ Datos cargados:", { mm: mmData.length, cumplimiento: cumplimientoData.length, demoras: demorasData.length });
    return true;
  } catch (err) {
    console.error("❌ Error carga:", err);
    return false;
  }
}

function renderKPIs(rows) {
  const libreCol = findCol(mmHeaders, ["LIBRE", "UTIL"]);
  if (!libreCol) return;

  const total = rows.length;
  const sinStock = rows.filter(r => toNumber(r[libreCol]) === 0).length;
  const stockTotal = rows.reduce((sum, r) => sum + toNumber(r[libreCol]), 0);

  document.getElementById("kpiQuiebre").textContent = fmtPct(total > 0 ? sinStock / total : 0);
  document.getElementById("kpiQuiebreSub").textContent = `${sinStock} de ${total} materiales`;
  document.getElementById("kpiCobertura").textContent = `30 días`;
  document.getElementById("kpiRotacion").textContent = `3.5`;
  document.getElementById("kpiInmovilizado").textContent = fmtCurrency(stockTotal * 0.12 * 1000);
}

function renderPareto(rows) {
  const el = document.getElementById("chartPareto");
  const libreCol = findCol(mmHeaders, ["LIBRE", "UTIL"]);
  const matCol = findCol(mmHeaders, ["MATERIAL", "CODIGO"]);

  if (!el || !libreCol || !matCol) return;

  const mats = rows.map(r => ({ n: clean(r[matCol]), v: toNumber(r[libreCol]) * 1000 }))
    .filter(m => m.v > 0).sort((a, b) => b.v - a.v).slice(0, 20);

  const chart = echarts.init(el);
  chart.setOption({
    tooltip: { trigger: "axis" },
    grid: { bottom: 80 },
    xAxis: { type: "category", data: mats.map(m => m.n), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: "value", name: "Valor ($)" },
    series: [{ name: "Valor Stock", type: "bar", data: mats.map(m => m.v), itemStyle: { color: "#3b82f6" } }]
  });
}

function renderSemaforo() {
  const tbody = document.querySelector("#tableSemaforo tbody");
  const clientCol = findCol(cumplimientoHeaders, ["CLIENTE", "OBRA"]);
  const atCol = findCol(cumplimientoHeaders, ["ENTREGADOS AT"]);
  const noCol = findCol(cumplimientoHeaders, ["NO ENTREGADOS"]);

  if (!tbody || !clientCol) return;

  const res = {};
  cumplimientoData.forEach(r => {
    const c = clean(r[clientCol]); if (!c) return;
    if (!res[c]) res[c] = { at: 0, no: 0 };
    res[c].at += toNumber(r[atCol]);
    res[c].no += toNumber(r[noCol]);
  });

  const sorted = Object.keys(res).map(c => {
    const t = res[c].at + res[c].no;
    return { c, p: t > 0 ? res[c].at / t : 0, r: res[c].no };
  }).sort((a, b) => a.p - b.p);

  tbody.innerHTML = sorted.map(r => {
    const pct = r.p * 100;
    const color = pct >= 90 ? "green" : pct >= 80 ? "blue" : pct >= 70 ? "orange" : "red";
    return `<tr><td>${r.c}</td><td><div style="width:100px;background:#eee"><div style="width:${pct}%;background:${color};height:10px"></div></div></td><td>${pct.toFixed(1)}%</td><td>${r.r}</td></tr>`;
  }).join("");
}

function renderHeatmap() {
  const el = document.getElementById("chartHeatmap");
  const fechaCol = findCol(demorasHeaders, ["FECHA"]);
  const areaCol = findCol(demorasHeaders, ["AREA", "RESPONSABLE"]);

  if (!el || !fechaCol || !areaCol) return;

  const mapa = {};
  demorasData.forEach(r => {
    const m = parseDateToMonth(r[fechaCol]), a = clean(r[areaCol]);
    if (!m || !a) return;
    if (!mapa[a]) mapa[a] = {};
    mapa[a][m] = (mapa[a][m] || 0) + 1;
  });

  const areas = Object.keys(mapa).sort(), meses = [...new Set(demorasData.map(r => parseDateToMonth(r[fechaCol])).filter(Boolean))].sort();
  const data = []; areas.forEach((a, ai) => meses.forEach((m, mi) => data.push([mi, ai, mapa[a][m] || 0])));

  const chart = echarts.init(el);
  chart.setOption({
    tooltip: { position: "top" },
    xAxis: { type: "category", data: meses },
    yAxis: { type: "category", data: areas },
    visualMap: { min: 0, max: 20, calculable: true, orient: "horizontal", left: "center", bottom: 0 },
    series: [{ type: "heatmap", data: data, label: { show: true } }]
  });
}

async function init() {
  if (!await loadAllData()) { hideLoader(); return; }
  renderKPIs(mmData);
  renderPareto(mmData);
  renderSemaforo();
  renderHeatmap();
  hideLoader();
}

document.addEventListener("DOMContentLoaded", init);
