
var chart = echarts.init(document.getElementById('chartMes'));

var option = {
  grid: {
    left: '3%',
    right: '3%',
    top: 80,
    bottom: 140,
    containLabel: true
  },
  tooltip: { trigger: 'axis' },
  legend: { top: 20 },
  xAxis: {
    type: 'category',
    data: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago'],
    axisLabel: { rotate: 90 }
  },
  yAxis: { type: 'value' },
  dataZoom: [
    {
      type: 'slider',
      start: 50,
      end: 100,
      height: 30,
      bottom: 60
    }
  ],
  series: [
    {
      name: 'Demoras',
      type: 'bar',
      data: [320,450,380,500,420,390,460,410],
      label: {
        show: true,
        rotate: 90,
        position: 'insideBottom',
        formatter: '{c}'
      }
    }
  ]
};

chart.setOption(option);
window.addEventListener('resize', () => chart.resize());
