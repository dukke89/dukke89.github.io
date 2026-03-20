/* ============================
   OTROS TAB LOGIC
============================ */

const destinatarioSelect = document.getElementById("destinatarioSelect");
const pivotContainer = document.getElementById("pivotContainer");
const loader = document.getElementById("loader");

let rawData = [];
let headers = [];
let colIdx = {};

let currentEstado = "EMBALADO";

document.getElementById("btnEmbalado")?.addEventListener("click", () => {
  currentEstado = "EMBALADO";
  document.getElementById("btnEmbalado").style.background = "#bce6f4";
  document.getElementById("btnEmbalado").style.fontWeight = "bold";
  document.getElementById("btnDespachado").style.background = "";
  document.getElementById("btnDespachado").style.fontWeight = "normal";
  renderTable();
});

document.getElementById("btnDespachado")?.addEventListener("click", () => {
  currentEstado = "DESPACHADO";
  document.getElementById("btnDespachado").style.background = "#bce6f4";
  document.getElementById("btnDespachado").style.fontWeight = "bold";
  document.getElementById("btnEmbalado").style.background = "";
  document.getElementById("btnEmbalado").style.fontWeight = "normal";
  renderTable();
});

function parseDelimited(text, delimiter = ";") {
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

function clean(v) { return (v || "").toString().trim(); }

function parseFloatSafe(str) {
  if (!str) return 0;
  let s = clean(str);
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

async function loadData() {
  if (loader) loader.style.display = "flex";
  try {
    const res = await fetch("VL06O.csv");
    const text = await res.text();
    const rows = parseDelimited(text, ";");
    
    if (rows.length < 2) return;
    
    headers = rows[0].map(h => clean(h));
    headers.forEach((h, i) => colIdx[h] = i);
    
    rawData = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < headers.length - 5) continue;
      
      const fechaCreacion = clean(r[colIdx["Fecha de creación"]]);
      const fePreferEntrega = clean(r[colIdx["Fe.prefer.entrega"]]);
      const catPosicion = clean(r[colIdx["Categoría posición"]]);
      
      const isYearValid = fePreferEntrega.includes("2025") || fePreferEntrega.includes("2026");
      
      if (fechaCreacion !== "" && isYearValid && catPosicion !== "ZDEQ") {
        const feMovReal = clean(r[colIdx["Fe.mov.mcía.real"]]);
        const grupo = clean(r[colIdx["Grupo"]]);
        const desc = clean(r[colIdx["Descripción"]]);
        const conca = grupo + (grupo && desc ? ", " : "") + desc;
        
        rawData.push({
          conca: conca || "(en blanco)",
          destinatario: clean(r[colIdx["Nombre destinatario de mercancías"]]),
          modificado: clean(r[colIdx["Modificado el"]]),
          material: clean(r[colIdx["Material"]]),
          posicion: clean(r[colIdx["Descripción de posición"]]),
          creador: clean(r[colIdx["Creado por"]]),
          cantidad: parseFloatSafe(r[colIdx["Cantidad entrega"]]),
          feMovReal: feMovReal
        });
      }
    }
    
    populateDestinatarios();
    renderTable();
  } catch (e) {
    console.error(e);
  } finally {
    if (loader) loader.style.display = "none";
  }
}

function populateDestinatarios() {
  const setDest = new Set();
  rawData.forEach(r => {
    if (r.destinatario) setDest.add(r.destinatario);
  });
  
  const arr = [...setDest].sort();
  destinatarioSelect.innerHTML = '<option value="">Todos</option>';
  arr.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    destinatarioSelect.appendChild(opt);
  });
  
  destinatarioSelect.addEventListener("change", renderTable);
}

function toggleGroup(grpClass) {
  const rows = document.querySelectorAll('.row-' + grpClass);
  const tg = document.getElementById('tg-' + grpClass);
  let isHidden = false;
  rows.forEach(r => {
    if (r.classList.contains('hide')) {
      r.classList.remove('hide');
      isHidden = true;
    } else {
      r.classList.add('hide');
    }
  });
  if (tg) {
    tg.textContent = isHidden ? '-' : '+';
  }
}

// Para usarla desde el HTML hay que colgarla al window
window.toggleGroup = toggleGroup;

function renderTable() {
  const selectedOptions = [...destinatarioSelect.selectedOptions];
  const isAll = selectedOptions.some(o => o.value === "");
  const selectedDest = isAll ? [] : selectedOptions.map(o => o.value);
  
  let filtered = rawData.filter(r => {
    if (currentEstado === "EMBALADO") {
      return r.feMovReal === "";
    } else {
      return r.feMovReal !== "";
    }
  });
  
  if (selectedDest.length > 0) {
    filtered = filtered.filter(r => selectedDest.includes(r.destinatario));
  }
  
  filtered.sort((a,b) => {
    if (a.conca !== b.conca) return a.conca.localeCompare(b.conca);
    if (a.modificado !== b.modificado) return a.modificado.localeCompare(b.modificado);
    if (a.material !== b.material) return a.material.localeCompare(b.material);
    return a.posicion.localeCompare(b.posicion);
  });
  
  const groups = {};
  filtered.forEach(m => {
    if (!groups[m.conca]) groups[m.conca] = { items: [], total: 0 };
    groups[m.conca].items.push(m);
    groups[m.conca].total += m.cantidad;
  });
  
  let grandTotal = 0;
  
  let html = `<table class="pivot-table">
    <thead>
      <tr>
        <th colspan="6" style="background:#bce6f4;font-size:1.1em;">Suma de Cantidad entrega</th>
      </tr>
      <tr>
        <th style="min-width:200px;">conca</th>
        <th>Modificado el</th>
        <th>Material</th>
        <th>Denominación de posición</th>
        <th>Creada por</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>`;
    
  let grpIndex = 0;
  // Obtenemos llaves ordenadas.
  const sortedKeys = Object.keys(groups).sort();
  
  for (const conca of sortedKeys) {
    const grp = groups[conca];
    grandTotal += grp.total;
    const gClass = `grp-${grpIndex}`;
    
    html += `<tr class="pt-group-row" onclick="toggleGroup('${gClass}')">
      <td><span class="pt-toggle" id="tg-${gClass}">+</span>${conca}</td>
      <td></td><td></td><td></td><td></td>
      <td class="num">${fmtInt(grp.total)}</td>
    </tr>`;
    
    let prevMod = null, prevMat = null;
    
    grp.items.forEach(itm => {
      const showMod = itm.modificado !== prevMod;
      const showMat = showMod || itm.material !== prevMat; 
      
      prevMod = itm.modificado;
      prevMat = itm.material;
      
      html += `<tr class="pt-detail-row row-${gClass} hide">
        <td></td>
        <td style="padding-left:15px;">${showMod ? (itm.modificado || "(en blanco)") : ""}</td>
        <td style="padding-left:15px;">${showMat ? itm.material : ""}</td>
        <td style="padding-left:15px;">${itm.posicion}</td>
        <td>${itm.creador}</td>
        <td class="num">${fmtInt(itm.cantidad)}</td>
      </tr>`;
    });
    
    html += `<tr class="pt-group-total row-${gClass} hide">
      <td colspan="5">Total ${conca}</td>
      <td class="num">${fmtInt(grp.total)}</td>
    </tr>`;
    
    grpIndex++;
  }
  
  html += `<tr class="pt-grand-total">
    <td colspan="5">Total general</td>
    <td class="num">${fmtInt(grandTotal)}</td>
  </tr>
  </tbody></table>`;
  
  pivotContainer.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", loadData);
