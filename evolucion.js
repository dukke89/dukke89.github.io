const EVOL_URL = "EVOLUCION.csv";
const EVOL_DELIM = ";";

let evolData = [];
let evolHeaders = [];

function cleanText(s) {
  return (s ?? "").toString().replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
}

function enforceAllOption(sel) {
  if (!sel) return;
  const allOpt = [...sel.options].find(o => o.value === "__ALL__");
  if (!allOpt) return;

  const selected = [...sel.selectedOptions].map(o => o.value);
  if (selected.includes("__ALL__") && selected.length > 1) {
    [...sel.options].forEach(o => { o.selected = (o.value === "__ALL__"); });
    return;
  }
  if (!selected.length) {
    allOpt.selected = true;
  } else if (!selected.includes("__ALL__")) {
    allOpt.selected = false;
  }
}

function getSelValues(id) {
  const sel = document.getElementById(id);
  if (!sel) return [];
  enforceAllOption(sel);
  const vals = [...sel.selectedOptions].map(o => o.value);
  if (!vals.length) return [];
  if (vals.includes("__ALL__")) return [];
  return vals.filter(v => v !== "");
}

function norm(s) {
  return cleanText(s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ");
}
function parseSimpleCSV(text, delim = ";") {
  text = (text ?? "").toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];
  return text.split(/\n+/).map(line => line.split(delim).map(cleanText));
}
function parseDateToMonth(s) {
  s = cleanText(s);
  if (!s) return "";
  const p = s.split("/");
  if (p.length >= 3 && p[2]) return `${p[2]}-${(p[1] || "").padStart(2, '0')}`;
  return s;
}

