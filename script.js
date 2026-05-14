/* --------------------------------------------------------------
   script.js – Carga CSV, filtra "CUMPLIDO" y colorea fechas vencidas
   -------------------------------------------------------------- */

/**
 * Utiliza fetch() para obtener el CSV. Para evitar restricciones CORS al
 * abrir el archivo directamente con `file://`, sirve la carpeta mediante
 * un servidor HTTP local (p. ej. `python -m http.server 8000`).
 *
 * El nombre del archivo tiene un espacio ("365 prueba.csv"); la URL se
 * codifica automáticamente con encodeURI().
 */

document.addEventListener('DOMContentLoaded', () => {
  const csvFileName = '365 prueba.csv'; // nombre exacto del CSV
  const csvUrl = encodeURI(csvFileName); // codifica espacios y caracteres especiales
  const tableBody = document.querySelector('#orders-table tbody');
  const loader = document.querySelector('.loading-indicator');

  // ---------- Funciones auxiliares ----------
  const parseDate = str => {
    // espera formato dd/mm/aaaa
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

  // ---------- Cargar y procesar CSV ----------
  fetch(csvUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`No se pudo cargar el CSV (status ${response.status})`);
      }
      return response.text();
    })
    .then(text => {
      const lines = text.trim().split('\n');
      const header = lines[0].split(';').map(h => h.trim());

      // Índices de columnas de interés
      const idx = {
        pedido: header.indexOf('NRO. VA01/VA21'),
        estado: header.indexOf('ESTADO ITEM'),
        entrega: header.indexOf('FECHA ENTREGA ESPERADA'),
        cantidad: header.indexOf('CANTIDAD SOLICITADA'),
        descripcion: header.indexOf('DESCRIPCION ITEM'),
        centro: header.indexOf('CENTRO'),
      };

      // Verificar que todas existan
      const missing = Object.entries(idx)
        .filter(([, v]) => v === -1)
        .map(([k]) => k);
      if (missing.length) {
        throw new Error(`Columnas faltantes en CSV: ${missing.join(', ')}`);
      }

      const rows = lines.slice(1).map(l => l.split(';'));
      const filtered = rows.filter(r => r[idx.estado].trim() === 'ADJUDICADO');

      // Construir la tabla
      filtered.forEach(row => {
        const tr = document.createElement('tr');

        // Pedido
        const tdPedido = document.createElement('td');
        tdPedido.textContent = row[idx.pedido];
        tr.appendChild(tdPedido);

        // Estado
        const tdEstado = document.createElement('td');
        tdEstado.textContent = row[idx.estado];
        tr.appendChild(tdEstado);

        // Entrega (con posible rojo)
        const entregaStr = row[idx.entrega];
        const fecha = parseDate(entregaStr);
        const tdEntrega = document.createElement('td');
        tdEntrega.textContent = entregaStr;
        if (isVencida(fecha)) tdEntrega.classList.add('vencida');
        tr.appendChild(tdEntrega);

        // Cantidad
        const tdCant = document.createElement('td');
        tdCant.textContent = row[idx.cantidad];
        tr.appendChild(tdCant);

        // Descripción
        const tdDesc = document.createElement('td');
        tdDesc.textContent = row[idx.descripcion];
        tr.appendChild(tdDesc);

        // Centro
        const tdCentro = document.createElement('td');
        tdCentro.textContent = row[idx.centro];
        tr.appendChild(tdCentro);

        tableBody.appendChild(tr);
      });

      loader.style.display = 'none';
      if (filtered.length === 0) {
        const msg = document.createElement('p');
        msg.textContent = '⚠️ No se encontró ningún pedido con estado ADJUDICADO.';
        msg.style.textAlign = 'center';
        msg.style.color = '#ff5c5c';
        document.querySelector('.table-container').appendChild(msg);
      }
    })
    .catch(err => {
      console.error(err);
      loader.textContent = '❌ Error al cargar los datos. Asegúrate de servir la carpeta con un servidor HTTP (p. ej. python -m http.server 8000).';
    });
});
