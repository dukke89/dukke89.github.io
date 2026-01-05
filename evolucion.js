
/*
 SAFE FIX – NO ROMPE EVOLUCIÓN
 - NO reemplaza la lógica existente
 - Solo ajusta tooltip y emphasis
*/

function format1Dec(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return '0,0';
  return n.toFixed(1).replace('.', ',');
}

// === USAR DENTRO DEL option EXISTENTE ===
// option.tooltip = tooltipFix
// y agregar emphasis a las series

const tooltipFix = {
  trigger: 'axis',
  axisPointer: { type: 'shadow' },
  formatter: function (params) {
    if (!params || !params.length) return '';
    const title = params[0].axisValueLabel || '';
    const lines = params.map(p => {
      return `${p.marker} ${p.seriesName}: <b>${format1Dec(p.value)}</b>`;
    });
    return [title, ...lines].join('<br/>');
  }
};

// Helper para aplicar emphasis sin apagar columnas
function applyNoEmphasis(series){
  return series.map(s => ({
    ...s,
    emphasis: { disabled: true }
  }));
}

/*
 EJEMPLO DE USO (NO reemplazar tu código):
 option.tooltip = tooltipFix;
 option.series = applyNoEmphasis(option.series);
 chartEvolucion.setOption(option, true);
*/
