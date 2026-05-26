const csvUrl = "./SERVICIOS OBRA.json";
const DELIM = ";";

const CLIENT_COL_NAME = "CLIENTE";
const PERIODO_COL_NAME = "Período de certificación";
const ESTADO_COL_NAME = "Estado Servicio";
const ESTADO_CERT_COL = "Estado Certificación";
const G_COMPRA_COL_NAME = "Grupo de Compra Definitivo";
const ESTADO_ITEM_COL = "ESTADO ITEM";

let data = [];
let headers = [];

const clean = (v) => (v ?? "").toString().trim();
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt ?? ""; }
function fmtInt(n) { return Number(n || 0).toLocaleString("es-AR"); }

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === DELIM && !inQuotes) { row.push(cur); cur = ""; }
        else if (ch === "\n" && !inQuotes) { row.push(cur); rows.push(row); row = []; cur = ""; }
        else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

function syncScrolls() {
    const top = document.getElementById('top-scroll');
    const bottom = document.getElementById('bottom-scroll');
    const fake = document.getElementById('fake-content');
    const table = document.getElementById('tablaServicios');
    if (top && bottom && fake && table) {
        fake.style.width = table.offsetWidth + 'px';
        top.onscroll = () => { bottom.scrollLeft = top.scrollLeft; };
        bottom.onscroll = () => { top.scrollLeft = bottom.scrollLeft; };
    }
}

function getSelValues(id) {
    const sel = document.getElementById(id);
    if (!sel) return [];
    return [...sel.selectedOptions].map(o => o.value).filter(v => v !== "__ALL__");
}

function downloadCSV(rows) {
    if (!rows.length) return alert("No hay datos seleccionados para descargar.");
    const headerRow = headers.join(";");
    const contentRows = rows.map(r => headers.map(h => (r[h] ?? "").toString().replace(/;/g, ",")).join(";"));
    const csvContent = "\ufeff" + [headerRow, ...contentRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Seleccion_Servicios.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function applyAll() {
 const selClientes = getSelValues("clienteSelect");
    const selPeriodos = getSelValues("clasif2Select");
    const selEstados = getSelValues("gcocSelect");
    const selGrupos = getSelValues("grupoCompraSelect");
    const selItemEst = getSelValues("estadoItemSelect"); 
    
    const filtered = data.filter(r => {
        const matchClie = !selClientes.length || selClientes.includes(r[CLIENT_COL_NAME]);
        const matchPeri = !selPeriodos.length || selPeriodos.includes(r[PERIODO_COL_NAME]);
        const matchEsta = !selEstados.length || selEstados.includes(r[ESTADO_COL_NAME]);
        const matchGrup = !selGrupos.length || selGrupos.includes(r[G_COMPRA_COL_NAME]);
        const matchItem = !selItemEst.length || selItemEst.includes(r[ESTADO_ITEM_COL]); // Nuevo
        return matchClie && matchPeri && matchEsta && matchGrup && matchItem;
    });

    setText("kpiTotal", fmtInt(filtered.length));

    const tbody = document.getElementById("tablaBody");
    tbody.innerHTML = "";

    filtered.forEach(r => {
        const tr = document.createElement("tr");
        const estCert = clean(r[ESTADO_CERT_COL]).toLowerCase();
        if (estCert === "verde") tr.classList.add("row-verde");
        else if (estCert === "rojo") tr.classList.add("row-rojo");

        const valorItem = clean(r[ESTADO_ITEM_COL]).toUpperCase();
        let claseCelda = "";
        const rojos = ["ADJUDICADO", "ADJUDICADO PARCIAL", "RESPONDIDO", "INCOMPLETO","SIN TRATAMIENTO"];
        const verdes = ["CUMPLIDO", "ALMACENADO", "CONSUMIDO PARCIAL"];

        if (rojos.includes(valorItem)) claseCelda = "cell-rojo";
        else if (verdes.includes(valorItem)) claseCelda = "cell-verde";

        tr.innerHTML = `
            <td>${r["NRO. VA01/VA21"] || ""}</td>
            <td>${r["CODIGO ITEM"] || ""}</td>
            <td>${r["DESCRIPCION ITEM"] || ""}</td>
            <td>${r["CANTIDAD SOLICITADA"] || ""}</td>
            <td>${r["CANTIDAD TOTAL RECEPCIONADA"] || ""}</td>
            <td>${r["CANTIDAD PENDIENTE DE ADJUDICAR"] || ""}</td>
            <td>${r["CANTIDAD TOTAL PENDIENTE RECEP."] || ""}</td>
            <td class="${claseCelda}">${r["ESTADO ITEM"] || ""}</td>
            <td>${r["FECHA ENTREGA ESPERADA"] || ""}</td>
            <td>${r["NRO. RECEPCION"] || ""}</td>
            <td>${r["FECHA RECEPCION"] || ""}</td>
            <td>${r["NRO. OC"] || ""}</td>
            <td>${r["Grupo de Compra Definitivo"] || ""}</td>
            <td>${r["Estado Servicio"] || ""}</td>
            <td>${r["Período de certificación"] || ""}</td>
        `;
        tbody.appendChild(tr);
    });
    setTimeout(syncScrolls, 150);
    return filtered;
}

// 1. Registro del plugin corregido
Chart.register(ChartDataLabels);

window.addEventListener("DOMContentLoaded", () => {
    fetch(csvUrl + "?t=" + window.CACHE_BUSTER)
    .then(r => r.json())
    .then(jsonData => {
        if (!jsonData || !jsonData.length) return;
        headers = Object.keys(jsonData[0]).map(clean);
        data = jsonData.map(row => {
            let o = {};
            for (let k in row) o[clean(k)] = clean(row[k]);
            return o;
        });

      fill("clienteSelect", CLIENT_COL_NAME);
fill("clasif2Select", PERIODO_COL_NAME);
fill("gcocSelect", ESTADO_COL_NAME);
fill("grupoCompraSelect", G_COMPRA_COL_NAME);
fill("estadoItemSelect", ESTADO_ITEM_COL); // Nuevo

// Agregar el listener para el cambio
["clienteSelect", "clasif2Select", "gcocSelect", "grupoCompraSelect", "estadoItemSelect"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
        applyAll();
        actualizarGraficoConDatos();
    });
});

        document.getElementById("btnDownloadSelection")?.addEventListener("click", () => {
            const currentFiltered = applyAll();
            downloadCSV(currentFiltered);
        });

        applyAll();
        
        const ctx = document.getElementById('chartEstados').getContext('2d');
        window.miGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2 }] },
            options: {
                responsive: true,
                plugins: { 
                    legend: { position: 'bottom' },
                    datalabels: { // 2. Configuración de etiquetas permanente
                        color: '#fff',
                        font: { weight: 'bold', size: 12 },
                        formatter: (value, ctx) => {
                            let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            let percentage = (value * 100 / sum).toFixed(1) + "%";
                            return value + "\n(" + percentage + ")";
                        }
                    }
                },
                cutout: '65%'
            }
        });
        actualizarGraficoConDatos();

        document.getElementById("loader").style.display = "none";
        window.addEventListener('resize', syncScrolls);
    });
});

