// Funcionalidade de Menu Mobile
document
  .getElementById("menu-toggle")
  .addEventListener("click", function () {
    document.getElementById("mobile-menu").classList.toggle("hidden");
  });

// Adicionar suavidade ao clique de links âncora (melhora UI/UX)
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    document.getElementById("mobile-menu").classList.add("hidden"); // Fecha menu mobile após clique
    document.querySelector(this.getAttribute("href")).scrollIntoView({
      behavior: "smooth",
    });
  });
});