function initEvolucion() {
  fetch(EVOL_URL)
    .then(r => {
      if (!r.ok) throw new Error(`No pude abrir ${EVOL_URL} (HTTP ${r.status})`);
      return r.text();
    })
    .then(t => {
      const m = parseSimpleCSV(t, EVOL_DELIM);
      if (!m.length || m.length < 2) return;

      evolHeaders = m[0].map(cleanText);

      evolData = m.slice(1).map(r => {
        const o = {};
        evolHeaders.forEach((h, i) => o[h] = cleanText(r[i]));
        return o;
      });

      const colFecha = evolHeaders.find(h => norm(h).includes("fecha"));
      const colObra = evolHeaders.find(h => norm(h).includes("obra"));
      const colPct = evolHeaders.find(h => norm(h).includes("dispon"));

      // ✅ Excluir "Cantidad items MM"
      let stackCols = evolHeaders.filter(h =>
        h !== colFecha &&
        h !== colObra &&
        h !== colPct &&
        norm(h) !== norm("Cantidad items MM")
      );

      // ✅ Orden de apilado (de abajo hacia arriba):
      //    1) Cantidad mayor a Stock Maximo
      //    2) Cantidad Mayor a PP
      //    3) Cantidad Menor a PP
      //    4) Cantidad Stock Nulo
      const preferredOrder = [
        "Cantidad mayor a Stock Maximo",
        "Cantidad Mayor a PP",
        "Cantidad Menor a PP",
        "Cantidad Stock Nulo"
      ];
      const ordered = [];
      preferredOrder.forEach(name => {
        const found = stackCols.find(h => norm(h) === norm(name));
        if (found) ordered.push(found);
      });
      const rest = stackCols.filter(h => !ordered.includes(h));
      stackCols = [...ordered, ...rest];

      const obraSel = document.getElementById("obraSelect");
      const obras = [...new Set(evolData.map(d => d[colObra]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "es"));

      // reset options (por si se re-init)
      if (obraSel) {
        // asegurar opción "Todos"
        if (!obraSel.querySelector("option[value='__ALL__']")) {
          const optAll = document.createElement("option");
          optAll.value = "__ALL__";
          optAll.textContent = "Todos";
          obraSel.appendChild(optAll);
        }
        obraSel.querySelectorAll("option:not([value='__ALL__'])").forEach(o => o.remove());
        obras.forEach(o => {
          const opt = document.createElement("option");
          opt.value = o;
          opt.textContent = o;
          obraSel.appendChild(opt);
        });
      }

      function toNum(v) {
        const x = cleanText(v).replace("%", "").replace(/\./g, "").replace(",", ".");
        const n = Number(x);
        return Number.isFinite(n) ? n : 0;
      }

      function render() {
        const obrasSel = getSelValues("obraSelect");
        const rows = obrasSel.length ? evolData.filter(d => obrasSel.includes(d[colObra])) : evolData;

        // map mes -> {count, sums, pctSum}
        const map = {};
        rows.forEach(d => {
          const mm = parseDateToMonth(d[colFecha]);
          if (!mm) return;

          if (!map[mm]) {
            map[mm] = { count: 0, sums: {}, pctSum: 0 };
            stackCols.forEach(c => map[mm].sums[c] = 0);
          }

          map[mm].count += 1;
          stackCols.forEach(c => map[mm].sums[c] += toNum(d[c]));
          map[mm].pctSum += toNum(d[colPct]);
        });

        const months = Object.keys(map).sort();

        // 📌 PROMEDIO por mes: sum / count
        const avgVal = (m, c) => {
          const cnt = map[m]?.count || 0;
          if (!cnt) return 0;
          return map[m].sums[c] / cnt;
        };
        const avgPct = (m) => {
          const cnt = map[m]?.count || 0;
          if (!cnt) return 0;
          return map[m].pctSum / cnt;
        };

        const seriesBars = stackCols.map(c => {
          const n = norm(c);
          const COLORS = {
            [norm("Cantidad Menor a PP")]: "#1d4ed8",              // azul (igual Análisis MM)
            [norm("Cantidad Mayor a PP")]: "#16a34a",              // verde (igual Análisis MM)
            [norm("Cantidad mayor a Stock Maximo")]: "#f59e0b",    // naranja (igual Análisis MM)
            [norm("Cantidad Stock Nulo")]: "#d32f2f"              // rojo
          };
          const color = COLORS[n];

          // Agregar "promedio" al nombre para la leyenda
          let displayName = c;
          if (n === norm("Cantidad Mayor a PP")) {
            displayName = "Cantidad promedio Mayor a PP";
          } else if (n === norm("Cantidad Menor a PP")) {
            displayName = "Cantidad promedio Menor a PP";
          } else if (n === norm("Cantidad mayor a Stock Maximo")) {
            displayName = "Cantidad promedio mayor a Stock Maximo";
          } else if (n === norm("Cantidad Stock Nulo")) {
            displayName = "Cantidad promedio Stock Nulo";
          }

          const isStockNulo = n === norm("Cantidad Stock Nulo");
          return {
            name: displayName,
            type: "bar",
            stack: "total",
            barMaxWidth: 44,
            itemStyle: { color: color },
            // ✅ Etiquetas: Stock Nulo arriba, el resto adentro
            label: {
              show: true,
              position: isStockNulo ? "top" : "inside",
              fontSize: 11,
              formatter: (p) => (p.value && p.value !== 0) ? `${Math.round(p.value)}` : ""
            },
            emphasis: { disabled: true },
            data: months.map(m => avgVal(m, c))
          };
        });

        const seriesLine = {
          name: "% Promedio de disponibilidad",
          emphasis: { disabled: true },
          type: "line",
          yAxisIndex: 1,
          lineStyle: { width: 3, color: "#065f46" },
          itemStyle: { color: "#065f46" },
          smooth: true,
          symbolSize: 8,
          label: {
            show: true,
            position: "top",
            formatter: (p) => `${Math.round(p.value)}%`
          },
          data: months.map(m => avgPct(m))
        };

        const el = document.getElementById("chartEvolucion");
        const chart = echarts.init(el);

        chart.setOption({
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (params) => {
              if (!params || !params.length) return "";
              const title = params[0].axisValueLabel ?? "";
              const fmt1 = (v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return "0,0";
                return n.toFixed(1).replace(".", ",");
              };
              const lines = params.map(p => {
                const isPct = (p.seriesName || "") === "% disponibilidad";
                const val = fmt1(p.value);
                return `${p.marker} ${p.seriesName}: <b>${val}${isPct ? "%" : ""}</b>`;
              });
              return [title, ...lines].join("<br/>");
            }
          },
          legend: { type: "scroll", top: 0 },
          grid: { left: 55, right: 55, top: 55, bottom: 40 },
          xAxis: { type: "category", data: months },
          yAxis: [
            { type: "value", name: "Promedio" },
            { type: "value", name: "% disponibilidad", axisLabel: { formatter: "{value}%" } }
          ],
          series: [...seriesBars, seriesLine]
        });

        window.addEventListener("resize", () => chart.resize());
      }

      if (obraSel) obraSel.addEventListener("change", (e) => { enforceAllOption(e.target); render(); });
      render();
    })
    .catch(err => console.error(err));
}

document.addEventListener("DOMContentLoaded", initEvolucion);
