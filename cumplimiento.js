
// === NOMBRES DE MESES ===
const MONTH_NAMES = {
  "01": "ENERO",
  "02": "FEBRERO",
  "03": "MARZO",
  "04": "ABRIL",
  "05": "MAYO",
  "06": "JUNIO",
  "07": "JULIO",
  "08": "AGOSTO",
  "09": "SEPTIEMBRE",
  "10": "OCTUBRE",
  "11": "NOVIEMBRE",
  "12": "DICIEMBRE"
};

function updateMesTitleFromSelect(){
  const el = document.getElementById("panelMesTitle");
  const sel = document.getElementById("mesSelect");
  if (!el || !sel) return;

  const values = [...sel.selectedOptions]
    .map(o => o.value)
    .filter(v => v && v !== "__ALL__");

  // Todos los meses
  if (!values.length){
    el.textContent = "CUMPLIMIENTO - TODOS LOS MESES";
    return;
  }

  // Selección múltiple
  if (values.length > 1){
    el.textContent = "CUMPLIMIENTO - MESES SELECCIONADOS";
    return;
  }

  // Un solo mes
  const [year, month] = values[0].split("-");
  const mesTxt = MONTH_NAMES[month] || month;

  el.textContent = `CUMPLIMIENTO - MES DE ${mesTxt} ${year}`;
}

// Llamar a esta función cada vez que cambia el filtro de mes
// Ejemplo:
// document.getElementById("mesSelect")?.addEventListener("change", updateMesTitleFromSelect);
