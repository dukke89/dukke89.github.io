
const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

function parseSimpleCSV(text, delim=";"){
  return text.trim().split(/\n+/).map(r => r.split(delim));
}

function parseDateToMonth(s){
  if(!s) return "";
  const p = s.split("/");
  if(p.length>=2 && p[2]) return `${p[2]}-${p[1].padStart(2,'0')}`;
  return s;
}

function initEvolucion(){
  fetch(EVOL_URL)
    .then(r=>r.text())
    .then(t=>{
      const m = parseSimpleCSV(t, EVOL_DELIM);
      evolHeaders = m[0];
      evolData = m.slice(1).map(r=>{
        const o={};
        evolHeaders.forEach((h,i)=>o[h]=r[i]);
        return o;
      });

      const colFecha = evolHeaders.find(h=>h.toLowerCase().includes("fecha"));
      const colObra = evolHeaders.find(h=>h.toLowerCase().includes("obra"));
      const colPct = evolHeaders.find(h=>h.toLowerCase().includes("dispon"));

      const stackCols = evolHeaders.filter(h =>
        h !== colFecha &&
        h !== colObra &&
        h !== colPct &&
        h !== "Cantidad de materiales MM"
      );

      const obraSel = document.getElementById("obraSelect");
      const obras = [...new Set(evolData.map(d=>d[colObra]).filter(Boolean))];
      obras.forEach(o=>{
        const opt=document.createElement("option");
        opt.value=o; opt.textContent=o;
        obraSel.appendChild(opt);
      });

      function render(){
        const obra = obraSel.value;
        const rows = obra ? evolData.filter(d=>d[colObra]===obra) : evolData;

        const map = {};
        rows.forEach(d=>{
          const m = parseDateToMonth(d[colFecha]);
          if(!map[m]){
            map[m]={pct:[], vals:{}};
            stackCols.forEach(c=>map[m].vals[c]=0);
          }
          stackCols.forEach(c=> map[m].vals[c]+= Number((d[c]||"0").replace(",", "."))||0 );
          map[m].pct.push( Number((d[colPct]||"0").replace("%","").replace(",", "."))||0 );
        });

        const months = Object.keys(map).sort();

        const seriesBars = stackCols.map(c=>({
          name: c,
          type: "bar",
          stack: "total",
          itemStyle: {
            color: c === "Cantidad materiales Stock Nulo" ? "#d32f2f" : undefined
          },
          data: months.map(m=>map[m].vals[c])
        }));

        const seriesLine = {
          name: "% disponibilidad",
          type:"line",
          yAxisIndex:1,
          data: months.map(m=>{
            const a = map[m].pct;
            return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
          })
        };

        const chart = echarts.init(document.getElementById("chartEvolucion"));
        chart.setOption({
          tooltip:{trigger:"axis"},
          legend:{},
          xAxis:{type:"category", data:months},
          yAxis:[
            {type:"value", name:"Cantidad"},
            {type:"value", name:"% disponibilidad"}
          ],
          series:[...seriesBars, seriesLine]
        });
      }

      obraSel.addEventListener("change", render);
      render();
    });
}

document.addEventListener("DOMContentLoaded", initEvolucion);
