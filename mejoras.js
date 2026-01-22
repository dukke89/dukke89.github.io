/* ============================
   MEJORAS - ANÁLISIS AVANZADO
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
   KPIs AVANZADOS
============================ */

// 1. TASA DE QUIEBRE DE STOCK
function calcularQuiebreStock(rows) {
    const libreUtilCol = mmHeaders.find(h => norm(h).includes("libre") && norm(h).includes("util"));
    if (!libreUtilCol) return { porcentaje: 0, sinStock: 0, total: 0 };

    const total = rows.length;
    const sinStock = rows.filter(r => toNumber(r[libreUtilCol]) === 0).length;
    const porcentaje = total > 0 ? (sinStock / total) : 0;

    return { porcentaje, sinStock, total };
}

// 2. COBERTURA PROMEDIO (días)
function calcularCobertura(rows) {
    // Simplificado: asumimos 30 días de cobertura promedio
    // En un caso real, necesitarías: Stock actual / Consumo diario promedio
    const libreUtilCol = mmHeaders.find(h => norm(h).includes("libre") && norm(h).includes("util"));
    if (!libreUtilCol) return { diasPromedio: 0 };

    const stockTotal = rows.reduce((sum, r) => sum + toNumber(r[libreUtilCol]), 0);
    const diasPromedio = stockTotal > 0 ? 30 : 0; // Placeholder

    return { diasPromedio };
}

// 3. ROTACIÓN DE INVENTARIO
function calcularRotacion(rows) {
    // Simplificado: Rotación = Consumo anual / Stock promedio
    // Placeholder: asumimos 4 rotaciones/año
    return { rotacion: 4.2 };
}

// 4. VALOR DE STOCK INMOVILIZADO
function calcularInmovilizado(rows) {
    // Simplificado: materiales sin movimiento > 90 días
    // Placeholder: asumimos 15% del stock total
    const libreUtilCol = mmHeaders.find(h => norm(h).includes("libre") && norm(h).includes("util"));
    if (!libreUtilCol) return { valor: 0, cantidad: 0 };

    const stockTotal = rows.reduce((sum, r) => sum + toNumber(r[libreUtilCol]), 0);
    const valorInmovilizado = stockTotal * 0.15 * 1000; // Placeholder: 15% × precio estimado
    const cantidad = Math.floor(rows.length * 0.15);

    return { valor: valorInmovilizado, cantidad };
}

/* ============================
   GRÁFICO DE PARETO
============================ */
function renderPareto(rows) {
    const el = document.getElementById("chartPareto");
    if (!el) return;

    const libreUtilCol = mmHeaders.find(h => norm(h).includes("libre") && norm(h).includes("util"));
    const materialCol = mmHeaders.find(h => norm(h).includes("material") || norm(h).includes("codigo"));

    if (!libreUtilCol || !materialCol) {
        el.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">Datos insuficientes para Pareto</div>';
        return;
    }

    // Calcular valor por material (stock × precio estimado)
    const materiales = rows.map(r => ({
        nombre: clean(r[materialCol]) || "Sin código",
        valor: toNumber(r[libreUtilCol]) * 1000 // Precio estimado
    })).filter(m => m.valor > 0);

    // Ordenar por valor descendente
    materiales.sort((a, b) => b.valor - a.valor);

    // Top 20
    const top20 = materiales.slice(0, 20);

    // Calcular % acumulado
    const totalValor = materiales.reduce((sum, m) => sum + m.valor, 0);
    let acumulado = 0;
    const data = top20.map(m => {
        acumulado += m.valor;
        return {
            nombre: m.nombre,
            valor: m.valor,
            pctAcumulado: (acumulado / totalValor) * 100
        };
    });

    const chart = echarts.init(el);
    chart.setOption({
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "cross" }
        },
        legend: {
            data: ["Valor Individual", "% Acumulado"],
            top: 0
        },
        grid: { left: 60, right: 60, top: 50, bottom: 80 },
        xAxis: {
            type: "category",
            data: data.map(d => d.nombre),
            axisLabel: {
                rotate: 45,
                fontSize: 10
            }
        },
        yAxis: [
            {
                type: "value",
                name: "Valor ($)",
                axisLabel: { formatter: (v) => fmtCurrency(v) }
            },
            {
                type: "value",
                name: "% Acumulado",
                min: 0,
                max: 100,
                axisLabel: { formatter: "{value}%" }
            }
        ],
        series: [
            {
                name: "Valor Individual",
                type: "bar",
                data: data.map(d => d.valor),
                itemStyle: { color: "#3b82f6" }
            },
            {
                name: "% Acumulado",
                type: "line",
                yAxisIndex: 1,
                data: data.map(d => d.pctAcumulado),
                lineStyle: { width: 3, color: "#ef4444" },
                itemStyle: { color: "#ef4444" },
                markLine: {
                    data: [{ yAxis: 80, label: { formatter: "80%" } }],
                    lineStyle: { color: "#10b981", type: "dashed" }
                }
            }
        ]
    });
}

