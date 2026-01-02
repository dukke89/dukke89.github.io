// KPI variacion vs mes anterior
document.addEventListener("DOMContentLoaded",()=>{
 document.querySelectorAll(".kpi").forEach(kpi=>{
  kpi.querySelectorAll("small,span,div,p").forEach(el=>{
   const t=el.textContent||"";
   if(t.includes("▲")){el.classList.add("up")}
   if(t.includes("▼")){el.classList.add("down")}
  })
 })
});
