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
      const stackCols = evolHeaders.filter(h =>
        h !== colFecha &&
        h !== colObra &&
        h !== colPct &&
        norm(h) !== norm("Cantidad items MM")
      );

      const obraSel = document.getElementById("obraSelect");
      const obras = [...new Set(evolData.map(d=>d[colObra]).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,"es"));

      obras.forEach(o=>{
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        obraSel.appendChild(opt);
      });

      function toNum(v){
        const x = cleanText(v).replace("%","").replace(/\./g,"").replace(",",".");
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      }

      function render(){
        const obra = obraSel.value;
        const rows = obra ? evolData.filter(d=>d[colObra]===obra) : evolData;

        const map = {};
        rows.forEach(d=>{
          const mm = parseDateToMonth(d[colFecha]);
          if(!map[mm]){
            map[mm] = { pct: [], vals: {} };
            stackCols.forEach(c => map[mm].vals[c] = 0);
          }
          stackCols.forEach(c => map[mm].vals[c] += toNum(d[c]) );
          map[mm].pct.push( toNum(d[colPct]) );
        });

        const months = Object.keys(map).sort();

        const seriesBars = stackCols.map(c=>({
          name: c,
          type: "bar",
          stack: "total",
          barMaxWidth: 44,
          itemStyle: {
            // 🔴 Stock Nulo en rojo
            color: norm(c) === norm("Cantidad Stock Nulo") ? "#d32f2f" : undefined
          },
          // ✅ Etiquetas
          label: {
            show: true,
            position: "inside",
            fontSize: 11,
            formatter: (p)=> (p.value && p.value !== 0) ? `${p.value}` : ""
          },
          emphasis: { focus: "series" },
          data: months.map(m=> map[m].vals[c] )
        }));

        const seriesLine = {
          name: "% disponibilidad",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 8,
          // ✅ Etiquetas línea
          label: {
            show: true,
            position: "top",
            formatter: (p)=> `${Math.round(p.value)}%`
          },
          data: months.map(m=>{
            const a = map[m].pct;
            return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
          })
        };

        const el = document.getElementById("chartEvolucion");
        const chart = echarts.init(el);

        chart.setOption({
          tooltip:{ trigger:"axis" },
          legend:{ type:"scroll", top: 0 },
          grid:{ left: 50, right: 55, top: 55, bottom: 40 },
          xAxis:{ type:"category", data: months },
          yAxis:[
            { type:"value", name:"Cantidad" },
            { type:"value", name:"% disponibilidad", axisLabel:{ formatter: "{value}%" } }
          ],
          series:[...seriesBars, seriesLine]
        });

        window.addEventListener("resize", ()=> chart.resize());
      }

      obraSel.addEventListener("change", render);
      render();
    })
    .catch(err=> console.error(err));
}

document.addEventListener("DOMContentLoaded", initEvolucion);
