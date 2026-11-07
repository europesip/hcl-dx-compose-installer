# Cómo funciona

[English](how-it-works.md) · **Español** · [README](../README.es.md)

## Tus datos

- **Datos de la instalación:** la instalación (scripts, RUNBOOK, guion de Word) se genera **en tu
  navegador**. Lo que escribes en los pasos de la instalación, credenciales incluidas, no se envía a
  ningún servidor. Tus elecciones se recuerdan en tu navegador (nunca las credenciales).
- **Claves de AWS:** solo se envían cuando pides al instalador crear o borrar un entorno de AWS. Van al
  servidor del propio instalador (el pod o contenedor que tú ejecutas), que se las pasa al AWS CLI solo
  para esa operación. Nunca se escriben en disco ni en los logs.
- **Auditoría:** el código fuente está aquí para que lo audites.

## Cómo funciona

| Ruta | Qué es |
|---|---|
| `src/App.jsx`, `src/views.jsx`, `src/aws-view.jsx`, `src/ui.jsx`, `src/i18n.js` | Interfaz (React + Tailwind CSS, inglés y español) |
| `src/state.js` | Valores del formulario, despliegues rápidos, dependencias entre etapas |
| `src/engine/core.js` | Motor de generación: ficheros de los labs, pasos, `install.sh` |
| `src/engine/stages.js` | Etapas 0-5 y extras, las dos fases del webinar, `RUNBOOK.md` |
| `src/bundle.js`, `src/zip.js` | El zip, el enmascarado de credenciales, los valores clave de cada YAML |
| `src/word.js` | Guion del webinar en Word |
| `src/aws.js`, `server/aws/*.sh` | Tamaños y estimaciones de precio de AWS; los scripts que crean y borran los entornos |
| `server/index.mjs` | Servidor: la página, y la API que ejecuta los scripts de AWS y emite su salida |
| `Dockerfile`, `chart/hcl-dx-compose-installer` | Imagen del contenedor y chart de Helm |

El motor nació como la opción C del asistente de configuración de los
[labs](https://github.com/europesip/hcl-dx-compose-labs), que ahora está congelado.
`test/golden.e2e.mjs` comprueba que, para el mismo estado, el motor sigue generando los mismos ficheros y
comandos que ese asistente.

## Desarrollo

```bash
npm ci
PORT=8080 npm start &               # el servidor (API), con las herramientas de AWS en el PATH
npm run dev                         # http://localhost:5173 (envía /api a :8080)
npm test                            # pruebas unitarias
WIZARD=/ruta/a/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm start          # build de producción en http://localhost:8080
```

GitHub Actions ejecuta las pruebas, la prueba de equivalencia y el build. Construye la imagen (amd64 y
arm64) y prueba el contenedor: herramientas, cabeceras, API, solo lectura, y la interfaz completa con las
descargas. Después publica `ghcr.io/europesip/hcl-dx-compose-installer` (`:main` en cada push; `:X.Y.Z` y
el chart de Helm con un tag `vX.Y.Z`).
