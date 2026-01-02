const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

function cleanText(s){
  return (s ?? "").toString().replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
}
function norm(s){
  return cleanText(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ");
}
function parseSimpleCSV(text, delim=";"){
  text = (text ?? "").toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if(!text) return [];
  return text.split(/\n+/).map(line => line.split(delim).map(cleanText));
}
function parseDateToMonth(s){
  s = cleanText(s);
  if(!s) return "";
  const p = s.split("/");
  if(p.length>=3 && p[2]) return `${p[2]}-${(p[1]||"").padStart(2,'0')}`;
  return s;
}

function initEvolucion(){
  fetch(EVOL_URL)
    .then(r=>{
      if(!r.ok) throw new Error(`No pude abrir ${EVOL_URL} (HTTP ${r.status})`);
      return r.text();
    })
    .then(t=>{
      const m = parseSimpleCSV(t, EVOL_DELIM);
      if(!m.length || m.length < 2) return;

      evolHeaders = m[0].map(cleanText);

      evolData = m.slice(1).map(r=>{
        const o = {};
        evolHeaders.forEach((h,i)=> o[h] = cleanText(r[i]));
        return o;
      });

      const colFecha = evolHeaders.find(h=> norm(h).includes("fecha"));
      const colObra  = evolHeaders.find(h=> norm(h).includes("obra"));
      const colPct   = evolHeaders.find(h=> norm(h).includes("dispon"));

      // ✅ Excluir "Cantidad items MM"
      let stackCols = evolHeaders.filter(h =>
        h !== colFecha &&
        h !== colObra &&
        h !== colPct &&
        norm(h) !== norm("Cantidad items MM")
      );

      // ✅ Queremos que "Cantidad Stock Nulo" quede arriba (última en el stack)
      const stockNuloName = stackCols.find(h => norm(h) === norm("Cantidad Stock Nulo"));
      if(stockNuloName){
        stackCols = stackCols.filter(h => h !== stockNuloName);
        stackCols.push(stockNuloName);
      }

      const obraSel = document.getElementById("obraSelect");
      const obras = [...new Set(evolData.map(d=>d[colObra]).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,"es"));

      // reset options (por si se re-init)
      if (obraSel){
        obraSel.querySelectorAll("option:not([value=''])").forEach(o=>o.remove());
        obras.forEach(o=>{
          const opt = document.createElement("option");
          opt.value = o;
          opt.textContent = o;
          obraSel.appendChild(opt);
        });
      }

      function toNum(v){
        const x = cleanText(v).replace("%","").replace(/\./g,"").replace(",",".");
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      }

      function render(){
        const obra = obraSel ? obraSel.value : "";
        const rows = obra ? evolData.filter(d=>d[colObra]===obra) : evolData;

        // map mes -> {count, sums, pctSum}
        const map = {};
        rows.forEach(d=>{
          const mm = parseDateToMonth(d[colFecha]);
          if(!mm) return;

          if(!map[mm]){
            map[mm] = { count: 0, sums: {}, pctSum: 0 };
            stackCols.forEach(c => map[mm].sums[c] = 0);
          }

          map[mm].count += 1;
          stackCols.forEach(c => map[mm].sums[c] += toNum(d[c]) );
          map[mm].pctSum += toNum(d[colPct]);
        });

        const months = Object.keys(map).sort();

        // 📌 PROMEDIO por mes: sum / count
        const avgVal = (m, c) => {
          const cnt = map[m]?.count || 0;
          if(!cnt) return 0;
          return map[m].sums[c] / cnt;
        };
        const avgPct = (m) => {
          const cnt = map[m]?.count || 0;
          if(!cnt) return 0;
          return map[m].pctSum / cnt;
        };

        const seriesBars = stackCols.map(c=>{
          const isStockNulo = norm(c) === norm("Cantidad Stock Nulo");
          return {
            name: c,
            type: "bar",
            stack: "total",
            barMaxWidth: 44,
            itemStyle: {
              color: isStockNulo ? "#d32f2f" : undefined
            },
            // ✅ Etiquetas: Stock Nulo arriba, el resto adentro
            label: {
              show: true,
              position: isStockNulo ? "top" : "inside",
              fontSize: 11,
              formatter: (p)=> (p.value && p.value !== 0) ? `${Math.round(p.value)}` : ""
            },
            emphasis: { focus: "series" },
            data: months.map(m=> avgVal(m, c))
          };
        });

        const seriesLine = {
          name: "% disponibilidad",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 8,
          label: {
            show: true,
            position: "top",
            formatter: (p)=> `${Math.round(p.value)}%`
          },
          data: months.map(m=> avgPct(m))
        };

        const el = document.getElementById("chartEvolucion");
        const chart = echarts.init(el);

        chart.setOption({
          tooltip:{ trigger:"axis" },
          legend:{ type:"scroll", top: 0 },
          grid:{ left: 55, right: 55, top: 55, bottom: 40 },
          xAxis:{ type:"category", data: months },
          yAxis:[
            { type:"value", name:"Promedio" },
            { type:"value", name:"% disponibilidad", axisLabel:{ formatter: "{value}%" } }
          ],
          series:[...seriesBars, seriesLine]
        });

        window.addEventListener("resize", ()=> chart.resize());
      }

      if (obraSel) obraSel.addEventListener("change", render);
      render();
    })
    .catch(err=> console.error(err));
}

document.addEventListener("DOMContentLoaded", initEvolucion);
