(function() {
  /* ============================
     CONFIG
  ============================ */
  const csvUrl = "./ANALISIS-MM.csv";
  const DELIM = ";";

  const ESTADO_DOWNLOAD_FILES = {
    1: "STO NULO.csv",
    2: "MENOR A PP.csv",
    3: "MAYOR AL PP.csv",
    4: "MAYOR STOCK MAX.csv"
  };

  const CLIENT_CANDIDATES = ["ALMACEN", "Almacén", "Almacen", "ALMACÉN", "Cliente", "CLIENTE", "CLIENTE (ALMACEN)"];
  const MATERIAL_CANDIDATES = ["Material", "MATERIAL", "Código Item", "CODIGO ITEM", "Codigo Item", "CODIGOITEM"];
  const LIBRE_CANDIDATES = ["Libre utilización", "Libre utilizacion", "LIBRE UTILIZACION", "Libre Utilizacion", "Libre utilización ", "Libre utilizacion "];
  const ESTADO_CANDIDATES = ["Estado", "ESTADO", "Id Estado", "ID ESTADO", "IdEstado", "IDESTADO", "Id_Estado", "id estado", "Estado Item", "ESTADO ITEM"];

  const RUBRO_CANDIDATES = ["Rubro", "RUBRO", "Rubro "];
  const VALOR_CANDIDATES = [
    "Valor libre utilización",
    "Valor libre utilizacion",
    "VALOR LIBRE UTILIZACION",
    "Valor Libre Utilización",
    "Valor Libre utilizacion",
    "Valor libre utilización ",
    "Valor libre utilizacion "
  ];

  /* ============================
     GLOBAL (Isolated inside IIFE)
  ============================ */
  let data = [];
  let headers = [];

  let COL_CLIENT = null;
  let COL_MATERIAL = null;
  let COL_LIBRE = null;
  let COL_ESTADO = null;

  let chartDonut = null;

  /* ============================
     HELPERS
  ============================ */
  function normalizeHeaderName(s) {
    if (s == null) return "";
    return String(s)
      .replace(/^\uFEFF/, "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  const clean = (v) => (v ?? "").toString().trim();

  function byFirstExisting(candidates) {
    const norm = headers.map(h => normalizeHeaderName(h));
    for (const c of candidates) {
      const idx = norm.indexOf(normalizeHeaderName(c));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function showError(msg) {
    const el = document.getElementById("mm_msg");
    if (el) el.innerHTML = `<div class="error">${msg}</div>`;
  }

  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function toNumber(v) {
    let x = clean(v);
    if (!x) return 0;
    x = x.replace(/\s/g, "");
    if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtInt(n) {
    return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtMoney(n) {
    const x = Number(n || 0);
    return x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseMoney(v) {
    if (v == null) return 0;
    const s = String(v).trim().replace(/[^0-9,.-]+/g, "");
    if (!s) return 0;
    if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
      return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return Number(s.replace(/,/g, "")) || 0;
  }

  function fmtPct(x) {
    if (!isFinite(x)) return "-";
    return (x * 100).toFixed(2).replace(".", ",") + "%";
  }

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

  /* ============================
     FILTERS (Using mm_ unique prefix)
  ============================ */
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

  function getSelectedClientes() {
    const sel = document.getElementById("mm_clienteSelect");
    if (!sel) return [];
    enforceAllOption(sel);
    const vals = [...sel.selectedOptions].map(o => o.value);
    if (!vals.length) return [];
    if (vals.includes("__ALL__")) return [];
    return vals.filter(v => v && v !== "__ALL__");
  }

  function filteredRows() {
    const selected = getSelectedClientes();
    if (!selected || !selected.length) return data;
    const set = new Set(selected);
    return data.filter(r => set.has(clean(r[COL_CLIENT])));
  }

  /* ============================
     UI: CLIENTES
  ============================ */
  function renderClientes() {
    const sel = document.getElementById("mm_clienteSelect");
    if (!sel) return;

    const prev = new Set([...sel.selectedOptions].map(o => o.value));

    sel.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "__ALL__";
    optAll.textContent = "Todos";
    sel.appendChild(optAll);

    const clientes = [...new Set(data.map(r => clean(r[COL_CLIENT])).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"));

    for (const c of clientes) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      if (prev.has(c)) o.selected = true;
      sel.appendChild(o);
    }

    const hasPrevValid = [...prev].some(v => v && v !== "__ALL__");
    if (!hasPrevValid) {
      optAll.selected = true;
    } else {
      enforceAllOption(sel);
    }
  }

  /* ============================
     CALCS
  ============================ */
  function calcKPIs(rows) {
    let totalPosiciones = 0;
    let disponibles = 0;

    for (const r of rows) {
      const mat = clean(r[COL_MATERIAL]);
      if (!mat) continue;
      
      totalPosiciones++; 

      const libre = toNumber(r[COL_LIBRE]);
      if (libre > 0) disponibles++;
    }

    const pct = totalPosiciones ? disponibles / totalPosiciones : NaN;

    return { 
      totalMat: totalPosiciones, 
      dispMat: disponibles, 
      pct 
    };
  }

  function calcEstados(rows) {
    const map = new Map();

    for (const r of rows) {
      const estado = clean(r[COL_ESTADO]) || "(Sin estado)";
      const mat = clean(r[COL_MATERIAL]);
      if (!mat) continue;

      map.set(estado, (map.get(estado) || 0) + 1);
    }

    const items = [...map.entries()].map(([estado, qty]) => ({
      estado,
      qty: qty
    }));

    items.sort((a, b) => b.qty - a.qty);
    const total = items.reduce((s, x) => s + x.qty, 0);

    return { items, total };
  }

  /* ============================
     RENDER: DONA X ESTADO
  ============================ */
  function buildDonut(items, total) {
    if (!window.echarts) {
      console.warn('ECharts no cargó.');
      return;
    }

    const host = document.getElementById("mm_donutEstados");
    const legend = document.getElementById("mm_donutLegend");
    if (!host || !legend) return;

    legend.innerHTML = "";

    if (chartDonut) {
      try { chartDonut.dispose(); } catch (e) { }
      chartDonut = null;
    }

    const getPrefixNum = (name) => {
      const m = String(name || "").trim().match(/^\s*(\d{1,2})\s*[-.:_\s]/);
      return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
    };
    const orderedItems = [...items].sort((a, b) => {
      const pa = getPrefixNum(a.estado);
      const pb = getPrefixNum(b.estado);
      if (pa !== pb) return pa - pb;
      return (b.qty || 0) - (a.qty || 0);
    });

    const palette = [
      "#1d4ed8", "#16a34a", "#f59e0b", "#7c3aed", "#0ea5e9",
      "#10b981", "#a3a3a3", "#eab308", "#14b8a6", "#fb7185"
    ];
    const norm = (s) => normalizeHeaderName(s);
    const normLoose = (s) => norm(s)
      .replace(/^[0-9]+\s*[-.:_\s]*/g, "")
      .replace(/[_\-\s]+/g, " ")
      .trim();

    const isStockNulo = (name) => {
      const n = normLoose(name);
      const t = normLoose("Stock nulo");
      return n === t;
    };
    const colorByName = {};
    let palIdx = 0;
    orderedItems.forEach(it => {
      if (isStockNulo(it.estado)) colorByName[it.estado] = "#ef4444";
      else {
        colorByName[it.estado] = palette[palIdx % palette.length];
        palIdx++;
      }
    });

    const seriesData = orderedItems.map(it => {
      const isSN = isStockNulo(it.estado);
      return ({
        name: it.estado,
        value: it.qty,
        itemStyle: { color: colorByName[it.estado] },
        ...(isSN ? {
          label: { color: "#ef4444", fontWeight: 950 },
          labelLine: { lineStyle: { color: "#ef4444", width: 2 } }
        } : {})
      });
    });
    chartDonut = echarts.init(host, null, { renderer: "canvas" });

    chartDonut.setOption({
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const v = p.value || 0;
          const pct = total ? ((v / total) * 100) : 0;
          return `${p.name}<br/>${fmtInt(v)} materiales (${pct.toFixed(2).replace(".", ",")}%)`;
        }
      },
      series: [{
        type: "pie",
        radius: ["45%", "78%"],
        center: ["50%", "48%"],
        minAngle: 2,
        padAngle: 2,
        itemStyle: { borderColor: "rgba(255,255,255,.95)", borderWidth: 2 },
        label: {
          show: true,
          formatter: (p) => {
            const v = p.value || 0;
            if (!total) return "";
            const pct = (v / total) * 100;
            return `${p.name}\n${pct.toFixed(0)}%`;
          },
          fontWeight: 950,
          fontSize: 12,
          color: "#0b1220"
        },
        labelLine: { show: true, length: 14, length2: 10 },
        emphasis: {
          scale: true,
          scaleSize: 8,
          itemStyle: { shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 2, shadowColor: "rgba(0,0,0,.25)" }
        },
        data: seriesData
      }]
    });

    orderedItems.forEach((it) => {
      const p = total ? it.qty / total : 0;
      const pct = (p * 100).toFixed(0) + "%";
      const c = colorByName[it.estado] || "#2d6cdf";

      const card = document.createElement("div");
      card.className = "callout";
      if (typeof isStockNulo === "function" && isStockNulo(it.estado)) card.classList.add("is-stock-nulo");

      const dot = document.createElement("span");
      dot.className = "callout-dot";
      dot.style.background = c;

      const body = document.createElement("div");

      const title = document.createElement("div");
      title.className = "callout-title";
      title.textContent = it.estado;

      const big = document.createElement("div");
      big.className = "callout-pct";
      big.style.color = c;
      big.textContent = pct;

      const sub = document.createElement("div");
      sub.className = "callout-sub";
      sub.textContent = `${fmtInt(it.qty)} materiales`;

      body.appendChild(title);
      body.appendChild(big);
      body.appendChild(sub);

      card.appendChild(dot);
      card.appendChild(body);

      const mPref = String(it.estado || "").trim().match(/^\s*(\d{1,2})\s*[-.:_\s]/);
      const prefNum = mPref ? Number(mPref[1]) : null;
      const labelByPref = (n) => {
        if (n === 1) return "Stock nulo";
        if (n === 2) return "Menor al PP";
        if (n === 3) return "Mayor al PP";
        if (n === 4) return "Mayor Stock Max";
        return null;
      };
      const btnLabel = labelByPref(prefNum);
      const fileName = (prefNum && ESTADO_DOWNLOAD_FILES) ? ESTADO_DOWNLOAD_FILES[prefNum] : null;

      if (btnLabel && fileName) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `⬇ ${btnLabel}`;

        btn.style.marginLeft = "auto";
        btn.style.height = "28px";
        btn.style.padding = "0 6px";
        btn.style.borderRadius = "8px";
        btn.style.border = "2px solid rgba(2,8,20,.35)";
        btn.style.background = "#fff";
        btn.style.fontWeight = "900";
        btn.style.fontSize = "11px";
        btn.style.cursor = "pointer";
        btn.style.whiteSpace = "nowrap";
        btn.style.minWidth = "125px";
        btn.style.textAlign = "center";
        btn.style.justifyContent = "center";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";

        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (prefNum === 1 || prefNum === 2) {
            downloadStaticFile(fileName);
          } else {
            downloadByEstadoValue(it.estado, fileName);
          }
        });

        card.appendChild(btn);
      }

      legend.appendChild(card);
    });

    const onResize = () => { try { chartDonut && chartDonut.resize(); } catch (e) { } };
    window.addEventListener("resize", onResize, { passive: true });
  }

  /* ============================
     APPLY ALL
  ============================ */
  function applyAll() {
    const rows = filteredRows();

    const k = calcKPIs(rows);
    safeSetText("mm_kpiMat", fmtInt(k.totalMat));
    safeSetText("mm_kpiDisp", fmtInt(k.dispMat));
    safeSetText("mm_kpiPct", fmtPct(k.pct));

    const e = calcEstados(rows);
    buildDonut(e.items, e.total);
    buildValorizacionStock(rows);
  }

  function downloadExternalFilteredCSV(filename) {
    const selectedClientes = getSelectedClientes();
    if (selectedClientes.length === 0) {
      downloadStaticFile(filename);
      return;
    }
    
    fetchWithCache(filename + "?t=" + window.CACHE_BUSTER)
      .then(text => {
        const m = parseDelimited(text, DELIM);
        if (m.length < 2) {
          showError("El archivo " + filename + " está vacío.");
          return;
        }
        
        const fileHeaders = m[0].map(clean);
        
        let colIdx = fileHeaders.findIndex(h => {
          const normH = normalizeHeaderName(h);
          return normH.includes("almac") && !normH.includes("cliente");
        });
        
        if (colIdx === -1) {
          colIdx = fileHeaders.indexOf(COL_CLIENT);
        }
        
        if (colIdx === -1) {
          const normCandidates = CLIENT_CANDIDATES.map(normalizeHeaderName);
          colIdx = fileHeaders.findIndex(h => normCandidates.includes(normalizeHeaderName(h)));
        }
        
        if (colIdx === -1) {
          downloadStaticFile(filename);
          return;
        }
        
        const filteredRowsText = m.filter((row, idx) => {
          if (idx === 0) return true;
          const val = clean(row[colIdx]);
          
          return selectedClientes.some(sc => {
            if (sc === val) return true;
            if (!isNaN(sc) && !isNaN(val) && val !== "") {
              return Number(sc) === Number(val);
            }
            return false;
          });
        }).map(row => row.join(DELIM)).join("\n");
        
        const content = "\uFEFF" + filteredRowsText;
        const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        const label = selectedClientes.length > 2 ? "FILTRADO" : selectedClientes.join("_");
        a.download = filename.replace(".csv", "") + "_" + label + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      })
      .catch(err => {
        console.error(err);
        showError("Hubo un problema descargando y filtrando " + filename);
      });
  }

  function downloadByKind(kind) {
    if (kind === "stock_nulo") downloadExternalFilteredCSV("STO NULO.csv");
    if (kind === "menor_pp") downloadExternalFilteredCSV("MENOR A PP.csv");
    if (kind === "mayor_stock_max") downloadByEstadoValue("Mayor a Stock Maximo", "MAYOR STOCK MAX.csv");
  }

  function buildValorizacionStock(rows) {
    const table = document.getElementById("mm_tablaValorizacion");
    if (!table) return;

    const colRubro = byFirstExisting(RUBRO_CANDIDATES);
    const colValor = byFirstExisting(VALOR_CANDIDATES);

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    if (!colRubro || !colValor) {
      tbody.innerHTML = "";
      const valTotal = document.getElementById("mm_valTotal");
      if (valTotal) valTotal.textContent = "";
      showError(
        `No pude armar la tabla <b>Valorización de stock</b> porque no encontré columnas en ${csvUrl}.`
      );
      return;
    }

    const agg = new Map();
    rows.forEach(r => {
      const rub = (r[colRubro] || "").trim();
      if (!rub) return;
      const val = parseMoney(r[colValor]);
      agg.set(rub, (agg.get(rub) || 0) + (isFinite(val) ? val : 0));
    });

    const dataArr = Array.from(agg.entries())
      .map(([rubro, valor]) => ({ rubro, valor }))
      .sort((a, b) => b.valor - a.valor);

    const total = dataArr.reduce((s, d) => s + d.valor, 0);
    let acc = 0;

    tbody.innerHTML = "";

    dataArr.forEach(d => {
      acc += d.valor;
      const pct = total ? (d.valor / total * 100) : 0;
      const pctAcc = total ? (acc / total * 100) : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.rubro}</td>
        <td class="num">$ ${fmtMoney(d.valor)}</td>
        <td class="num">${pct.toFixed(2).replace(".", ",")}%</td>
        <td class="num">${pctAcc.toFixed(2).replace(".", ",")}%</td>
      `;

      const rubKey = (d.rubro ?? "").toString().trim().toUpperCase();
      if (!rubKey || rubKey === "?" || rubKey === "OBSOLETO" || rubKey === "OTROS") {
        const tdRubro = tr.querySelector("td");
        if (tdRubro) tdRubro.classList.add("rubro-alert");
      }

      tbody.appendChild(tr);
    });

    const valTotal = document.getElementById("mm_valTotal");
    if (valTotal) valTotal.textContent = `$ ${fmtMoney(total)}`;
  }

  function downloadStaticFile(filename) {
    const a = document.createElement("a");
    a.href = filename;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadFilteredBaseMM() {
    if (!headers || !headers.length || !data || !data.length) {
      showError("Todavía no se cargó el archivo ANALISIS-MM.csv.");
      return;
    }

    const rows = filteredRows();
    if (!rows.length) {
      showError("No hay filas para descargar según el filtro actual.");
      return;
    }

    const csvText = toDelimitedCSV(headers, rows, DELIM);
    const sel = getSelectedClientes();
    const label = (sel.length === 0 || sel.length > 2) ? "FILTRADO" : sel.join("_");
    const filename = `BASE_MM_${label}.csv`;

    downloadTextFile(csvText, filename);
  }

  function downloadSinRubro() {
    if (!headers || !headers.length || !data || !data.length) {
      showError("Todavía no se cargó el archivo ANALISIS-MM.csv.");
      return;
    }

    const colRubro = byFirstExisting(RUBRO_CANDIDATES);
    if (!colRubro) {
      showError(`No encontré la columna Rubro en ${csvUrl}.`);
      return;
    }

    const rows = filteredRows();
    const out = rows.filter(r => {
      const rub = clean(r[colRubro]);
      const key = rub.trim().toUpperCase();
      return (key === "" || key === "?" || key === "OBSOLETO" || key === "OTROS");
    });

    if (!out.length) {
      showError("No hay filas para descargar con RUBRO vacío / ? / OBSOLETO / OTROS.");
      return;
    }

    const csvText = toDelimitedCSV(headers, out, DELIM);
    downloadTextFile(csvText, "SIN RUBRO.csv");
  }

  function toDelimitedCSV(headerList, rowsObj, delimiter) {
    const esc = (val) => {
      const s = (val ?? "").toString();
      const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
      const q = s.replace(/"/g, '""');
      return mustQuote ? `"${q}"` : q;
    };

    const lines = [];
    lines.push(headerList.map(esc).join(delimiter));

    for (const r of rowsObj) {
      lines.push(headerList.map(h => esc(r[h])).join(delimiter));
    }
    return lines.join("\n");
  }

  function downloadTextFile(text, filename) {
    const content = "﻿" + (text ?? "");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "descarga.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadByEstadoValue(estadoExacto, filename) {
    if (!headers || !headers.length || !data || !data.length) {
      showError("Todavía no se cargó el archivo ANALISIS-MM.csv.");
      return;
    }
    const rows = filteredRows();
    const wanted = normalizeHeaderName(estadoExacto);
    const out = rows.filter(r => normalizeHeaderName(r[COL_ESTADO]) === wanted);

    if (!out.length) {
      showError(`No hay filas para descargar para el estado: ${estadoExacto}`);
      return;
    }
    const csvText = toDelimitedCSV(headers, out, DELIM);
    downloadTextFile(csvText, filename);
  }

  /* ============================
     EXPOSE DEFERRED INITIALIZATION LIFE CYCLE HOOK
  =========================== */
  window.initMM = function() {
    if (window.mmInitialized) return;
    window.mmInitialized = true;

    document.getElementById("mm_btnDLBaseMM")?.addEventListener("click", () => downloadFilteredBaseMM());
    document.getElementById("mm_btnDLStoNuloPP")?.addEventListener("click", () => downloadSinRubro());
    
    // Delegación de eventos para botones dinámicos en leyenda
    document.addEventListener("click", (ev) => {
      const t = ev.target.closest && ev.target.closest("button");
      if (!t) return;
      if (t.id === "btnDLStockNulo") return downloadByKind("stock_nulo");
      if (t.id === "btnDLMenorPP") return downloadByKind("menor_pp");
      if (t.id === "btnDLMayorStockMax") return downloadByKind("mayor_stock_max");
    });

    safeSetText("lastUpdate", (window.LAST_UPDATE || "").toString().trim() || "--/--/----");
    
    // Optimización: fetchWithCache
    fetchWithCache(csvUrl + "?t=" + window.CACHE_BUSTER)
      .then(text => {
        const m = parseDelimited(text, DELIM);
        if (!m.length || m.length < 2) {
          showError("El CSV está vacío o no tiene filas.");
          return;
        }

        headers = m[0].map(clean);

        COL_CLIENT = byFirstExisting(CLIENT_CANDIDATES);
        COL_MATERIAL = byFirstExisting(MATERIAL_CANDIDATES);
        COL_LIBRE = byFirstExisting(LIBRE_CANDIDATES);
        COL_ESTADO = byFirstExisting(ESTADO_CANDIDATES);

        const missing = [];
        if (!COL_CLIENT) missing.push("ALMACEN");
        if (!COL_MATERIAL) missing.push("Material");
        if (!COL_LIBRE) missing.push("Libre utilización");
        if (!COL_ESTADO) missing.push("Estado");

        if (missing.length) {
          showError(
            `Faltan columnas en ${csvUrl}: ${missing.join(", ")}`
          );
          return;
        }

        data = m.slice(1).map(row => {
          const o = {};
          headers.forEach((h, i) => (o[h] = clean(row[i])));
          return o;
        });

        safeSetText("mm_clienteHint", `Columna cliente: ${COL_CLIENT}`);

        renderClientes();
        applyAll();

        // Aseguramos que se cargue la evolución temporal
        if (typeof window.initEvolucion === "function") {
          window.initEvolucion();
        }

        const sel = document.getElementById("mm_clienteSelect");
        if (sel) {
          sel.addEventListener("change", (e) => {
            enforceAllOption(e.target);
            applyAll();
          });
        }
      })
      .catch(err => {
        console.error(err);
        showError(`Error cargando ${csvUrl}.`);
      });
  };

})();
