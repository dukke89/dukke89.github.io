/* ============================
   RESUMEN - CONSOLIDACIÓN DE DATOS
============================ */

const DELIM = ";";

let mmData = [];
let cumplimientoData = [];
let demorasData = [];

let mmHeaders = [];
let cumplimientoHeaders = [];
let demorasHeaders = [];

/* ============================
   HELPERS
============================ */
const clean = (v) => (v ?? "").toString().replace(/^\uFEFF/, "").replace(/\r/g, "").trim();

function norm(s) {
    return clean(s)
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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

function fmtInt(n) {
    return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
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

function parseDateToMonth(s) {
    s = clean(s);
    if (!s) return "";
    const p = s.split("/");
    if (p.length >= 3 && p[2]) return `${p[2]}-${(p[1] || "").padStart(2, '0')}`;
    return s;
}

function showError(msg) {
    const el = document.getElementById("msg");
    if (el) el.innerHTML = `<div class="error">${msg}</div>`;
}

function hideLoader() {
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
}

/* ============================
   CARGA DE DATOS
============================ */
async function loadAllData() {
    try {
        // Cargar los 3 CSVs en paralelo
        const [mmText, cumplimientoText, demorasText] = await Promise.all([
            fetch("ANALISIS-MM.csv").then(r => r.ok ? r.text() : Promise.reject(`Error cargando ANALISIS-MM.csv`)),
            fetch("CUMPLIMIENTO_2025.csv").then(r => r.ok ? r.text() : Promise.reject(`Error cargando CUMPLIMIENTO_2025.csv`)),
            fetch("DEMORAS.csv").then(r => r.ok ? r.text() : Promise.reject(`Error cargando DEMORAS.csv`))
        ]);

        // Parsear MM
        const mmRows = parseCSV(mmText, DELIM);
        if (mmRows.length > 1) {
            mmHeaders = mmRows[0].map(clean);
            mmData = mmRows.slice(1).map(r => {
                const obj = {};
                mmHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        // Parsear Cumplimiento
        const cumplimientoRows = parseCSV(cumplimientoText, DELIM);
        if (cumplimientoRows.length > 1) {
            cumplimientoHeaders = cumplimientoRows[0].map(clean);
            cumplimientoData = cumplimientoRows.slice(1).map(r => {
                const obj = {};
                cumplimientoHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        // Parsear Demoras
        const demorasRows = parseCSV(demorasText, DELIM);
        if (demorasRows.length > 1) {
            demorasHeaders = demorasRows[0].map(clean);
            demorasData = demorasRows.slice(1).map(r => {
                const obj = {};
                demorasHeaders.forEach((h, i) => obj[h] = clean(r[i]));
                return obj;
            });
        }

        console.log("Datos cargados:", { mm: mmData.length, cumplimiento: cumplimientoData.length, demoras: demorasData.length });
        return true;
    } catch (err) {
        showError(`Error cargando datos: ${err.message || err}`);
        console.error(err);
        return false;
    }
}

/* ============================
   CONSOLIDACIÓN POR CLIENTE
============================ */
function getUniqueClientes() {
    const clientes = new Set();

    // De MM (columna CLIENTE o ALMACEN)
    const mmClientCol = mmHeaders.find(h => norm(h).includes("cliente") || norm(h).includes("almacen"));
    if (mmClientCol) {
        mmData.forEach(r => {
            const c = clean(r[mmClientCol]);
            if (c) clientes.add(c);
        });
    }

    // De Cumplimiento (columna CLIENTE / OBRA)
    const cumplimientoClientCol = cumplimientoHeaders.find(h =>
        norm(h).includes("cliente") || norm(h).includes("obra")
    );
    if (cumplimientoClientCol) {
        cumplimientoData.forEach(r => {
            const c = clean(r[cumplimientoClientCol]);
            if (c) clientes.add(c);
        });
    }

    // De Demoras (columna CLIENTE)
    const demorasClientCol = demorasHeaders.find(h => norm(h).includes("cliente"));
    if (demorasClientCol) {
        demorasData.forEach(r => {
            const c = clean(r[demorasClientCol]);
            if (c) clientes.add(c);
        });
    }

    return Array.from(clientes).sort((a, b) => a.localeCompare(b, "es"));
}

function calcularDisponibilidad(cliente) {
    const mmClientCol = mmHeaders.find(h => norm(h).includes("cliente") || norm(h).includes("almacen"));
    const libreUtilCol = mmHeaders.find(h => norm(h).includes("libre") && norm(h).includes("util"));

    if (!mmClientCol || !libreUtilCol) return { porcentaje: 0, disponibles: 0, total: 0 };

    const rows = mmData.filter(r => clean(r[mmClientCol]) === cliente);
    const total = rows.length;
    const disponibles = rows.filter(r => toNumber(r[libreUtilCol]) > 0).length;
    const porcentaje = total > 0 ? (disponibles / total) : 0;

    return { porcentaje, disponibles, total };
}

function calcularCumplimiento(cliente, mes = null) {
    const clientCol = cumplimientoHeaders.find(h => norm(h).includes("cliente") || norm(h).includes("obra"));
    const fechaCol = cumplimientoHeaders.find(h => norm(h).includes("fecha") && norm(h).includes("entrega"));
    const atCol = cumplimientoHeaders.find(h => norm(h) === norm("ENTREGADOS AT"));
    const ftCol = cumplimientoHeaders.find(h => norm(h) === norm("ENTREGADOS FT"));
    const noCol = cumplimientoHeaders.find(h => norm(h) === norm("NO ENTREGADOS"));

    if (!clientCol) return { porcentaje: 0, at: 0, ft: 0, no: 0, total: 0 };

    let rows = cumplimientoData.filter(r => clean(r[clientCol]) === cliente);

    // Filtrar por mes si se especifica
    if (mes && fechaCol) {
        rows = rows.filter(r => parseDateToMonth(r[fechaCol]) === mes);
    }

    const at = rows.reduce((sum, r) => sum + toNumber(r[atCol]), 0);
    const ft = rows.reduce((sum, r) => sum + toNumber(r[ftCol]), 0);
    const no = rows.reduce((sum, r) => sum + toNumber(r[noCol]), 0);
    const total = at + ft + no;
    const porcentaje = total > 0 ? (at / total) : 0;

    return { porcentaje, at, ft, no, total };
}

function calcularDemoras(cliente, mes = null) {
    const clientCol = demorasHeaders.find(h => norm(h).includes("cliente"));
    const fechaCol = demorasHeaders.find(h => norm(h).includes("fecha"));
    const demoraCol = demorasHeaders.find(h => norm(h).includes("demora") || norm(h).includes("dias"));

    if (!clientCol) return { cantidad: 0, diasPromedio: 0 };

    let rows = demorasData.filter(r => clean(r[clientCol]) === cliente);

    // Filtrar por mes si se especifica
    if (mes && fechaCol) {
        rows = rows.filter(r => parseDateToMonth(r[fechaCol]) === mes);
    }

    const cantidad = rows.length;
    let diasPromedio = 0;

    if (cantidad > 0 && demoraCol) {
        const sumDias = rows.reduce((sum, r) => sum + toNumber(r[demoraCol]), 0);
        diasPromedio = sumDias / cantidad;
    }

    return { cantidad, diasPromedio };
}

function calcularEstadoGeneral(disponibilidad, cumplimiento, demoras) {
    // Lógica de scoring
    let score = 0;

    // Disponibilidad (0-40 puntos)
    if (disponibilidad >= 0.95) score += 40;
    else if (disponibilidad >= 0.85) score += 30;
    else if (disponibilidad >= 0.75) score += 20;
    else score += 10;

    // Cumplimiento (0-40 puntos)
    if (cumplimiento >= 0.90) score += 40;
    else if (cumplimiento >= 0.80) score += 30;
    else if (cumplimiento >= 0.70) score += 20;
    else score += 10;

    // Demoras (0-20 puntos) - menos días es mejor
    if (demoras <= 5) score += 20;
    else if (demoras <= 10) score += 15;
    else if (demoras <= 15) score += 10;
    else score += 5;

    // Clasificación
    if (score >= 85) return { estado: "excelente", emoji: "🟢", label: "Excelente" };
    if (score >= 70) return { estado: "bueno", emoji: "🔵", label: "Bueno" };
    if (score >= 50) return { estado: "regular", emoji: "🟡", label: "Regular" };
    return { estado: "critico", emoji: "🔴", label: "Crítico" };
}

function generarAlertas(cliente, metricas) {
    const alertas = [];

    // Alerta de cumplimiento bajo
    if (metricas.cumplimiento.porcentaje < 0.75) {
        alertas.push({
            tipo: "critico",
            titulo: `${cliente}: Cumplimiento Crítico`,
            mensaje: `Solo ${fmtPct(metricas.cumplimiento.porcentaje)} de cumplimiento. Meta: >75%`
        });
    }

    // Alerta de disponibilidad baja
    if (metricas.disponibilidad.porcentaje < 0.80) {
        alertas.push({
            tipo: "advertencia",
            titulo: `${cliente}: Baja Disponibilidad`,
            mensaje: `${fmtPct(metricas.disponibilidad.porcentaje)} de materiales disponibles. Meta: >80%`
        });
    }

    // Alerta de demoras altas
    if (metricas.demoras.cantidad > 10) {
        alertas.push({
            tipo: "advertencia",
            titulo: `${cliente}: Demoras Elevadas`,
            mensaje: `${metricas.demoras.cantidad} pedidos con demora (promedio: ${Math.round(metricas.demoras.diasPromedio)} días)`
        });
    }

    return alertas;
}

/* ============================
   RENDERIZADO
============================ */
function renderKPIsGlobales(resumen) {
    const totalClientes = resumen.length;
    const cumplimientoPromedio = resumen.reduce((sum, r) => sum + r.metricas.cumplimiento.porcentaje, 0) / totalClientes;
    const disponibilidadPromedio = resumen.reduce((sum, r) => sum + r.metricas.disponibilidad.porcentaje, 0) / totalClientes;
    const demorasPromedio = resumen.reduce((sum, r) => sum + r.metricas.demoras.diasPromedio, 0) / totalClientes;

    document.getElementById("kpiClientes").textContent = totalClientes;
    document.getElementById("kpiCumplimiento").textContent = fmtPct(cumplimientoPromedio);
    document.getElementById("kpiCumplimientoSub").textContent = `De ${totalClientes} clientes activos`;
    document.getElementById("kpiDisponibilidad").textContent = fmtPct(disponibilidadPromedio);
    document.getElementById("kpiDisponibilidadSub").textContent = `Promedio de materiales disponibles`;
    document.getElementById("kpiDemoras").textContent = `${Math.round(demorasPromedio)} días`;
    document.getElementById("kpiDemorasSub").textContent = `Promedio de días de demora`;
}

function renderTablaResumen(resumen) {
    const tbody = document.querySelector("#tablaResumen tbody");
    if (!tbody) return;

    if (resumen.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay datos para mostrar</td></tr>';
        return;
    }

    const rows = resumen.map(r => {
        const { cliente, metricas, estado, alertas } = r;

        const disponibilidadHtml = `
      <div class="metric-cell">
        <span class="metric-value">${fmtPct(metricas.disponibilidad.porcentaje)}</span>
        <span class="metric-trend trend-neutral">→</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">
        ${metricas.disponibilidad.disponibles} de ${metricas.disponibilidad.total}
      </div>
    `;

        const cumplimientoHtml = `
      <div class="metric-cell">
        <span class="metric-value">${fmtPct(metricas.cumplimiento.porcentaje)}</span>
        <span class="metric-trend trend-neutral">→</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">
        ${metricas.cumplimiento.at} AT / ${metricas.cumplimiento.total} total
      </div>
    `;

        const demorasHtml = `
      <div class="metric-cell">
        <span class="metric-value">${metricas.demoras.cantidad}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">
        ${Math.round(metricas.demoras.diasPromedio)} días promedio
      </div>
    `;

        const estadoHtml = `
      <span class="estado-badge estado-${estado.estado}">
        ${estado.emoji} ${estado.label}
      </span>
    `;

        const alertasHtml = `
      <span class="alertas-badge badge-${alertas.length}">${alertas.length}</span>
    `;

        return `
      <tr>
        <td><strong>${cliente}</strong></td>
        <td>${disponibilidadHtml}</td>
        <td>${cumplimientoHtml}</td>
        <td>${demorasHtml}</td>
        <td>${estadoHtml}</td>
        <td>${alertasHtml}</td>
      </tr>
    `;
    }).join("");

    tbody.innerHTML = rows;
}

function renderAlertas(resumen) {
    const container = document.getElementById("alertasContainer");
    if (!container) return;

    const todasAlertas = resumen.flatMap(r => r.alertas);

    if (todasAlertas.length === 0) {
        container.innerHTML = '<div class="alert-placeholder">✅ No hay alertas críticas</div>';
        return;
    }

    const alertasHtml = todasAlertas.map(a => `
    <div class="alert-item alert-${a.tipo}">
      <div class="alert-icon">${a.tipo === 'critico' ? '🔴' : '⚠️'}</div>
      <div class="alert-content">
        <div class="alert-title">${a.titulo}</div>
        <div class="alert-message">${a.mensaje}</div>
      </div>
    </div>
  `).join("");

    container.innerHTML = alertasHtml;
}

function renderCharts(resumen) {
    // Gráfico de tendencia de cumplimiento (placeholder por ahora)
    const elCumplimiento = document.getElementById("chartTendenciaCumplimiento");
    if (elCumplimiento) {
        const chart = echarts.init(elCumplimiento);
        chart.setOption({
            tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: resumen.map(r => r.cliente) },
            yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            series: [{
                name: "Cumplimiento",
                type: "line",
                data: resumen.map(r => (r.metricas.cumplimiento.porcentaje * 100).toFixed(1)),
                smooth: true,
                lineStyle: { width: 3, color: "#10b981" },
                itemStyle: { color: "#10b981" }
            }]
        });
    }

    // Gráfico de tendencia de disponibilidad
    const elDisponibilidad = document.getElementById("chartTendenciaDisponibilidad");
    if (elDisponibilidad) {
        const chart = echarts.init(elDisponibilidad);
        chart.setOption({
            tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: resumen.map(r => r.cliente) },
            yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            series: [{
                name: "Disponibilidad",
                type: "line",
                data: resumen.map(r => (r.metricas.disponibilidad.porcentaje * 100).toFixed(1)),
                smooth: true,
                lineStyle: { width: 3, color: "#3b82f6" },
                itemStyle: { color: "#3b82f6" }
            }]
        });
    }
}

/* ============================
   FUNCIÓN PRINCIPAL
============================ */
async function init() {
    const success = await loadAllData();
    if (!success) {
        hideLoader();
        return;
    }

    // Obtener clientes únicos
    const clientes = getUniqueClientes();

    // Consolidar métricas por cliente
    const resumen = clientes.map(cliente => {
        const metricas = {
            disponibilidad: calcularDisponibilidad(cliente),
            cumplimiento: calcularCumplimiento(cliente),
            demoras: calcularDemoras(cliente)
        };

        const estado = calcularEstadoGeneral(
            metricas.disponibilidad.porcentaje,
            metricas.cumplimiento.porcentaje,
            metricas.demoras.diasPromedio
        );

        const alertas = generarAlertas(cliente, metricas);

        return { cliente, metricas, estado, alertas };
    });

    console.log("Resumen consolidado:", resumen);

    // Renderizar
    renderKPIsGlobales(resumen);
    renderTablaResumen(resumen);
    renderAlertas(resumen);
    renderCharts(resumen);

    hideLoader();
}

// Iniciar al cargar la página
document.addEventListener("DOMContentLoaded", init);
