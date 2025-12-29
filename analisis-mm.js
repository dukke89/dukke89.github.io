
const csvUrl = "ANALISIS-MM.csv";
const DELIM = ";";

let data = [];
let headers = [];
let COL_CLIENT=null, COL_ESTADO=null, COL_MATERIAL=null;

function normalizeHeaderName(s){
  return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}
function byFirstExisting(candidates){
  const norm=headers.map(h=>normalizeHeaderName(h));
  for(const c of candidates){
    const i=norm.indexOf(normalizeHeaderName(c));
    if(i>=0) return headers[i];
  }
  return null;
}
function clean(v){ return (v??"").toString().trim(); }
function parseDelimited(text, d){
  const rows=[]; let cur="", row=[], q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch=='"'){ q=!q; }
    else if(ch===d && !q){ row.push(cur); cur=""; }
    else if(ch==='\n' && !q){ row.push(cur); rows.push(row); row=[]; cur=""; }
    else cur+=ch;
  }
  if(cur||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function getSelectedCliente(){
  return document.getElementById("clienteSelect").value;
}
function filteredRows(){
  const c=getSelectedCliente();
  if(!c) return data;
  return data.filter(r=>clean(r[COL_CLIENT])===c);
}
function renderClientes(){
  const sel=document.getElementById("clienteSelect");
  const vals=[...new Set(data.map(r=>clean(r[COL_CLIENT])).filter(Boolean))];
  vals.sort().forEach(v=>{
    const o=document.createElement("option");
    o.value=v; o.textContent=v; sel.appendChild(o);
  });
}

function calcEstados(rows){
  const map=new Map();
  rows.forEach(r=>{
    const e=clean(r[COL_ESTADO])||"(Sin estado)";
    const m=clean(r[COL_MATERIAL]);
    if(!m) return;
    if(!map.has(e)) map.set(e,new Set());
    map.get(e).add(m);
  });
  const items=[...map.entries()].map(([estado,set])=>({estado,qty:set.size}));
  items.sort((a,b)=>b.qty-a.qty);
  const total=items.reduce((s,x)=>s+x.qty,0);
  return {items,total};
}

function renderTable(items,total){
  const tb=document.getElementById("tablaValorizacion");
  tb.innerHTML="";
  items.forEach(it=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${it.estado}</td>
                  <td class="num">${it.qty}</td>
                  <td class="num">${total?((it.qty/total)*100).toFixed(0):0}%</td>`;
    tb.appendChild(tr);
  });
}

function renderDonut(items){
  const chart=echarts.init(document.getElementById("donutEstados"));
  chart.setOption({
    tooltip:{trigger:'item'},
    series:[{
      type:'pie',
      radius:['45%','70%'],
      avoidLabelOverlap:false,
      label:{show:true,formatter:'{d}%'},
      emphasis:{scale:true,scaleSize:8},
      data:items.map(i=>({name:i.estado,value:i.qty}))
    }]
  });
}

function applyAll(){
  const rows=filteredRows();
  const e=calcEstados(rows);
  renderDonut(e.items);
  renderTable(e.items,e.total);
}

window.addEventListener("DOMContentLoaded",()=>{
  fetch(csvUrl).then(r=>r.text()).then(t=>{
    const m=parseDelimited(t,DELIM);
    headers=m[0];
    COL_CLIENT=byFirstExisting(["ALMACEN","Almacen"]);
    COL_ESTADO=byFirstExisting(["Estado","ESTADO"]);
    COL_MATERIAL=byFirstExisting(["Material","MATERIAL"]);
    data=m.slice(1).map(r=>{
      const o={}; headers.forEach((h,i)=>o[h]=r[i]); return o;
    });
    renderClientes();
    applyAll();
    document.getElementById("clienteSelect").addEventListener("change",applyAll);
    document.getElementById("btnReset").addEventListener("click",()=>{
      document.getElementById("clienteSelect").value="";
      applyAll();
    });
  });
});
