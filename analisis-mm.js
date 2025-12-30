/* ============================
   ANALISIS-MM.js (COMPLETO)
=========================== */

const CSV_PATH = "ANALISIS-MM.csv";
const DELIM = ";";

const CLIENT_CANDIDATES   = ["ALMACEN", "Cliente", "CLIENTE", "OBRA", "CENTRO"];
const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM", "Codigo Item", "CODIGO"];
const LIBRE_CANDIDATES    = ["Libre utilizacion", "Libre utilización", "LIBRE UTILIZACION", "LIBRE UTILIZACIÓN", "LIBRE", "Libre"];
const ESTADO_CANDIDATES   = ["Estado", "ESTADO", "estado"];
const RUBRO_CANDIDATES    = ["RUBRO", "Rubro", "rubro", "CLASIFICACION", "CLASIFICACIÓN"];
const VALOR_CANDIDATES    = ["Valor libre utilización", "Valor libre utilizacion","VALOR LIBRE UTILIZACION","VALOR LIBRE UTILIZACIÓN","VALOR","Valor"];

let headers=[], dataRows=[];
let COL_CLIENT=null, COL_MATERIAL=null, COL_LIBRE=null, COL_ESTADO=null, COL_RUBRO=null, COL_VALOR=null;
let chartDonut=null;

function clean(s){return String(s??"").trim();}
function normLoose(s){return clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function byFirstExisting(c){const h=headers.map(normLoose);for(const x of c){const i=h.indexOf(normLoose(x));if(i>=0)return headers[i];}return null;}
function parseDelimited(t,d){return t.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(d));}
function toNum(v){let s=String(v??"").replace(/[^0-9,.-]/g,"");if(s.includes(",")&&s.includes("."))s=s.replace(/\./g,"").replace(",",".");else if(s.includes(","))s=s.replace(",",".");const n=Number(s);return isFinite(n)?n:NaN;}
function fmtInt(n){return isFinite(n)?Math.round(n).toLocaleString("es-AR"):"-";}
function fmtMoney(n){return isFinite(n)?n.toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}):"-";}

function calcEstados(rows){
  const m=new Map();
  rows.forEach(r=>{
    const e=clean(r[COL_ESTADO]);const mat=clean(r[COL_MATERIAL]);
    if(!mat)return;
    if(!m.has(e))m.set(e,new Set());
    m.get(e).add(mat);
  });
  const items=[...m.entries()].map(([estado,set])=>({estado,qty:set.size}));
  items.sort((a,b)=>{
    const na=parseInt(a.estado)||99, nb=parseInt(b.estado)||99;
    return na-nb;
  });
  return {items,total:items.reduce((s,x)=>s+x.qty,0)};
}

function buildDonut(items,total){
  const host=document.getElementById("donutEstados");
  const legend=document.getElementById("donutLegend");
  if(!host||!legend||!window.echarts)return;

  const COLORS={"01":"#ef4444","02":"#f59e0b","03":"#16a34a","04":"#2563eb"};
  const getCode=l=>(String(l).match(/^(\d{2})/)||[])[1];

  const data=items.map(it=>({name:it.estado,value:it.qty,itemStyle:{color:COLORS[getCode(it.estado)]||"#64748b"}}));

  if(!chartDonut)chartDonut=echarts.init(host); else chartDonut.clear();

  chartDonut.setOption({
    color:[],
    series:[{type:"pie",radius:["45%","78%"],label:{formatter:p=>{
      const pct=total?p.value/total*100:0;
      return pct>=4?`${p.name}\n${pct.toFixed(0)}%`:"";
    }},data}]
  });

  legend.innerHTML="";
  items.forEach(it=>{
    const c=COLORS[getCode(it.estado)]||"#64748b";
    const pct=total?((it.qty/total)*100).toFixed(0)+"%":"-";
    legend.innerHTML+=`<div class="legend-card"><span class="legend-dot" style="background:${c}"></span><div><div class="legend-title">${it.estado}</div><div class="callout-pct" style="color:${c}">${pct}</div><div class="callout-sub">${fmtInt(it.qty)} materiales</div></div></div>`;
  });
}

function buildValorizacionStock(rows){
  const tb=document.querySelector("#tablaValorizacion tbody");
  if(!tb)return; tb.innerHTML="";
  const m=new Map(); let total=0;
  rows.forEach(r=>{
    const rub=clean(r[COL_RUBRO]); const v=toNum(r[COL_VALOR]);
    if(!rub||!isFinite(v))return;
    total+=v; m.set(rub,(m.get(rub)||0)+v);
  });
  let acum=0;
  [...m.entries()].sort((a,b)=>b[1]-a[1]).forEach(([rub,v])=>{
    const pct=v/total; acum+=pct;
    tb.innerHTML+=`<tr><td>${rub}</td><td class="num">${fmtMoney(v)}</td><td class="num">${(pct*100).toFixed(2)}%</td><td class="num">${(acum*100).toFixed(2)}%</td></tr>`;
  });
  document.getElementById("valTotal").textContent=fmtMoney(total);
}

window.addEventListener("DOMContentLoaded",()=>{
  fetch(CSV_PATH).then(r=>r.text()).then(t=>{
    const m=parseDelimited(t,DELIM); headers=m[0];
    COL_CLIENT=byFirstExisting(CLIENT_CANDIDATES);
    COL_MATERIAL=byFirstExisting(MATERIAL_CANDIDATES);
    COL_LIBRE=byFirstExisting(LIBRE_CANDIDATES);
    COL_ESTADO=byFirstExisting(ESTADO_CANDIDATES);
    COL_RUBRO=byFirstExisting(RUBRO_CANDIDATES);
    COL_VALOR=byFirstExisting(VALOR_CANDIDATES);

    dataRows=m.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
    const e=calcEstados(dataRows);
    buildDonut(e.items,e.total);
    buildValorizacionStock(dataRows);
  });
});
