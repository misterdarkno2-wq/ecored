"use strict";
/*
 * Eco-Red · Preferencias del visitante.
 * Se carga en <head>, antes de dibujar la página, para aplicar la letra grande
 * sin parpadeo si la persona la eligió en una visita anterior.
 */
try {
  if (localStorage.getItem("ecored-letra") === "grande")
    document.documentElement.classList.add("large-text");
} catch (e) {
  // Sin almacenamiento disponible: se usa la letra normal.
}
