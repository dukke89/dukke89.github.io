
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnDLBaseMM");
  if(btn){
    btn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = "BASE_MM.csv";
      link.download = "BASE_MM.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
});
