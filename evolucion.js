
const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

function parseSimpleCSV(text, delim=";"){
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n").filter(Boolean).map(r => r.split(delim));
}
function clean(v){ return (v ?? "").toString().trim(); }
function normalizeHeaderName(s){
  return clean(s).replace(/^\uFEFF/,"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase();
}
function toNumber(v){
  const s0 = clean(v);
  if(!s0) return 0;
  const s = s0.replace("%","");
  const norm = s.includes(",") ? s.replace(/\./g,"").replace(",",".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}
function parseDateToMonth(s){
  const v = clean(s);
  if(!v) return "";
  const p = v.split("/");
  if(p.length>=3 && p[2]) return `${p[2]}-${p[1].padStart(2,'0')}`;
  return v;
}
function csvEscape(v){
  const s = (v ?? "").toString();
  if(s.includes('"') || s.includes("\n") || s.includes(EVOL_DELIM)){
    return `"${s.replace(/"/g,'""')}"`;
  }
  return s;
}
function downloadCsv(filename, rows){
  if(!rows || !rows.length){
    alert("No hay filas para descargar con ese filtro.");
    return;
  }
  const head = evolHeaders.map(csvEscape).join(EVOL_DELIM);
  const body = rows.map(r => evolHeaders.map(h => csvEscape(r[h])).join(EVOL_DELIM)).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function findColByKeywords(keywords){
  // keywords: array of normalized tokens; all must appear
  const keys = (Array.isArray(keywords) ? keywords : [keywords]).map(normalizeHeaderName);
  return evolHeaders.find(h => {
    const nh = normalizeHeaderName(h);
    return keys.every(k => nh.includes(k));
  }) || null;
}

function initEvolucion(){
  if(!window.echarts){
    console.warn("ECharts no cargó.");
    return;
  }

  fetch(EVOL_URL)
    .then(r=>{
      if(!r.ok) throw new Error(`No pude abrir ${EVOL_URL} (HTTP ${r.status})`);
      return r.text();
    })
    .then(t=>{
      const m = parseSimpleCSV(t, EVOL_DELIM);
      if(!m.length || m.length < 2) return;

      evolHeaders = m[0].map(clean);
      evolData = m.slice(1).map(r=>{
        const o = {};
        evolHeaders.forEach((h,i)=>o[h]=clean(r[i]));
        return o;
      });

      const colFecha = findColByKeywords(["fecha"]);
      const colObra  = findColByKeywords(["obra"]);
      const colPct   = findColByKeywords(["dispon"]); // % disponibilidad

      // IMPORTANT: detect columns robustly (your exact names)
      const colItemsMM = findColByKeywords(["items","mm"]) || findColByKeywords(["item","mm"]) || null;
      const colStockNulo = findColByKeywords(["stock","nulo"]) || findColByKeywords(["nulo"]);
      const colMenorPP = findColByKeywords(["menor","pp"]);
      const colMayorPP = findColByKeywords(["mayor","pp"]);
      const colMayorStockMax = findColByKeywords(["stock","max"]) || findColByKeywords(["stock","maximo"]);

      // Build stacked columns excluding fecha/obra/pct/itemsMM (even if header varies)
      const stackCols = evolHeaders.filter(h => {
        const nh = normalizeHeaderName(h);
        if(h === colFecha || h === colObra || h === colPct) return false;
        if(colItemsMM && h === colItemsMM) return false;
        // extra safety: remove any "cantidad items mm" variant
        if(nh.includes("items") && nh.includes("mm")) return false;
        return true;
      });

      const obraSel = document.getElementById("obraSelect");
      const btnStockNulo = document.getElementById("btnDlStockNulo");
      const btnMenorPP = document.getElementById("btnDlMenorPP");
      const btnMayorStockMax = document.getElementById("btnDlMayorStockMax");

      if(obraSel && colObra){
        obraSel.querySelectorAll("option:not([value=''])").forEach(o => o.remove());
        const obras = [...new Set(evolData.map(d => clean(d[colObra])).filter(Boolean))]
          .sort((a,b)=>a.localeCompare(b,"es"));
        obras.forEach(o=>{
          const opt=document.createElement("option");
          opt.value=o; opt.textContent=o;
          obraSel.appendChild(opt);
        });
      }

      const chartEl = document.getElementById("chartEvolucion");
      if(!chartEl) return;
      const chart = echarts.init(chartEl);

      function getFilteredRows(){
        const obra = obraSel ? obraSel.value : "";
        if(!obra || !colObra) return evolData;
        return evolData.filter(d => clean(d[colObra]) === obra);
      }

      function render(){
        const rows = getFilteredRows();

        const map = {};
        rows.forEach(d=>{
          const mon = parseDateToMonth(colFecha ? d[colFecha] : "");
          if(!mon) return;
          if(!map[mon]){
            map[mon] = { pctVals: [], vals: {} };
            stackCols.forEach(c => map[mon].vals[c] = 0);
          }
          stackCols.forEach(c => map[mon].vals[c] += toNumber(d[c]));
          map[mon].pctVals.push(colPct ? toNumber(d[colPct]) : 0);
        });

        const months = Object.keys(map).sort();

        // Color map
        const colorByCol = {};
        if(colStockNulo) colorByCol[colStockNulo] = "#e53935";     // rojo
        if(colMenorPP) colorByCol[colMenorPP] = "#fb8c00";         // naranja
        if(colMayorPP) colorByCol[colMayorPP] = "#2e7d32";         // verde
        if(colMayorStockMax) colorByCol[colMayorStockMax] = "#1b5e20"; // verde oscuro

        const seriesBars = stackCols.map(c => ({
          name: c,
          type: "bar",
          stack: "total",
          barMaxWidth: 44,
          emphasis: { focus: "series" },
          itemStyle: colorByCol[c] ? { color: colorByCol[c] } : undefined,
          label: {
            show: true,
            position: "inside",
            color: "#fff",
            fontWeight: 800,
            formatter: (p) => (p.value && p.value >= 1) ? `${Math.round(p.value)}` : ""
          },
          data: months.map(m => map[m].vals[c])
        }));

        const seriesLine = {
          name: "% disponibilidad",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          label: {
            show: true,
            position: "top",
            fontWeight: 950,
            formatter: (p) => `${Number(p.value).toFixed(0)}%`
          },
          labelLayout: { moveOverlap: "shiftY" },
          data: months.map(m => {
            const a = map[m].pctVals;
            return a.length ? a.reduce((x,y)=>x+y,0) / a.length : 0;
          })
        };

        chart.setOption({
          grid: { left: 60, right: 66, top: 50, bottom: 44, containLabel: true },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            valueFormatter: (v) => (typeof v === "number" ? v.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : v)
          },
          legend: { top: 6, type: "scroll" },
          xAxis: { type: "category", data: months },
          yAxis: [
            { type: "value", name: "Cantidad", nameLocation: "middle", nameGap: 44 },
            { type: "value", name: "% disponibilidad", min: 0, max: 100, nameLocation: "middle", nameGap: 54,
              axisLabel: { formatter: (v)=> `${v}%` }
            }
          ],
          series: [...seriesBars, seriesLine]
        }, true);
      }

      // Wire downloads even if a column wasn't detected -> show alert with reason
      if(btnStockNulo){
        btnStockNulo.addEventListener("click", () => {
          if(!colStockNulo) return alert("No encontré la columna 'Cantidad Stock Nulo' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colStockNulo]) > 0);
          const obra = obraSel ? obraSel.value : "";
          const name = `EVOLUCION_stock_nulo${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`;
          downloadCsv(name, rows);
        });
      }
      if(btnMenorPP){
        btnMenorPP.addEventListener("click", () => {
          if(!colMenorPP) return alert("No encontré la columna 'Cantidad Menor a PP' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colMenorPP]) > 0);
          const obra = obraSel ? obraSel.value : "";
          const name = `EVOLUCION_menor_PP${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`;
          downloadCsv(name, rows);
        });
      }
      if(btnMayorStockMax){
        btnMayorStockMax.addEventListener("click", () => {
          if(!colMayorStockMax) return alert("No encontré la columna 'Cantidad mayor a Stock Maximo' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colMayorStockMax]) > 0);
          const obra = obraSel ? obraSel.value : "";
          const name = `EVOLUCION_mayor_stock_max${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`;
          downloadCsv(name, rows);
        });
      }

      if(obraSel) obraSel.addEventListener("change", render);
      window.addEventListener("resize", () => chart.resize());
      render();
    })
    .catch(err => console.error(err));
}

document.addEventListener("DOMContentLoaded", initEvolucion);