/* ============================
   SEMÁFORO DE CUMPLIMIENTO
============================ */
function renderSemaforo() {
    const tbody = document.querySelector("#tableSemaforo tbody");
    if (!tbody) return;

    const clientCol = cumplimientoHeaders.find(h => norm(h).includes("cliente") || norm(h).includes("obra"));
    const atCol = cumplimientoHeaders.find(h => norm(h) === norm("ENTREGADOS AT"));
    const ftCol = cumplimientoHeaders.find(h => norm(h) === norm("ENTREGADOS FT"));
    const noCol = cumplimientoHeaders.find(h => norm(h) === norm("NO ENTREGADOS"));

    if (!clientCol) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-row">Datos insuficientes</td></tr>';
        return;
    }

    // Agrupar por cliente
    const clientes = {};
    cumplimientoData.forEach(r => {
        const cliente = clean(r[clientCol]);
        if (!cliente) return;

        if (!clientes[cliente]) {
            clientes[cliente] = { at: 0, ft: 0, no: 0 };
        }

        clientes[cliente].at += toNumber(r[atCol]);
        clientes[cliente].ft += toNumber(r[ftCol]);
        clientes[cliente].no += toNumber(r[noCol]);
    });

    // Calcular % y ordenar
    const resumen = Object.keys(clientes).map(cliente => {
        const { at, ft, no } = clientes[cliente];
        const total = at + ft + no;
        const porcentaje = total > 0 ? (at / total) : 0;
        const enRiesgo = no;

        return { cliente, porcentaje, enRiesgo, total };
    }).sort((a, b) => a.porcentaje - b.porcentaje); // Menor a mayor

    if (resumen.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No hay datos</td></tr>';
        return;
    }

    const rows = resumen.map(r => {
        const pct = r.porcentaje * 100;
        let estado, estadoClass;

        if (pct >= 90) {
            estado = "🟢 Excelente";
            estadoClass = "semaforo-excelente";
        } else if (pct >= 80) {
            estado = "🔵 Bueno";
            estadoClass = "semaforo-bueno";
        } else if (pct >= 70) {
            estado = "🟡 Regular";
            estadoClass = "semaforo-regular";
        } else {
            estado = "🔴 Crítico";
            estadoClass = "semaforo-critico";
        }

        const progressClass = pct >= 80 ? "" : pct >= 70 ? "medium" : "low";

        let riesgoClass = "badge-riesgo-0";
        if (r.enRiesgo > 10) riesgoClass = "badge-riesgo-high";
        else if (r.enRiesgo > 5) riesgoClass = "badge-riesgo-medium";
        else if (r.enRiesgo > 0) riesgoClass = "badge-riesgo-low";

        return `
      <tr>
        <td><strong>${r.cliente}</strong></td>
        <td>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-fill ${progressClass}" style="width: ${pct}%">
                ${pct.toFixed(1)}%
              </div>
            </div>
          </div>
        </td>
        <td>
          <span class="tendencia-icon tendencia-neutral">→</span>
        </td>
        <td>
          <span class="badge-riesgo ${riesgoClass}">${r.enRiesgo}</span>
        </td>
        <td>
          <span class="semaforo-estado ${estadoClass}">${estado}</span>
        </td>
      </tr>
    `;
    }).join("");

    tbody.innerHTML = rows;
}

