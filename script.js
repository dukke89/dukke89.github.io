/* --------------------------------------------------------------
   script.js – Carga CSV, Pestañas estilo Excel y Filtros
   -------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const csvFileName = '365 prueba.csv';
  const csvUrl = encodeURI(csvFileName);
  const tableBody = document.querySelector('#orders-table tbody');
  const loader = document.querySelector('.loading-indicator');
  const statusFilter = document.querySelector('#status-filter');
  const tabsContainer = document.querySelector('#tabs-container');

  if (!statusFilter || !tableBody || !tabsContainer) {
    console.error('Faltan elementos en el HTML. Asegúrate de subir el nuevo index.html.');
    return;
  }

  let allData = [];
  let indices = {};
  let currentClaseDoc = 'TODOS';
  let currentStatus = 'ADJUDICADO';

  // ---------- Funciones auxiliares ----------
  const parseDate = str => {
    if (!str) return null;
    const parts = str.trim().split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(p => parseInt(p, 10));
    return new Date(y, m - 1, d);
  };

  const isVencida = date => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const updateTable = () => {
    let filtered = allData;

    // Filtro 1: Clase de Doc (Pestañas)
    if (currentClaseDoc !== 'TODOS') {
      filtered = filtered.filter(r => r[indices.claseDoc]?.trim() === currentClaseDoc);
    }

    // Filtro 2: Estado (Dropdown)
    if (currentStatus !== 'TODOS') {
      filtered = filtered.filter(r => r[indices.estado]?.trim() === currentStatus);
    }

    renderTable(filtered);
  };

  const renderTable = (data) => {
    tableBody.innerHTML = '';
    
    // Mostramos los primeros 100 para no saturar, pero el usuario puede ver más si filtra
    const displayData = data.slice(0, 100);

    displayData.forEach(row => {
      if (row.length < 5) return;
      const tr = document.createElement('tr');

      // Pedido
      const tdPedido = document.createElement('td');
      tdPedido.textContent = row[indices.pedido] || '';
      tr.appendChild(tdPedido);

      // Estado
      const tdEstado = document.createElement('td');
      tdEstado.textContent = row[indices.estado] || '';
      tr.appendChild(tdEstado);

      // Entrega
      const entregaStr = row[indices.entrega] || '';
      const fecha = parseDate(entregaStr);
      const tdEntrega = document.createElement('td');
      tdEntrega.textContent = entregaStr;
      
      // Aplicar color rojo si está vencida
      if (isVencida(fecha)) {
        tdEntrega.classList.add('vencida');
      }
      tr.appendChild(tdEntrega);

      // Cantidad
      const tdCant = document.createElement('td');
      tdCant.textContent = row[indices.cantidad] || '';
      tr.appendChild(tdCant);

      // Descripción
      const tdDesc = document.createElement('td');
      tdDesc.textContent = row[indices.descripcion] || '';
      tr.appendChild(tdDesc);

      // Centro
      const tdCentro = document.createElement('td');
      tdCentro.textContent = row[indices.centro] || '';
      tr.appendChild(tdCentro);

      tableBody.appendChild(tr);
    });

    if (data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">⚠️ No se encontraron resultados para los filtros seleccionados.</td></tr>';
    }
  };

  const createTabs = (data) => {
    const clases = new Set();
    data.forEach(row => {
      const clase = row[indices.claseDoc]?.trim();
      if (clase) clases.add(clase);
    });

    tabsContainer.innerHTML = '';
    
    // Pestaña "TODOS"
    const allTab = document.createElement('div');
    allTab.className = 'tab-item active';
    allTab.textContent = 'TODOS';
    allTab.onclick = () => switchTab('TODOS', allTab);
    tabsContainer.appendChild(allTab);

    // Pestañas por Clase de Doc
    Array.from(clases).sort().forEach(clase => {
      const tab = document.createElement('div');
      tab.className = 'tab-item';
      tab.textContent = clase;
      tab.onclick = () => switchTab(clase, tab);
      tabsContainer.appendChild(tab);
    });
  };

  const switchTab = (clase, element) => {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
    currentClaseDoc = clase;
    updateTable();
  };

  const populateStatusFilter = (data) => {
    const states = new Set();
    data.forEach(row => {
      const state = row[indices.estado]?.trim();
      if (state) states.add(state);
    });

    statusFilter.innerHTML = '<option value="TODOS">-- Todos los Estados --</option>';
    Array.from(states).sort().forEach(state => {
      const option = document.createElement('option');
      option.value = state;
      option.textContent = state;
      if (state === 'ADJUDICADO') option.selected = true;
      statusFilter.appendChild(option);
    });
  };

  // ---------- Cargar y procesar CSV ----------
  fetch(csvUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
      return response.text();
    })
    .then(text => {
      const lines = text.trim().split('\n');
      const header = lines[0].split(';').map(h => h.trim());

      indices = {
        pedido: header.indexOf('NRO. VA01/VA21'),
        estado: header.indexOf('ESTADO ITEM'),
        entrega: header.indexOf('FECHA ENTREGA ESPERADA'),
        cantidad: header.indexOf('CANTIDAD SOLICITADA'),
        descripcion: header.indexOf('DESCRIPCION ITEM'),
        centro: header.indexOf('CENTRO'),
        claseDoc: header.indexOf('CLASE DE DOC')
      };

      allData = lines.slice(1).map(l => l.split(';'));
      
      createTabs(allData);
      populateStatusFilter(allData);
      
      updateTable();
      loader.style.display = 'none';

      statusFilter.addEventListener('change', (e) => {
        currentStatus = e.target.value;
        updateTable();
      });
    })
    .catch(err => {
      console.error(err);
      loader.textContent = '❌ Error al cargar los datos. Verifica que el CSV esté en la carpeta.';
    });
});
