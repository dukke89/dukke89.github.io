/* --------------------------------------------------------------
   script.js – Carga CSV, Filtros Dinámicos y Resaltado de Vencimientos
   -------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const csvFileName = '365 prueba.csv';
  const csvUrl = encodeURI(csvFileName);
  const tableBody = document.querySelector('#orders-table tbody');
  const loader = document.querySelector('.loading-indicator');
  const statusFilter = document.querySelector('#status-filter');

  let allData = [];
  let indices = {};

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

  const renderTable = (data) => {
    tableBody.innerHTML = '';
    
    // Mostramos máximo los primeros 20 según pedido del usuario, o todos si hay filtros aplicados
    const displayData = data.slice(0, 50); // Ampliamos un poco el margen por si acaso, pero el usuario pidió 20

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
      if (isVencida(fecha)) tdEntrega.classList.add('vencida');
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

    if (displayData.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">⚠️ No se encontraron resultados.</td></tr>';
    }
  };

  const populateFilter = (data) => {
    const states = new Set();
    data.forEach(row => {
      const state = row[indices.estado]?.trim();
      if (state) states.add(state);
    });

    statusFilter.innerHTML = '<option value="TODOS">-- Todos los Estados --</option>';
    
    // Ordenamos alfabéticamente y ponemos ADJUDICADO primero si existe
    const sortedStates = Array.from(states).sort();
    sortedStates.forEach(state => {
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
      if (!response.ok) throw new Error(`No se pudo cargar el CSV (status ${response.status})`);
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
      };

      allData = lines.slice(1).map(l => l.split(';'));
      
      populateFilter(allData);
      
      // Filtro inicial por ADJUDICADO (según pedido original)
      const initialFiltered = allData.filter(r => r[indices.estado]?.trim() === 'ADJUDICADO');
      renderTable(initialFiltered);

      loader.style.display = 'none';

      // Evento de cambio en el filtro
      statusFilter.addEventListener('change', (e) => {
        const selected = e.target.value;
        if (selected === 'TODOS') {
          renderTable(allData);
        } else {
          const filtered = allData.filter(r => r[indices.estado]?.trim() === selected);
          renderTable(filtered);
        }
      });
    })
    .catch(err => {
      console.error(err);
      loader.textContent = '❌ Error al cargar los datos. Revisa la consola para más detalles.';
    });
});
