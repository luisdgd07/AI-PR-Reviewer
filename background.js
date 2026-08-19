importScripts("providers.js");

const REVIEW_SYSTEM_PROMPT = `Eres un revisor de código senior. Analizas diffs de Pull Requests para encontrar bugs, problemas de seguridad, malas prácticas y oportunidades de mejora.
Responde EXCLUSIVAMENTE con un JSON válido (sin texto adicional, sin markdown, sin \`\`\`) con esta forma exacta:
{
  "summary": "resumen general breve del PR en 2-3 frases",
  "overallRisk": "bajo" | "medio" | "alto",
  "files": [
    {
      "filename": "ruta/al/archivo.ext",
      "issues": [
        {
          "severity": "bug" | "mejora" | "estilo" | "seguridad",
          "line": "número de línea aproximado o rango, como texto",
          "comment": "explicación clara y accionable del problema y cómo resolverlo"
        }
      ]
    }
  ]
}
Si un archivo no tiene problemas relevantes, igual inclúyelo con "issues": [].
No inventes archivos que no estén en el diff.`;

const FULL_FILE_SYSTEM_PROMPT = `Eres un ingeniero de software senior. Se te da el contenido completo y original de un archivo, el diff aplicado en un Pull Request, y comentarios de revisión de código.
Tu tarea: producir la versión completa y corregida del archivo, aplicando los cambios del PR y solucionando los problemas señalados en los comentarios de revisión.
Responde EXCLUSIVAMENTE con el contenido completo del archivo final, sin explicaciones, sin markdown, sin \`\`\`, listo para guardarse tal cual como el archivo.`;

function stripJsonFences(text) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
}

function stripCodeFences(text) {
  const fenceMatch = text.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1];
  return text;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REVIEW_DIFF") {
    handleReviewDiff(message.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true; // async
  }

  if (message.type === "GENERATE_FULL_FILE") {
    handleGenerateFullFile(message.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message || String(err) });
    });
    return true; // async
  }

  if (message.type === "GET_SETTINGS") {
    chrome.storage.local.get(["activeProvider", "providers"], (data) => {
      sendResponse(data);
    });
    return true;
  }

  if (message.type === "FETCH_PR_DIFF") {
    withGithubAuthHeaders({ "Accept": "application/vnd.github.v3.diff" })
      .then(headers => fetch(`https://github.com/${message.owner}/${message.repo}/pull/${message.number}.diff`, { headers }))
      .then(r => {
        if (!r.ok) throw new Error(githubErrorMessage(r.status, "obtener el diff del PR"));
        return r.text();
      })
      .then(text => sendResponse({ diff: text }))
      .catch(err => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (message.type === "FETCH_PR_META") {
    withGithubAuthHeaders({ "Accept": "application/vnd.github+json" })
      .then(headers => fetch(`https://api.github.com/repos/${message.owner}/${message.repo}/pulls/${message.number}`, { headers }))
      .then(r => {
        if (!r.ok) throw new Error(githubErrorMessage(r.status, "obtener info del PR"));
        return r.json();
      })
      .then(data => sendResponse({
        title: data.title,
        body: data.body,
        headSha: data.head?.sha,
        baseSha: data.base?.sha
      }))
      .catch(err => sendResponse({ error: err.message || String(err) }));
    return true;
  }

  if (message.type === "FETCH_FILE_CONTENT") {
    // Usamos la Contents API (en vez de raw.githubusercontent.com) porque acepta
    // autenticación por token, lo que permite leer archivos de repos privados.
    withGithubAuthHeaders({ "Accept": "application/vnd.github.raw" })
      .then(headers => fetch(
        `https://api.github.com/repos/${message.owner}/${message.repo}/contents/${encodeURIPath(message.path)}?ref=${encodeURIComponent(message.ref)}`,
        { headers }
      ))
      .then(r => {
        if (!r.ok) {
          if (r.status === 404) return null; // archivo nuevo, no existía antes del PR
          throw new Error(githubErrorMessage(r.status, "obtener el contenido del archivo"));
        }
        return r.text();
      })
      .then(content => sendResponse({ content }))
      .catch(err => sendResponse({ error: err.message || String(err) }));
    return true;
  }
});

function encodeURIPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function getGithubToken() {
  const data = await chrome.storage.local.get(["githubToken"]);
  return (data.githubToken || "").trim();
}

async function withGithubAuthHeaders(extraHeaders) {
  const token = await getGithubToken();
  const headers = { ...extraHeaders };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function githubErrorMessage(status, action) {
  if (status === 404) {
    return `No se pudo ${action} (404). Si es un repositorio privado, configura tu token de GitHub en las opciones de la extensión.`;
  }
  if (status === 401 || status === 403) {
    return `No se pudo ${action} (${status}): sin permisos. Revisa que tu token de GitHub en las opciones sea válido y tenga acceso a este repositorio.`;
  }
  return `No se pudo ${action} (${status}).`;
}

async function getActiveProviderConfig() {
  const data = await chrome.storage.local.get(["activeProvider", "providers"]);
  const activeProvider = data.activeProvider;
  const providers = data.providers || {};
  if (!activeProvider) throw new Error("No hay proveedor de IA configurado. Abre las opciones de la extensión.");
  const cfg = providers[activeProvider];
  if (!cfg || !cfg.apiKey) throw new Error(`Falta la API key del proveedor ${activeProvider}. Configúrala en las opciones.`);
  return { providerId: activeProvider, apiKey: cfg.apiKey, model: cfg.model || PROVIDERS[activeProvider].defaultModel };
}

async function handleReviewDiff(payload) {
  try {
    const { providerId, apiKey, model } = await getActiveProviderConfig();
    const { prTitle, prBody, files } = payload;

    const filesText = files.map(f => `### Archivo: ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``).join("\n\n");
    const userPrompt = `Título del PR: ${prTitle || "(sin título)"}\nDescripción: ${prBody || "(sin descripción)"}\n\nDiffs de los archivos modificados:\n\n${filesText}`;

    const raw = await callAIProvider(providerId, {
      apiKey,
      model,
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userPrompt
    });

    const cleaned = stripJsonFences(raw);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo. Respuesta recibida: " + cleaned.slice(0, 300));
    }
    return { result: parsed };
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`Error de red al llamar a la API del proveedor. Verifica tu conexión a internet y que la API key sea válida. Detalles: ${err.message}`);
    }
    throw err;
  }
}

async function handleGenerateFullFile(payload) {
  const { providerId, apiKey, model } = await getActiveProviderConfig();
  const { filename, originalContent, diff, reviewComments } = payload;

  const userPrompt = `Archivo: ${filename}

Contenido original completo:
\`\`\`
${originalContent || "(archivo nuevo, no existía antes del PR)"}
\`\`\`

Diff aplicado en el PR:
\`\`\`diff
${diff}
\`\`\`

Comentarios de revisión a aplicar/corregir:
${(reviewComments || []).map(c => `- [${c.severity}] (línea ${c.line}): ${c.comment}`).join("\n") || "(sin comentarios adicionales)"}

Devuelve el archivo completo final.`;

  const raw = await callAIProvider(providerId, {
    apiKey,
    model,
    systemPrompt: FULL_FILE_SYSTEM_PROMPT,
    userPrompt
  });

  const content = stripCodeFences(raw).trim();
  return { content };
}
