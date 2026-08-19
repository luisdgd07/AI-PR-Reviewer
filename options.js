const providerSelect = document.getElementById("providerSelect");
const providerForms = document.getElementById("providerForms");
const saveStatus = document.getElementById("saveStatus");

let currentData = { activeProvider: "openai", providers: {} };

function renderForms() {
  providerForms.innerHTML = "";
  Object.keys(PROVIDERS).forEach((id) => {
    const meta = PROVIDERS[id];
    const saved = currentData.providers[id] || {};
    const block = document.createElement("div");
    block.className = "provider-block";
    block.dataset.provider = id;
    block.innerHTML = `
      <h3>${meta.label}</h3>
      <p class="provider-hint">Modelo por defecto: <code>${meta.defaultModel}</code> · <a href="${meta.docsHint}" target="_blank">Obtener API key</a></p>
      <label>API key</label>
      <div class="key-row">
        <input type="password" class="apiKeyInput" placeholder="Pega tu API key aquí" value="${saved.apiKey ? escapeAttr(saved.apiKey) : ""}" />
        <button type="button" class="toggle-visibility">👁</button>
      </div>
      <label>Modelo (opcional)</label>
      <input type="text" class="modelInput" placeholder="${meta.defaultModel}" value="${saved.model ? escapeAttr(saved.model) : ""}" />
    `;
    providerForms.appendChild(block);

    const toggleBtn = block.querySelector(".toggle-visibility");
    const keyInput = block.querySelector(".apiKeyInput");
    toggleBtn.addEventListener("click", () => {
      keyInput.type = keyInput.type === "password" ? "text" : "password";
    });
  });
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

function loadSettings() {
  chrome.storage.local.get(["activeProvider", "providers", "githubToken"], (data) => {
    currentData.activeProvider = data.activeProvider || "openai";
    currentData.providers = data.providers || {};
    providerSelect.value = currentData.activeProvider;
    renderForms();
    document.getElementById("githubTokenInput").value = data.githubToken || "";
  });
}

document.getElementById("toggleGithubToken").addEventListener("click", () => {
  const input = document.getElementById("githubTokenInput");
  input.type = input.type === "password" ? "text" : "password";
});

function collectFormsIntoData() {
  const providers = {};
  providerForms.querySelectorAll(".provider-block").forEach((block) => {
    const id = block.dataset.provider;
    const apiKey = block.querySelector(".apiKeyInput").value.trim();
    const model = block.querySelector(".modelInput").value.trim();
    providers[id] = { apiKey, model };
  });
  return providers;
}

document.getElementById("saveBtn").addEventListener("click", () => {
  const providers = collectFormsIntoData();
  const activeProvider = providerSelect.value;

  if (!providers[activeProvider] || !providers[activeProvider].apiKey) {
    saveStatus.className = "";
    saveStatus.style.color = "#cf222e";
    saveStatus.innerText = `Falta la API key del proveedor activo (${PROVIDERS[activeProvider].label}).`;
    return;
  }

  const githubToken = document.getElementById("githubTokenInput").value.trim();

  chrome.storage.local.set({ activeProvider, providers, githubToken }, () => {
    saveStatus.className = "ok";
    saveStatus.innerText = "✔ Configuración guardada.";
    setTimeout(() => { saveStatus.innerText = ""; }, 2500);
  });
});

loadSettings();
