/* RESUMEN - VERSIÓN ULTRA ROBUSTA */

const DELIM = ";";
let mmData = [], cumplimientoData = [], demorasData = [];
let mmHeaders = [], cumplimientoHeaders = [], demorasHeaders = [];

const clean = (v) => (v ?? "").toString().replace(/^\uFEFF/, "").replace(/\r/g, "").trim();

// Normalización agresiva que elimina caracteres no-ASCII (como )
function norm(s) {
    return clean(s)
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
        .replace(/[^\x00-\x7F]/g, " ") // Reemplazar caracteres no-ASCII (como ) por espacios
        .replace(/\s+/g, " ")
        .trim();
}

function toNumber(v) {
    let x = clean(v);
    if (!x) return 0;
    x = x.replace(/\s/g, "").replace(/%/g, "");
    if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
    return Number.isFinite(Number(x)) ? Number(x) : 0;
}

function fmtPct(x) {
    if (!isFinite(x)) return "-";
    return (x * 100).toFixed(1).replace(".", ",") + "%";
}

function parseCSV(text, delim = ";") {
    text = (text ?? "").toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!text) return [];
    return text.split(/\n+/).map(line => line.split(delim).map(clean));
}

function hideLoader() {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
}

async function loadAllData() {
    try {
        const urls = ["ANALISIS-MM.csv", "CUMPLIMIENTO_2025.csv", "DEMORAS.csv"];
        const [mmText, cumplimientoText, demorasText] = await Promise.all(
            urls.map(url => fetch(url).then(r => r.ok ? r.text() : Promise.reject(`No se pudo cargar ${url}`)))
        );

        mmData = []; cumplimientoData = []; demorasData = [];

        const mmRows = parseCSV(mmText, DELIM);
        if (mmRows.length > 0) {
            mmHeaders = mmRows[0].map(clean);
            mmData = mmRows.slice(1).map(r => {
                const obj = {};
                mmHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        const cumplimientoRows = parseCSV(cumplimientoText, DELIM);
        if (cumplimientoRows.length > 0) {
            cumplimientoHeaders = cumplimientoRows[0].map(clean);
            cumplimientoData = cumplimientoRows.slice(1).map(r => {
                const obj = {};
                cumplimientoHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        const demorasRows = parseCSV(demorasText, DELIM);
        if (demorasRows.length > 0) {
            demorasHeaders = demorasRows[0].map(clean);
            demorasData = demorasRows.slice(1).map(r => {
                const obj = {};
                demorasHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        console.log("✅ Datos base cargados. Filas:", { mm: mmData.length, cumplimiento: cumplimientoData.length, demoras: demorasData.length });
        return true;
    } catch (err) {
        console.error("❌ Error en carga:", err);
        const el = document.getElementById("msg");
        if (el) el.innerHTML = `<div class="error">Error: ${err}</div>`;
        return false;
    }
}

function getUniqueClientes() {
    const clientes = new Set();

    // Búsqueda flexible de columnas
    const findCol = (headers, names) => {
        return headers.find(h => names.some(n => norm(h).includes(n)));
    };

    const mmClientCol = findCol(mmHeaders, ["CLIENTE", "ALMACEN"]);
    if (mmClientCol) mmData.forEach(r => { const c = clean(r[mmClientCol]); if (c) clientes.add(c); });

    const cumpliClientCol = findCol(cumplimientoHeaders, ["CLIENTE", "OBRA"]);
    if (cumpliClientCol) cumplimientoData.forEach(r => { const c = clean(r[cumpliClientCol]); if (c) clientes.add(c); });

    const demClientCol = findCol(demorasHeaders, ["CLIENTE"]);
    if (demClientCol) demorasData.forEach(r => { const c = clean(r[demClientCol]); if (c) clientes.add(c); });

    return Array.from(clientes).sort((a, b) => a.localeCompare(b, "es"));
}

function calcularDisponibilidad(cliente) {
    const mmClientCol = mmHeaders.find(h => norm(h).includes("CLIENTE") || norm(h).includes("ALMACEN"));
    const libreUtilCol = mmHeaders.find(h => norm(h).includes("LIBRE") && norm(h).includes("UTIL"));

    if (!mmClientCol || !libreUtilCol) return { porcentaje: 0, disponibles: 0, total: 0 };

    const rows = mmData.filter(r => clean(r[mmClientCol]) === cliente);
    const total = rows.length;
    const disponibles = rows.filter(r => toNumber(r[libreUtilCol]) > 0).length;

    return { porcentaje: total > 0 ? disponibles / total : 0, disponibles, total };
}

function calcularCumplimiento(cliente) {
    const clientCol = cumplimientoHeaders.find(h => norm(h).includes("CLIENTE") || norm(h).includes("OBRA"));
    const atCol = cumplimientoHeaders.find(h => norm(h).includes("ENTREGADOS AT"));
    const ftCol = cumplimientoHeaders.find(h => norm(h).includes("ENTREGADOS FT"));
    const noCol = cumplimientoHeaders.find(h => norm(h) === "NO ENTREGADOS");

    if (!clientCol) return { porcentaje: 0, at: 0, ft: 0, no: 0, total: 0 };

    const rows = cumplimientoData.filter(r => clean(r[clientCol]) === cliente);
    const at = rows.reduce((sum, r) => sum + toNumber(r[atCol]), 0);
    const ft = rows.reduce((sum, r) => sum + toNumber(r[ftCol]), 0);
    const no = rows.reduce((sum, r) => sum + toNumber(r[noCol]), 0);
    const total = at + ft + no;

    return { porcentaje: total > 0 ? at / total : 0, at, ft, no, total };
}

function calcularDemoras(cliente) {
    const clientCol = demorasHeaders.find(h => norm(h).includes("CLIENTE"));
    // Flexible para encontrar "DIAS DE DEMORA"
    const demoraCol = demorasHeaders.find(h => norm(h).includes("DEMORA") && (norm(h).includes("DIAS") || norm(h).includes("TIEMPO")));

    if (!clientCol) return { cantidad: 0, diasPromedio: 0 };

    const rows = demorasData.filter(r => clean(r[clientCol]) === cliente);
    const cantidad = rows.length;
    const sumDias = (cantidad > 0 && demoraCol) ? rows.reduce((sum, r) => sum + toNumber(r[demoraCol]), 0) : 0;

    return { cantidad, diasPromedio: cantidad > 0 ? sumDias / cantidad : 0 };
}

function calcularEstadoGeneral(disponibilidad, cumplimiento, demoras) {
    let score = 0;
    if (disponibilidad >= 0.95) score += 40; else if (disponibilidad >= 0.85) score += 30; else if (disponibilidad >= 0.75) score += 20; else score += 10;
    if (cumplimiento >= 0.90) score += 40; else if (cumplimiento >= 0.80) score += 30; else if (cumplimiento >= 0.70) score += 20; else score += 10;
    if (demoras <= 5) score += 20; else if (demoras <= 10) score += 15; else if (demoras <= 15) score += 10; else score += 5;

    if (score >= 85) return { estado: "excelente", emoji: "🟢", label: "Excelente" };
    if (score >= 70) return { estado: "bueno", emoji: "🔵", label: "Bueno" };
    if (score >= 50) return { estado: "regular", emoji: "🟡", label: "Regular" };
    return { estado: "critico", emoji: "🔴", label: "Crítico" };
}

function renderKPIsGlobales(resumen) {
    const n = resumen.length;
    if (n === 0) return;
    const cp = resumen.reduce((s, r) => s + r.metricas.cumplimiento.porcentaje, 0) / n;
    const dp = resumen.reduce((s, r) => s + r.metricas.disponibilidad.porcentaje, 0) / n;
    const dmp = resumen.reduce((s, r) => s + r.metricas.demoras.diasPromedio, 0) / n;

    document.getElementById("kpiClientes").textContent = n;
    document.getElementById("kpiCumplimiento").textContent = fmtPct(cp);
    document.getElementById("kpiDisponibilidad").textContent = fmtPct(dp);
    document.getElementById("kpiDemoras").textContent = `${Math.round(dmp)} d`;
}

function renderTablaResumen(resumen) {
    const tbody = document.querySelector("#tablaResumen tbody");
    if (!tbody) return;
    if (resumen.length === 0) { tbody.innerHTML = '<tr><td colspan="6">Sin datos</td></tr>'; return; }

    tbody.innerHTML = resumen.map(r => `
    <tr>
      <td><strong>${r.cliente}</strong></td>
      <td>${fmtPct(r.metricas.disponibilidad.porcentaje)}<br/><small>${r.metricas.disponibilidad.disponibles}/${r.metricas.disponibilidad.total}</small></td>
      <td>${fmtPct(r.metricas.cumplimiento.porcentaje)}<br/><small>${r.metricas.cumplimiento.at} AT / ${r.metricas.cumplimiento.total}</small></td>
      <td>${Math.round(r.metricas.demoras.diasPromedio)} d<br/><small>${r.metricas.demoras.cantidad} ped.</small></td>
      <td><span class="estado-badge estado-${r.estado.estado}">${r.estado.emoji} ${r.estado.label}</span></td>
      <td><span class="alertas-badge badge-${r.alertas.length}">${r.alertas.length}</span></td>
    </tr>
  `).join("");
}

async function init() {
    if (!await loadAllData()) { hideLoader(); return; }
    const clientes = getUniqueClientes();
    const resumen = clientes.map(cliente => {
        const m = {
            disponibilidad: calcularDisponibilidad(cliente),
            cumplimiento: calcularCumplimiento(cliente),
            demoras: calcularDemoras(cliente)
        };
        return {
            cliente,
            metricas: m,
            estado: calcularEstadoGeneral(m.disponibilidad.porcentaje, m.cumplimiento.porcentaje, m.demoras.diasPromedio),
            alertas: [] // Simplificado para debugging
        };
    });

    renderKPIsGlobales(resumen);
    renderTablaResumen(resumen);
    hideLoader();
}

document.addEventListener("DOMContentLoaded", init);
