document.addEventListener('DOMContentLoaded', () => {
    // Si ya está logueado, redirigir al index
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        window.location.href = 'index.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        // Criterio de validación simple (puedes cambiar esto luego si hay backend)
        // Por ahora, admin / admin o cualquier otro usuario básico.
        if ((username === 'admin' && password === 'admin') || 
            (username === 'usuario' && password === 'clave') ||
            (password === '1234')) { // At least some basic hardcoded logic
            
            // Éxito
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('username', username);
            
            // Redirect to dashboard
            window.location.href = 'index.html';
        } else {
            // Error
            errorMsg.classList.remove('visible');
            // Trigger reflow
            void errorMsg.offsetWidth;
            errorMsg.classList.add('visible');
            
            // Clear password field
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        }
    });
});