function fill(id, col) {
    const values = [...new Set(data.map(r => r[col]).filter(Boolean))].sort();
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="__ALL__">Todos</option>';
    values.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v; opt.textContent = v;
        sel.appendChild(opt);
    });
}

function actualizarGraficoConDatos() {
    if (!window.miGrafico) return;

    const actuales = applyAll(); 
    const conteo = {};
    actuales.forEach(r => {
        const estado = r[ESTADO_COL_NAME] || "Sin Estado";
        conteo[estado] = (conteo[estado] || 0) + 1;
    });

    const labels = Object.keys(conteo);
    const valores = Object.values(conteo);

    const mapaColores = {
        'En curso - Próximo a vencer': '#fbbf24', 
        'En curso': '#10b981',                  
        'En curso - Total recepcionado': '#f97316', 
        'Pedido de Info': '#a855f7',            
        'Vencido con cant pendiente a recep': '#ef4444' 
    };

    const coloresAsignados = labels.map(label => {
        return mapaColores[label] || '#64748b'; 
    });
    
    // --- ACTUALIZACIÓN DE DATOS ---
    window.miGrafico.data.labels = labels;
    window.miGrafico.data.datasets[0].data = valores;
    window.miGrafico.data.datasets[0].backgroundColor = coloresAsignados;

    // --- CONFIGURACIÓN PARA LEYENDA LATERAL ---
    window.miGrafico.options.plugins.legend = {
        display: true,
        position: 'right',     // La mueve al costado derecho
        align: 'center',       // Centra la lista verticalmente
        labels: {
            boxWidth: 15,      // Cuadradito más pequeño para que no ocupe tanto espacio
            padding: 20,       // Espaciado entre etiquetas para que se vean "apiladas"
            font: {
                size: 12       // Tamaño de fuente legible
            }
        }
    };

    // Si quieres que el gráfico se ajuste al espacio, asegúrate de que esto esté en true
    window.miGrafico.options.maintainAspectRatio = false;
    
    window.miGrafico.update();
}
