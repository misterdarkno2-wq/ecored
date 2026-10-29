"use strict";
/*
 * Eco-Red · Preferencias del visitante.
 * Se carga en <head>, antes de dibujar la página, para aplicar la letra grande
 * y el modo claro u oscuro sin parpadeo si la persona los eligió en una visita
 * anterior. Sin elección guardada, los colores siguen al dispositivo.
 */
try {
  if (localStorage.getItem("ecored-letra") === "grande")
    document.documentElement.classList.add("large-text");
  const tema = localStorage.getItem("ecored-tema");
  if (tema === "claro") document.documentElement.dataset.theme = "light";
  if (tema === "oscuro") document.documentElement.dataset.theme = "dark";
} catch (e) {
  // Sin almacenamiento disponible: letra normal y colores del dispositivo.
}
