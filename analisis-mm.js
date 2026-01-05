/* ============================
   ANALISIS MM
============================ */

const CSV_URL = "ANALISIS-MM.csv";
const DELIM = ";";

let rows = [];
let COL_CLIENTE = null;
let COL_RUBRO = null;
let COL_VALOR = null;

/* ============================
   HELPERS
============================ */
const clean = v => (v ?? "").toString().trim();

function normalize(s){
  return clean(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNumber(v){
  const n = Number(clean(v).replace(/\./g,"").replace(",",".").replace("$",""));
  return isFinite(n) ? n : 0;
}

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(DELIM).map(h => h.trim());
  const data = [];

  for(let i=1;i<lines.length;i++){
    const parts = lines[i].split(DELIM);
    const row = {};
    headers.forEach((h,idx)=> row[h]=parts[idx] ?? "");
    data.push(row);
  }

  return { headers, data };
}

function pickCol(headers, ...candidates){
  for(const c of candidates){
    const idx = headers.findIndex(h => normalize(h) === normalize(c));
    if(idx >= 0) return headers[idx];
  }
  return null;
}

/* ============================
   MULTISELECT (IGUAL CUMPLIMIENTO)
============================ */
function fillClienteSelect(){
  const sel = document.getElementById("clienteSelect");
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = "Todos";
  optAll.selected = true;
  sel.appendChild(optAll);

  const values = [...new Set(rows.map(r => clean(r[COL_CLIENTE])).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"));

  values.forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

function getSelectedClientes(){
  const sel = document.getElementById("clienteSelect");
  const vals = [...sel.selectedOptions].map(o=>o.value);
  if(!vals.length || vals.includes("__ALL__")) return [];
  return vals;
}

function filteredRows(){
  const selected = getSelectedClientes();
  if(!selected.length) return rows;
  const set = new Set(selected);
  return rows.filter(r => set.has(clean(r[COL_CLIENTE])));
}

/* ============================
   RUBRO ALERTA
============================ */
function isRubroAlert(v){
  const s = clean(v);
  if(!s) return true;
  const u = normalize(s).toUpperCase();
  return u === "?" || u === "OBSOLETO" || u === "OTROS";
}

/* ============================
   TABLA VALORIZACION
============================ */
function buildValorizacion(data){
  const tbody = document.querySelector("#tablaValorizacion tbody");
  tbody.innerHTML = "";

  const map = new Map();
  data.forEach(r=>{
    const rub = clean(r[COL_RUBRO]);
    const val = toNumber(r[COL_VALOR]);
    map.set(rub, (map.get(rub) || 0) + val);
  });

  const items = [...map.entries()]
    .map(([rubro,valor])=>({rubro,valor}))
    .sort((a,b)=>b.valor-a.valor);

  const total = items.reduce((a,x)=>a+x.valor,0);

  let acc = 0;
  items.forEach(it=>{
    const pct = total ? it.valor/total*100 : 0;
    acc += pct;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="${isRubroAlert(it.rubro) ? "rubro-alert":""}">
        ${it.rubro || "(Vacío)"}
      </td>
      <td class="num">$ ${it.valor.toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      <td class="num">${pct.toFixed(2).replace(".",",")}%</td>
      <td class="num">${acc.toFixed(2).replace(".",",")}%</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("valTotal").textContent =
    `$ ${total.toLocaleString("es-AR",{minimumFractionDigits:2})}`;
}

/* ============================
   APPLY
============================ */
function applyAll(){
  const data = filteredRows();

  // KPIs y gráficos EXISTENTES (no se tocan)
  buildValorizacion(data);
}

/* ============================
   INIT
============================ */
(async function(){
  const res = await fetch(CSV_URL,{cache:"no-store"});
  const txt = await res.text();
  const { headers, data } = parseCSV(txt);

  rows = data;
  COL_CLIENTE = pickCol(headers,"ALMACEN","ALMACÉN","CLIENTE (ALMACEN)");
  COL_RUBRO   = pickCol(headers,"RUBRO");
  COL_VALOR   = pickCol(headers,"VALOR LIBRE UTILIZACION","VALOR LIBRE UTILIZACIÓN");

  fillClienteSelect();
  document.getElementById("clienteSelect").addEventListener("change", applyAll);

  applyAll();
})();
