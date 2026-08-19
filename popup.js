document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.local.get(["activeProvider", "providers"], (data) => {
  const statusBox = document.getElementById("status-box");
  const provider = data.activeProvider;
  const hasKey = provider && data.providers && data.providers[provider] && data.providers[provider].apiKey;

  if (hasKey) {
    statusBox.className = "ok";
    statusBox.innerText = `✔ Proveedor activo: ${provider}`;
  } else {
    statusBox.className = "warn";
    statusBox.innerText = "⚠ No has configurado ninguna API key todavía.";
  }
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const isPrPage = tab && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(tab.url || "");
  document.getElementById(isPrPage ? "onPrPage" : "notOnPrPage").classList.remove("hidden");
});
