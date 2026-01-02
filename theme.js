/* Simple theme toggle (light/dark) for GitHub Pages static site */
(function(){
  const STORAGE_KEY = "abastecimiento_theme";
  const root = document.documentElement;

  function setBtn(t){
    document.querySelectorAll("#themeToggle").forEach(btn=>{
      const icon = btn.querySelector(".icon");
      const label = btn.querySelector(".label");
      if(icon) icon.textContent = (t === "dark") ? "☀️" : "🌙";
      if(label) label.textContent = (t === "dark") ? "Claro" : "Oscuro";
      btn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
    });
  }

  function applyTheme(t){
    if (t === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    setBtn(t);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved || (prefersDark ? "dark" : "light");
  applyTheme(initial);

  function toggle(){
    const current = root.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  window.addEventListener("DOMContentLoaded", ()=>{
    setBtn(root.dataset.theme === "dark" ? "dark" : "light");
    document.querySelectorAll("#themeToggle").forEach(btn=>{
      btn.addEventListener("click", toggle);
    });
  });
})();