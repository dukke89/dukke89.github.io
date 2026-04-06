/**
 * help.js — Sistema de modal de ayuda contextual
 * Usar: openHelp("Título", "<p>Contenido html</p>")
 */
(function () {

    // ── Crear overlay + modal una sola vez ──────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.id = 'helpOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
    <div class="help-modal" id="helpModal">
      <div class="help-modal-header">
        <span class="help-modal-icon">ℹ️</span>
        <span class="help-modal-title" id="helpTitle"></span>
        <button class="help-modal-close" id="helpClose" aria-label="Cerrar ayuda">✕</button>
      </div>
      <div class="help-modal-body" id="helpBody"></div>
    </div>`;

    document.body.appendChild(overlay);

    // ── Cerrar ──────────────────────────────────────────────────────────────
    function closeHelp() {
        overlay.classList.remove('help-overlay--open');
        document.body.style.overflow = '';
    }

    // Click en el fondo oscuro
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeHelp();
    });

    // Botón X
    document.getElementById('helpClose').addEventListener('click', closeHelp);

    // Tecla Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeHelp();
    });

    // ── Abrir ───────────────────────────────────────────────────────────────
    function openHelp(title, html) {
        document.getElementById('helpTitle').textContent = title;
        document.getElementById('helpBody').innerHTML = html;
        overlay.classList.add('help-overlay--open');
        document.body.style.overflow = 'hidden';
        // Foco en el botón cerrar (accesibilidad)
        setTimeout(() => document.getElementById('helpClose').focus(), 50);
    }

    // Exponer globalmente
    window.openHelp = openHelp;
    window.closeHelp = closeHelp;

})();
