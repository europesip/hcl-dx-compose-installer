# Cómo trabajamos: issues, tablero y especificaciones

<p><a href="workflow.md">English</a> · <b>Español</b></p>

Cada cambio del instalador empieza como un **issue**, se sigue en el **tablero del proyecto** y se cierra con un
**pull request** que demuestra sus criterios de aceptación. El objetivo es que cada cambio esté definido antes de
construirse, documentado en un único sitio y sea fácil de seguir. Es el primer paso hacia el **desarrollo guiado por
especificaciones** (*spec-driven development*).

## 1 · Abrir un issue (la especificación)

Usa uno de los tres formularios. Los issues en blanco están desactivados, para que todos se escriban igual.

| Formulario | Etiqueta | Para |
|---|---|---|
| 🚀 Enhancement (spec) | `enhancement` | Una capacidad, opción o caso de uso nuevo |
| 🐞 Bug | `bug` | Algo no se comporta como debería |
| 🧱 Tech debt | `tech-debt` | Un atajo que hay que pagar antes de que se convierta en un bug |

Lo importante de cada formulario son los **criterios de aceptación**: afirmaciones comprobables («dado … cuando …
entonces …»). Un cambio está terminado cuando se marcan todas las casillas, no cuando se escribe el código. Los
cambios grandes son **épicas**: se dividen en sub-issues, para que cada uno quepa en un pull request.

## 2 · Clasificación (triage)

Un responsable completa el issue en el tablero:

| Campo | Valores |
|---|---|
| **Prioridad** (etiqueta) | 🔴 `P1` alta · 🟡 `P2` media · 🔵 `P3` baja |
| **Área** (etiqueta) | `area:wizard` · `area:engine` · `area:bundle` · `area:cicd` · `area:packaging` · `infra:aws` |
| **Effort** (número) | Escala relativa 1-2-3-5-8-13 (1 ≈ una hora, 13 = una épica que se divide antes de empezar) |
| **Release** | La versión en la que se planifica, o *Later* |

`blocked` marca un issue que depende de otra tarea o de algo externo (HCL, una versión de un tercero…).

## 3 · El tablero

| Columna | Significado |
|---|---|
| 📋 **Backlog** | Definido y pendiente de empezar |
| 🚧 **In progress** | Trabajo activo (2 o 3 como máximo a la vez) |
| 🧪 **In testing / Blocked** | Probándose en el clúster del laboratorio, o detenido por una dependencia |
| ✅ **Done** | Terminado y comprobado |

El [proyecto](https://github.com/orgs/europesip/projects/1) tiene varias vistas: la tabla completa, el tablero Kanban, el tablero por release (con y sin lo
terminado) y una tabla para la deuda técnica, otra para las mejoras y otra para los bugs. Sus gráficos muestran el
estado actual, la evolución del trabajo y la carga por release.

## 4 · Construirlo

1. Mueve el issue a **In progress** y crea una rama: `<número>-<nombre-corto>` (por ejemplo `42-oracle-ssl`).
2. Abre un pull request que diga `Closes #<número>`. La plantilla del pull request pide los criterios de aceptación,
   las pruebas (unitarias, golden test, clúster del laboratorio) y la lista de la release (CHANGELOG y documentación
   en inglés y español).
3. Mientras se prueba en el clúster del laboratorio, el issue está **In testing**. Al fusionar el pull request, el
   issue se cierra y pasa a **Done**.

## 5 · Hacia el desarrollo guiado por especificaciones

El formulario del issue ya es una especificación corta (qué, por qué, criterios de aceptación, plan de pruebas). Para
los cambios con un esfuerzo de 5 o más, la especificación vive también en el repositorio, junto al código que describe:

- `docs/specs/<número>-<nombre-corto>.md`, a partir de [docs/specs/TEMPLATE.md](specs/TEMPLATE.md): resumen,
  comportamiento actual, especificación, criterios de aceptación, plan y tareas.
- Se revisa y se fusiona (estado *Approved*) **antes** de la implementación, y el pull request que cierra el issue la
  actualiza a *Implemented*.

Una especificación versionada es la entrada de la implementación, la escriba una persona o un agente de IA, y la
referencia de su revisión y de sus pruebas. Con el tiempo, las especificaciones describen qué hace el instalador y por qué.
