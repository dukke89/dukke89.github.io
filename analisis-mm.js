// analisis-mm.js (MODIFICADO)
// CAMBIO UNICO:
// El botón 01-STOCK NULO descarga el archivo físico del repo: "STO NULO.csv"

// ===== CONFIG =====
const csvUrl = "./ANALISIS-MM.csv";
const DELIM = ";";

const CLIENT_CANDIDATES = ["ALMACEN","Almacén","Almacen","ALMACÉN","Cliente","CLIENTE","CLIENTE (ALMACEN)"];
const MATERIAL_CANDIDATES = ["Material","MATERIAL","Código Item","CODIGO ITEM","Codigo Item","CODIGOITEM"];
const LIBRE_CANDIDATES = ["Libre utilización","Libre utilizacion","LIBRE UTILIZACION","Libre Utilizacion","Libre utilización ","Libre utilizacion "];
const ESTADO_CANDIDATES = ["Estado","ESTADO","Id Estado","ID ESTADO","IdEstado","IDESTADO","Id_Estado","id estado","Estado Item","ESTADO ITEM"];

let data = [];
let headers = [];
let COL_CLIENT = null;
let COL_MATERIAL = null;
let COL_LIBRE = null;
let COL_ESTADO = null;

const clean = (v) => (v ?? "").toString().trim();

function normalizeHeaderName(s){
  if (s == null) return "";
  return String(s).replace(/^\uFEFF/, "").trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function byFirstExisting(candidates) {
  const norm = headers.map(h => normalizeHeaderName(h));
  for (const c of candidates) {
    const idx = norm.indexOf(normalizeHeaderName(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function parseDelimited(text, delimiter=";"){
  const rows=[]; let row=[], cur="", inQuotes=false;
  text=text.replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(inQuotes && text[i+1]==='"'){cur+='"'; i++;}
      else inQuotes=!inQuotes;
    } else if(ch===delimiter && !inQuotes){
      row.push(cur); cur="";
    } else if(ch==="\n" && !inQuotes){
      row.push(cur); rows.push(row); row=[]; cur="";
    } else cur+=ch;
  }
  if(cur||row.length){row.push(cur); rows.push(row);}
  return rows;
}

function downloadStaticFile(filename){
  const a=document.createElement("a");
  a.href=filename;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadByEstadoName(estadoName,label){
  const rows=data.filter(r=>clean(r[COL_ESTADO])===clean(estadoName));
  let csv=headers.join(";")+"\n";
  rows.forEach(r=>{ csv+=headers.map(h=>r[h]).join(";")+"\n"; });
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=label+".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildDonut(items){
  const legend=document.getElementById("donutLegend");
  legend.innerHTML="";
  items.forEach(it=>{
    const m=String(it.estado||"").match(/^(\d{2})-/);
    const prefNum=m?Number(m[1]):null;

    const card=document.createElement("div");
    card.className="callout";
    card.innerHTML=`<div><b>${it.estado}</b><br>${it.qty} materiales</div>`;

    if(prefNum){
      const btn=document.createElement("button");
      btn.className="mm-legend-btn";
      btn.textContent="⬇ "+it.estado.replace(/^\d{2}-/,"");

      btn.addEventListener("click",(ev)=>{
        ev.preventDefault();
        ev.stopPropagation();

        // ✅ CAMBIO CLAVE
        if(prefNum===1){
          downloadStaticFile("STO NULO.csv");
          return;
        }

        downloadByEstadoName(it.estado,it.estado.replace(/^\d{2}-/,"").toUpperCase());
      });

      card.appendChild(btn);
    }
    legend.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded",()=>{
  fetch(csvUrl).then(r=>r.text()).then(t=>{
    const m=parseDelimited(t,DELIM);
    headers=m[0];
    COL_CLIENT=byFirstExisting(CLIENT_CANDIDATES);
    COL_MATERIAL=byFirstExisting(MATERIAL_CANDIDATES);
    COL_LIBRE=byFirstExisting(LIBRE_CANDIDATES);
    COL_ESTADO=byFirstExisting(ESTADO_CANDIDATES);

    data=m.slice(1).map(r=>{
      const o={}; headers.forEach((h,i)=>o[h]=r[i]); return o;
    });

    const map=new Map();
    data.forEach(r=>{
      const e=r[COL_ESTADO];
      if(!map.has(e)) map.set(e,new Set());
      map.get(e).add(r[COL_MATERIAL]);
    });

    const items=[...map.entries()].map(([estado,set])=>({estado,qty:set.size}));
    buildDonut(items);
  });
});
