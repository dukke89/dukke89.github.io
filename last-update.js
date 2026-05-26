// Editá SOLO este archivo para cambiar la fecha mostrada en el header.
// Formato sugerido: dd/mm/aaaa
window.LAST_UPDATE = "26/05/2026";

let cb = sessionStorage.getItem('mi_cache_buster');
if (!cb) {
  cb = new Date().getTime();
  sessionStorage.setItem('mi_cache_buster', cb);
}
window.CACHE_BUSTER = cb;

window.forceRefreshData = function() {
  sessionStorage.removeItem('mi_cache_buster');
  window.location.reload();
};
