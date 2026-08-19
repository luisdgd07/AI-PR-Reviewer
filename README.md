# AI PR Reviewer — Extensión de Chrome

Revisa Pull Requests de GitHub con IA (bugs, mejoras, seguridad, estilo) usando tu propia API key de OpenAI, Google Gemini, Anthropic Claude, xAI Grok o Groq. Permite exportar el archivo completo ya corregido por la IA.

## Instalación (modo desarrollador)

1. Descomprime esta carpeta en tu computadora.
2. Abre Chrome y ve a `chrome://extensions`.
3. Activa el **Modo desarrollador** (interruptor arriba a la derecha).
4. Haz clic en **Cargar descomprimida** y selecciona la carpeta `ai-pr-reviewer`.
5. La extensión aparecerá en tu barra de herramientas.

## Configuración

1. Haz clic en el ícono de la extensión y luego en **"⚙ Configurar API key"** (o clic derecho en el ícono → Opciones).
2. Selecciona el proveedor de IA que quieras usar (OpenAI, Gemini, Claude, Grok o Groq).
3. Pega tu API key de ese proveedor (el enlace "Obtener API key" te lleva a la página de cada proveedor).
4. Opcional: especifica un modelo distinto al que viene por defecto.
5. Guarda la configuración.

Tu API key se guarda **solo en tu navegador** (`chrome.storage.local`) y nunca se envía a ningún servidor propio de la extensión — solo directamente al proveedor de IA que elijas.

## Uso

1. Abre cualquier Pull Request de GitHub, por ejemplo: `https://github.com/owner/repo/pull/123`.
2. Verás un botón flotante **"🤖 Revisar PR con IA"** en la esquina inferior derecha.
3. Haz clic: la extensión obtiene el diff del PR y lo envía a la IA para su análisis.
4. En el panel lateral verás, por archivo, los problemas detectados (bug, mejora, estilo, seguridad) con explicación.
5. Para cada archivo puedes hacer clic en **"⬇ Exportar archivo corregido"**: la IA genera el contenido completo del archivo con las correcciones aplicadas y se descarga automáticamente.

## Repos privados

Para revisar PRs de repositorios privados, ve a Opciones → sección **"GitHub — repos privados"** y pega un token de acceso personal:

- **Fine-grained token** (recomendado): en `github.com/settings/tokens?type=beta`, con permiso **"Contents: Read-only"** sobre los repos que quieras revisar.
- **Token clásico**: en `github.com/settings/tokens/new`, con el scope `repo`.

El token se guarda solo en `chrome.storage.local` y se envía únicamente a la API de GitHub (nunca a los proveedores de IA ni a terceros).

## Notas técnicas

- El diff se obtiene de `github.com/{owner}/{repo}/pull/{number}.diff` (con `Authorization: Bearer <token>` si configuraste uno).
- El contenido original de cada archivo se obtiene vía la Contents API de GitHub (`api.github.com/repos/{owner}/{repo}/contents/{path}?ref={sha}`), que soporta autenticación y por tanto funciona con repos privados.
- Todas las llamadas a proveedores de IA y a GitHub se hacen desde el *service worker* de la extensión (`background.js`) para evitar problemas de CSP/CORS en la página de GitHub.
- Sin token configurado, la extensión funciona igual pero solo con repos públicos (y con el límite de rate-limit anónimo de la API de GitHub, 60 peticiones/hora).

## Archivos del proyecto

- `manifest.json` — configuración de la extensión (Manifest V3)
- `background.js` — service worker: llamadas a GitHub y a los proveedores de IA
- `content.js` / `content.css` — botón flotante y panel inyectados en la página del PR
- `popup.html` / `popup.js` / `popup.css` — ventana emergente del ícono de la extensión
- `options.html` / `options.js` / `options.css` — página de configuración de API keys
- `providers.js` — configuración y funciones de llamada a cada proveedor de IA
