
const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

function parseSimpleCSV(text, delim=";"){
  // robust enough for typical Excel-exported CSV with ';' delimiter (no embedded ';' inside quotes expected).
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n").filter(Boolean).map(r => r.split(delim));
}

function clean(v){ return (v ?? "").toString().trim(); }

function normalizeHeaderName(s){
  return clean(s)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNumber(v){
  const s0 = clean(v);
  if(!s0) return 0;
  const s = s0.replace("%","");
  // "1.234,56" -> 1234.56 ; "1234,56" -> 1234.56
  const norm = s.includes(",") ? s.replace(/\./g,"").replace(",",".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateToMonth(s){
  // expects dd/mm/yyyy
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

function initEvolucion(){
  if(!window.echarts){
    console.warn("ECharts no cargó. Revisá el <script src=...echarts.min.js> en analisis-mm.html");
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

      // columns
      const colFecha = evolHeaders.find(h=>normalizeHeaderName(h).includes("fecha"));
      const colObra  = evolHeaders.find(h=>normalizeHeaderName(h).includes("obra"));
      const colPct   = evolHeaders.find(h=>normalizeHeaderName(h).includes("dispon"));

      // helper to find by normalized name contains keyword(s)
      const findCol = (mustInclude) => {
        const keys = Array.isArray(mustInclude) ? mustInclude : [mustInclude];
        return evolHeaders.find(h => {
          const nh = normalizeHeaderName(h);
          return keys.every(k => nh.includes(normalizeHeaderName(k)));
        });
      };

      const colItemsMM = findCol(["cantidad","items","mm"]); // "Cantidad items MM"
      const colStockNulo = findCol(["cantidad","stock","nulo"]);
      const colMenorPP = findCol(["cantidad","menor","pp"]);
      const colMayorPP = findCol(["cantidad","mayor","pp"]);
      const colMayorStockMax = findCol(["cantidad","stock","maximo"]); // "Cantidad mayor a Stock Maximo"

      // stacked bars columns: all except fecha/obra/pct/itemsMM
      const stackCols = evolHeaders.filter(h => ![colFecha,colObra,colPct,colItemsMM].includes(h));

      const obraSel = document.getElementById("obraSelect");
      const btnStockNulo = document.getElementById("btnDlStockNulo");
      const btnMenorPP = document.getElementById("btnDlMenorPP");
      const btnMayorStockMax = document.getElementById("btnDlMayorStockMax");

      if(obraSel){
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
        return obra ? evolData.filter(d => clean(d[colObra]) === obra) : evolData;
      }

      function render(){
        const rows = getFilteredRows();

        // month aggregation
        const map = {};
        rows.forEach(d=>{
          const mon = parseDateToMonth(d[colFecha]);
          if(!mon) return;

          if(!map[mon]){
            map[mon] = { pctVals: [], vals: {} };
            stackCols.forEach(c => map[mon].vals[c] = 0);
          }
          stackCols.forEach(c => map[mon].vals[c] += toNumber(d[c]));
          map[mon].pctVals.push(toNumber(d[colPct])); // 0..100
        });

        const months = Object.keys(map).sort();

        // color map by normalized column name
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
            fontWeight: 800,
            formatter: (p) => (p.value && p.value !== 0) ? `${Math.round(p.value)}` : ""
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
          data: months.map(m => {
            const a = map[m].pctVals;
            return a.length ? a.reduce((x,y)=>x+y,0) / a.length : 0;
          })
        };

        chart.setOption({
          grid: { left: 60, right: 60, top: 44, bottom: 44, containLabel: true },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          legend: { top: 0, type: "scroll" },
          xAxis: {
            type: "category",
            data: months,
            axisLabel: { rotate: 0 }
          },
          yAxis: [
            { type: "value", name: "Cantidad", nameLocation: "middle", nameGap: 44 },
            { type: "value", name: "% disponibilidad", min: 0, max: 100, nameLocation: "middle", nameGap: 52 }
          ],
          series: [...seriesBars, seriesLine]
        }, true);
      }

      // Downloads (all columns), filtered by obra + metric > 0
      if(btnStockNulo && colStockNulo){
        btnStockNulo.addEventListener("click", () => {
          const rows = getFilteredRows().filter(r => toNumber(r[colStockNulo]) > 0);
          const obra = obraSel ? obraSel.value : "";
          const name = `EVOLUCION_stock_nulo${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`;
          downloadCsv(name, rows);
        });
      }
      if(btnMenorPP && colMenorPP){
        btnMenorPP.addEventListener("click", () => {
          const rows = getFilteredRows().filter(r => toNumber(r[colMenorPP]) > 0);
          const obra = obraSel ? obraSel.value : "";
          const name = `EVOLUCION_menor_PP${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`;
          downloadCsv(name, rows);
        });
      }
      if(btnMayorStockMax && colMayorStockMax){
        btnMayorStockMax.addEventListener("click", () => {
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
