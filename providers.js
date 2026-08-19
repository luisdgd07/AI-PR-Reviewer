// providers.js
// Configuración y llamadas a cada proveedor de IA soportado.
// Cada función recibe { apiKey, model, systemPrompt, userPrompt } y devuelve el texto de respuesta.

const PROVIDERS = {
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    docsHint: "https://platform.openai.com/api-keys"
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-5.0-flash",
    docsHint: "https://aistudio.google.com/apikey"
  },
  claude: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-4-5",
    docsHint: "https://console.anthropic.com/settings/keys"
  },
  grok: {
    label: "xAI Grok",
    defaultModel: "grok-3",
    docsHint: "https://console.x.ai/"
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    docsHint: "https://console.groq.com/keys"
  }
};

async function callOpenAICompatible(baseUrl, { apiKey, model, systemPrompt, userPrompt }) {
  let res;
  try {
    res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      })
    });
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`Error de red al conectar con ${baseUrl}. Verifica que la extensión tenga permisos para este dominio y tu conexión a internet.`);
    }
    throw err;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error ${res.status} de la API: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenAI(opts) {
  return callOpenAICompatible("https://api.openai.com/v1/chat/completions", opts);
}

async function callGroq(opts) {
  return callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", opts);
}

async function callGrok(opts) {
  return callOpenAICompatible("https://api.x.ai/v1/chat/completions", opts);
}

async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`Error de red al conectar con la API de Gemini. Verifica tu conexión a internet.`);
    }
    throw err;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error ${res.status} de la API de Gemini: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map(p => p.text || "").join("\n");
}

async function callClaude({ apiKey, model, systemPrompt, userPrompt }) {
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`Error de red al conectar con la API de Claude. Verifica tu conexión a internet.`);
    }
    throw err;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error ${res.status} de la API de Claude: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || "").join("\n");
}

const PROVIDER_CALLERS = {
  openai: callOpenAI,
  gemini: callGemini,
  claude: callClaude,
  grok: callGrok,
  groq: callGroq
};

async function callAIProvider(providerId, opts) {
  const fn = PROVIDER_CALLERS[providerId];
  if (!fn) throw new Error(`Proveedor desconocido: ${providerId}`);
  return fn(opts);
}
