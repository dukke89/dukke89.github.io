
// ===== FIX HOVER + TOOLTIP =====

function format1Dec(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return '0,0';
  return n.toFixed(1).replace('.', ',');
}

// Dentro de tu inicialización del chart
// Asegurate de usar este tooltip y emphasis

const tooltipFix = {
  trigger: 'axis',
  axisPointer: { type: 'shadow' },
  formatter: (params) => {
    const title = params?.[0]?.axisValueLabel ?? '';
    const lines = params.map(p => {
      return `${p.marker} ${p.seriesName}: <b>${format1Dec(p.value)}</b>`;
    });
    return [title, ...lines].join('<br/>');
  }
};

// Ejemplo de serie con emphasis deshabilitado
const barSeriesFix = {
  type: 'bar',
  stack: 'total',
  emphasis: { disabled: true }
};

const lineSeriesFix = {
  type: 'line',
  yAxisIndex: 1,
  emphasis: { disabled: true }
};