/* ============================
   MAPA DE CALOR DE DEMORAS
============================ */
function renderHeatmap() {
    const el = document.getElementById("chartHeatmap");
    if (!el) return;

    const fechaCol = demorasHeaders.find(h => norm(h).includes("fecha"));
    const areaCol = demorasHeaders.find(h => norm(h).includes("area") || norm(h).includes("responsable"));

    if (!fechaCol || !areaCol) {
        el.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">Datos insuficientes para Heatmap</div>';
        return;
    }

    // Agrupar por mes y área
    const mapa = {};
    demorasData.forEach(r => {
        const mes = parseDateToMonth(r[fechaCol]);
        const area = clean(r[areaCol]);
        if (!mes || !area) return;

        if (!mapa[area]) mapa[area] = {};
        mapa[area][mes] = (mapa[area][mes] || 0) + 1;
    });

    const areas = Object.keys(mapa).sort();
    const meses = [...new Set(demorasData.map(r => parseDateToMonth(r[fechaCol])).filter(Boolean))].sort();

    // Preparar datos para heatmap
    const data = [];
    areas.forEach((area, areaIdx) => {
        meses.forEach((mes, mesIdx) => {
            const valor = mapa[area][mes] || 0;
            data.push([mesIdx, areaIdx, valor]);
        });
    });

    const chart = echarts.init(el);
    chart.setOption({
        tooltip: {
            position: "top",
            formatter: (params) => {
                const mes = meses[params.value[0]];
                const area = areas[params.value[1]];
                const valor = params.value[2];
                return `${area}<br/>${mes}: <b>${valor} demoras</b>`;
            }
        },
        grid: { left: 120, right: 40, top: 40, bottom: 60 },
        xAxis: {
            type: "category",
            data: meses,
            splitArea: { show: true }
        },
        yAxis: {
            type: "category",
            data: areas,
            splitArea: { show: true }
        },
        visualMap: {
            min: 0,
            max: Math.max(...data.map(d => d[2]), 10),
            calculable: true,
            orient: "horizontal",
            left: "center",
            bottom: 10,
            inRange: {
                color: ["#e0f2fe", "#0ea5e9", "#0369a1", "#dc2626"]
            }
        },
        series: [{
            name: "Demoras",
            type: "heatmap",
            data: data,
            label: {
                show: true,
                formatter: (params) => params.value[2] || ""
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: "rgba(0, 0, 0, 0.5)"
                }
            }
        }]
    });
}

/* ============================
   MATRIZ ABC-XYZ
============================ */
function renderMatrix() {
    const el = document.getElementById("chartMatrix");
    if (!el) return;

    // Datos simulados para demostración
    const data = [];
    const categorias = ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"];

    for (let i = 0; i < 50; i++) {
        const valor = Math.random() * 100; // Valor de consumo
        const variabilidad = Math.random() * 100; // Variabilidad
        const stock = Math.random() * 500; // Stock actual

        data.push([valor, variabilidad, stock]);
    }

    const chart = echarts.init(el);
    chart.setOption({
        tooltip: {
            formatter: (params) => {
                const [valor, variabilidad, stock] = params.value;
                return `Valor: ${valor.toFixed(1)}<br/>Variabilidad: ${variabilidad.toFixed(1)}<br/>Stock: ${stock.toFixed(0)}`;
            }
        },
        grid: { left: 80, right: 40, top: 40, bottom: 60 },
        xAxis: {
            name: "Valor de Consumo (A → C)",
            nameLocation: "middle",
            nameGap: 30,
            min: 0,
            max: 100
        },
        yAxis: {
            name: "Variabilidad (X → Z)",
            nameLocation: "middle",
            nameGap: 50,
            min: 0,
            max: 100
        },
        series: [{
            type: "scatter",
            symbolSize: (val) => Math.sqrt(val[2]) * 2,
            data: data,
            itemStyle: {
                color: (params) => {
                    const [valor, variabilidad] = params.value;
                    if (valor > 66 && variabilidad < 33) return "#10b981"; // AX
                    if (valor > 66) return "#3b82f6"; // AY/AZ
                    if (valor > 33) return "#f59e0b"; // B
                    return "#ef4444"; // C
                },
                opacity: 0.7
            }
        }]
    });
}

/* ============================
   RENDERIZADO DE KPIs
============================ */
function renderKPIs(rows) {
    // 1. Quiebre de Stock
    const quiebre = calcularQuiebreStock(rows);
    document.getElementById("kpiQuiebre").textContent = fmtPct(quiebre.porcentaje);
    document.getElementById("kpiQuiebreSub").textContent = `${quiebre.sinStock} materiales sin stock de ${quiebre.total}`;

    // 2. Cobertura
    const cobertura = calcularCobertura(rows);
    document.getElementById("kpiCobertura").textContent = `${Math.round(cobertura.diasPromedio)} días`;
    document.getElementById("kpiCoberturaSub").textContent = `Días de cobertura promedio`;

    // 3. Rotación
    const rotacion = calcularRotacion(rows);
    document.getElementById("kpiRotacion").textContent = rotacion.rotacion.toFixed(1);
    document.getElementById("kpiRotacionSub").textContent = `Veces por año`;

    // 4. Inmovilizado
    const inmovilizado = calcularInmovilizado(rows);
    document.getElementById("kpiInmovilizado").textContent = fmtCurrency(inmovilizado.valor);
    document.getElementById("kpiInmovilizadoSub").textContent = `${inmovilizado.cantidad} materiales sin movimiento`;
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

    // Renderizar con todos los datos
    renderKPIs(mmData);
    renderPareto(mmData);
    renderSemaforo();
    renderHeatmap();
    renderMatrix();

    hideLoader();
}

// Iniciar al cargar la página
document.addEventListener("DOMContentLoaded", init);
