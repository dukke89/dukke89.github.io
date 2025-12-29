
const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

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

/* CSV parser simple but QUOTE-SAFE (igual al de analisis-mm.js) */
function parseDelimited(text, delimiter=";"){
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

function findColByKeywords(keywords){
  const keys = (Array.isArray(keywords) ? keywords : [keywords]).map(normalizeHeaderName);
  return evolHeaders.find(h => {
    const nh = normalizeHeaderName(h);
    return keys.every(k => nh.includes(k));
  }) || null;
}

function setEvolMsg(msg){
  const el = document.getElementById("evolMsg");
  if(el) el.textContent = msg || "";
}

function csvEscape(delim, v){
  const s = (v ?? "").toString();
  if(s.includes('"') || s.includes("\n") || s.includes(delim)){
    return `"${s.replace(/"/g,'""')}"`;
  }
  return s;
}

function downloadCsv(filename, rows){
  if(!rows || !rows.length){
    alert("No hay filas para descargar con ese filtro.");
    return;
  }
  const head = evolHeaders.map(h => csvEscape(EVOL_DELIM, h)).join(EVOL_DELIM);
  const body = rows.map(r => evolHeaders.map(h => csvEscape(EVOL_DELIM, r[h])).join(EVOL_DELIM)).join("\n");
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
    setEvolMsg("No se cargó ECharts (echarts.min.js).");
    return;
  }

  setEvolMsg("Cargando EVOLUCION.csv…");

  fetch(EVOL_URL)
    .then(r=>{
      if(!r.ok) throw new Error(`No pude abrir ${EVOL_URL} (HTTP ${r.status})`);
      return r.text();
    })
    .then(t=>{
      // parse
      let m = parseDelimited(t, EVOL_DELIM);
      if(!m.length || m.length < 2){
        // fallback delimitador ","
        m = parseDelimited(t, ",");
      }
      if(!m.length || m.length < 2){
        setEvolMsg("EVOLUCION.csv está vacío o no tiene filas.");
        return;
      }

      evolHeaders = m[0].map(clean);
      evolData = m.slice(1).map(row=>{
        const o = {};
        evolHeaders.forEach((h,i)=>o[h]=clean(row[i]));
        return o;
      });

      // detect columns
      const colFecha = findColByKeywords(["fecha"]);
      const colObra  = findColByKeywords(["obra"]);
      const colPct   = findColByKeywords(["dispon"]); // % disponibilidad

      const colItemsMM = findColByKeywords(["items","mm"]) || findColByKeywords(["item","mm"]) || null;
      const colStockNulo = findColByKeywords(["stock","nulo"]) || null;
      const colMenorPP = findColByKeywords(["menor","pp"]) || null;
      const colMayorPP = findColByKeywords(["mayor","pp"]) || null;
      const colMayorStockMax = findColByKeywords(["stock","max"]) || findColByKeywords(["stock","maximo"]) || null;

      if(!colFecha){
        setEvolMsg("No encontré la columna 'Fecha' en EVOLUCION.csv.");
        return;
      }
      if(!colPct){
        setEvolMsg("No encontré la columna '% disponibilidad' en EVOLUCION.csv.");
        return;
      }

      // stacked columns excluding fecha/obra/pct/itemsMM (and safety 'items mm')
      const stackCols = evolHeaders.filter(h => {
        const nh = normalizeHeaderName(h);
        if(h === colFecha || h === colObra || h === colPct) return false;
        if(colItemsMM && h === colItemsMM) return false;
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

        // aggregate by month
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
        if(!months.length){
          setEvolMsg("Sin datos para el filtro actual.");
          chart.clear();
          return;
        }
        setEvolMsg("");

        // fixed colors for requested series
        const colorByCol = {};
        if(colStockNulo) colorByCol[colStockNulo] = "#e53935";       // rojo
        if(colMenorPP) colorByCol[colMenorPP] = "#fb8c00";           // naranja
        if(colMayorPP) colorByCol[colMayorPP] = "#2e7d32";           // verde
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
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
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

      // downloads (all columns) filtered by obra + metric > 0
      if(btnStockNulo){
        btnStockNulo.addEventListener("click", () => {
          if(!colStockNulo) return alert("No encontré la columna 'Cantidad Stock Nulo' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colStockNulo]) > 0);
          const obra = obraSel ? obraSel.value : "";
          downloadCsv(`EVOLUCION_stock_nulo${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`, rows);
        });
      }
      if(btnMenorPP){
        btnMenorPP.addEventListener("click", () => {
          if(!colMenorPP) return alert("No encontré la columna 'Cantidad Menor a PP' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colMenorPP]) > 0);
          const obra = obraSel ? obraSel.value : "";
          downloadCsv(`EVOLUCION_menor_PP${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`, rows);
        });
      }
      if(btnMayorStockMax){
        btnMayorStockMax.addEventListener("click", () => {
          if(!colMayorStockMax) return alert("No encontré la columna 'Cantidad mayor a Stock Maximo' en EVOLUCION.csv.");
          const rows = getFilteredRows().filter(r => toNumber(r[colMayorStockMax]) > 0);
          const obra = obraSel ? obraSel.value : "";
          downloadCsv(`EVOLUCION_mayor_stock_max${obra ? "_" + obra.replace(/\s+/g,"_") : ""}.csv`, rows);
        });
      }

      if(obraSel) obraSel.addEventListener("change", render);
      window.addEventListener("resize", () => chart.resize());
      render();
    })
    .catch(err => {
      console.error(err);
      setEvolMsg(`Error cargando ${EVOL_URL}. Revisá el nombre EXACTO y que esté en la misma carpeta.`);
    });
}

document.addEventListener("DOMContentLoaded", initEvolucion);
