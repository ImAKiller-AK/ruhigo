# Worldsmith

Generador de mundos procedurales en una sola página web. Hace dos tipos de mapa:

- **Planeta:** un mundo entero, con las dos pestañas de abajo.
- **Mapa de batalla:** un mapa cuadrado de 4, 6 u 8 km, al estilo de los battle royale, con clima (templado,
  nieve, desierto, jungla), forma (isla, costa, interior), ciudades, pueblos, complejos, edificios, calles,
  carreteras y puentes.

Las pestañas del planeta:

- **Generation:** relieve, clima, ríos, asentamientos y exportación a Minecraft Bedrock.
- **Simulation:** rutas comerciales, facciones y 300 años de fronteras, guerras y pactos sobre una línea de tiempo.

## Abrirlo

Abre `dist/preview.html` en el navegador. No necesita instalar nada.

## Pasarlo a Claude Code

1. Crea un repositorio en GitHub (puede ser privado) y sube esta carpeta completa.
2. Abre ese repositorio en Claude Code.
3. Claude Code lee `CLAUDE.md` al empezar: ahí está cómo funciona el código, las decisiones tomadas y cómo
   publicar la página. Puedes pedirle los cambios igual que hasta ahora.

## Comandos (necesitan Node.js 20 o superior)

| Comando | Qué hace |
|---|---|
| `npm run build` | Une los archivos de `src/` en `dist/worldsmith.html` y `dist/preview.html` |
| `npm test` | Prueba el motor: historia de 300 años, equilibrio de poder en 16 mundos, rutas y exportación a Minecraft (unos 50 s) |
| `npm run check` | Avisa si `dist/` no está al día con `src/` |

Con Python 3 instalado, la prueba de Minecraft además relee el mundo exportado con un lector independiente.

## Estructura

```
src/page.html        estructura de la página
src/styles.css       estilos
src/js/01…14-*.js    el código, por partes, en el orden en que se ejecuta
scripts/build.mjs    une src/ en dist/
tests/               pruebas del motor
tools/               lector independiente de mundos de Minecraft
dist/                la página lista (no se edita a mano)
```
