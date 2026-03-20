function dibujarGraficoEstados() {
  const chart = echarts.init(document.getElementById("chartEstados"));

  const data = [
    { name: "03-MAYOR A PUNTO DE PEDIDO", value: 1793, itemStyle: { color: "#4e79a7" } },
    { name: "04-MAYOR A STOCK MAXIMO", value: 863, itemStyle: { color: "#f28e2b" } },
    { name: "02-MENOR A PUNTO DE PEDIDO", value: 429, itemStyle: { color: "#e15759" } },
    { name: "01-STOCK NULO", value: 256, itemStyle: { color: "#d32f2f" } } // ROJO
  ];

  const option = {
    tooltip: {
      trigger: "item",
      formatter: "{b}<br/>{c} materiales ({d}%)"
    },
    legend: {
      orient: "vertical",
      right: 20,
      top: "middle"
    },
    series: [{
      type: "pie",
      radius: ["0%", "70%"],
      center: ["35%", "50%"],
      label: {
        show: true,
        position: "inside",
        formatter: "{d}%",
        fontSize: 20,
        fontWeight: "bold",
        color: "#fff"
      },
      labelLine: { show: false },
      data
    }]
  };

  chart.setOption(option);
  window.addEventListener("resize", () => chart.resize());
}

document.addEventListener("DOMContentLoaded", dibujarGraficoEstados);
