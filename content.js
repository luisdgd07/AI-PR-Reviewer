// content.js
(function () {
  let panelEl = null;
  let fabEl = null;
  let lastDiffFiles = []; // [{filename, patch}]
  let lastReview = null;
  let owner, repo, number;

  function checkUrlAndInit() {
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!urlMatch) {
      if (fabEl) {
        fabEl.remove();
        fabEl = null;
      }
      if (panelEl) {
        panelEl.remove();
        panelEl = null;
      }
      return;
    }

    const [, newOwner, newRepo, newNumber] = urlMatch;
    if (owner !== newOwner || repo !== newRepo || number !== newNumber) {
      owner = newOwner;
      repo = newRepo;
      number = newNumber;
      // Reset UI for new PR
      if (panelEl) {
        panelEl.remove();
        panelEl = null;
      }
      if (fabEl) {
        fabEl.remove();
        fabEl = null;
      }
      init();
    } else if (!fabEl) {
      init();
    }
  }

  function init() {
    injectFab();
  }

  // Check URL on load and when it changes
  checkUrlAndInit();

  // Watch for URL changes in GitHub SPA
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      checkUrlAndInit();
    }
  }).observe(document.body, { subtree: true, childList: true });

  // Also listen to popstate events (back/forward buttons)
  window.addEventListener('popstate', checkUrlAndInit);

  function injectFab() {
    fabEl = document.createElement("button");
    fabEl.id = "ai-pr-reviewer-fab";
    fabEl.innerText = "🤖 Revisar PR con IA";
    fabEl.addEventListener("click", onFabClick);
    document.body.appendChild(fabEl);
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement("div");
    panelEl.id = "ai-pr-reviewer-panel";
    panelEl.innerHTML = `
      <div class="aipr-header">
        <span class="aipr-title">🤖 AI PR Reviewer</span>
        <button class="aipr-close" title="Cerrar">✕</button>
      </div>
      <div class="aipr-body">
        <div class="aipr-status">Listo para revisar.</div>
        <div class="aipr-content"></div>
      </div>
    `;
    document.body.appendChild(panelEl);
    panelEl.querySelector(".aipr-close").addEventListener("click", () => {
      panelEl.classList.remove("aipr-open");
    });
    return panelEl;
  }

  function setStatus(text, isError) {
    const panel = ensurePanel();
    const statusEl = panel.querySelector(".aipr-status");
    statusEl.innerText = text;
    statusEl.className = "aipr-status" + (isError ? " aipr-error" : "");
  }

  function setContentHtml(html) {
    const panel = ensurePanel();
    panel.querySelector(".aipr-content").innerHTML = html;
  }

  async function onFabClick() {
    const panel = ensurePanel();
    panel.classList.add("aipr-open");
    fabEl.disabled = true;
    setStatus("Obteniendo diff del Pull Request...");
    setContentHtml("");

    try {
      const [diffRes, metaRes] = await Promise.all([
        sendMessage({ type: "FETCH_PR_DIFF", owner, repo, number }),
        sendMessage({ type: "FETCH_PR_META", owner, repo, number })
      ]);
      if (diffRes.error) throw new Error(diffRes.error);
      if (metaRes.error) throw new Error(metaRes.error);

      const files = parseDiff(diffRes.diff);
      if (files.length === 0) {
        setStatus("No se encontraron archivos modificados en el diff.", true);
        return;
      }
      lastDiffFiles = files;
      window.__aiprHeadSha = metaRes.headSha;

      setStatus(`Analizando ${files.length} archivo(s) con IA...`);

      const reviewRes = await sendMessage({
        type: "REVIEW_DIFF",
        payload: {
          prTitle: metaRes.title,
          prBody: metaRes.body,
          files
        }
      });
      if (reviewRes.error) throw new Error(reviewRes.error);

      lastReview = reviewRes.result;
      renderReview(lastReview);
      setStatus(`Revisión completa · Riesgo general: ${lastReview.overallRisk || "N/A"}`);
    } catch (err) {
      setStatus("Error: " + (err.message || String(err)), true);
    } finally {
      fabEl.disabled = false;
    }
  }

  function renderReview(review) {
    const filesHtml = (review.files || []).map(f => {
      const issuesHtml = (f.issues || []).length
        ? f.issues.map(iss => `
            <div class="aipr-issue aipr-sev-${escapeAttr(iss.severity)}">
              <span class="aipr-badge">${escapeHtml(iss.severity)}</span>
              <span class="aipr-line">línea ${escapeHtml(String(iss.line))}</span>
              <p>${escapeHtml(iss.comment)}</p>
            </div>
          `).join("")
        : `<div class="aipr-noissues">Sin observaciones relevantes.</div>`;

      return `
        <div class="aipr-file" data-filename="${escapeAttr(f.filename)}">
          <div class="aipr-file-header">
            <span class="aipr-file-name">${escapeHtml(f.filename)}</span>
            <button class="aipr-export-btn" data-filename="${escapeAttr(f.filename)}">⬇ Exportar archivo corregido</button>
          </div>
          <div class="aipr-issues">${issuesHtml}</div>
        </div>
      `;
    }).join("");

    setContentHtml(`
      <div class="aipr-summary">${escapeHtml(review.summary || "")}</div>
      ${filesHtml}
    `);

    panelEl.querySelectorAll(".aipr-export-btn").forEach(btn => {
      btn.addEventListener("click", () => onExportClick(btn.dataset.filename));
    });
  }

  async function onExportClick(filename) {
    const btn = panelEl.querySelector(`.aipr-export-btn[data-filename="${cssEscape(filename)}"]`);
    const originalLabel = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Generando...";

    try {
      const fileEntry = lastDiffFiles.find(f => f.filename === filename);
      const reviewEntry = (lastReview.files || []).find(f => f.filename === filename);
      const ref = window.__aiprHeadSha;

      const contentRes = await sendMessage({
        type: "FETCH_FILE_CONTENT",
        owner,
        repo,
        ref,
        path: filename
      });
      if (contentRes.error) throw new Error(contentRes.error);

      const genRes = await sendMessage({
        type: "GENERATE_FULL_FILE",
        payload: {
          filename,
          originalContent: contentRes.content,
          diff: fileEntry ? fileEntry.patch : "",
          reviewComments: reviewEntry ? reviewEntry.issues : []
        }
      });
      if (genRes.error) throw new Error(genRes.error);

      downloadTextFile(filename, genRes.content);
      btn.innerText = "✔ Descargado";
    } catch (err) {
      btn.innerText = "Error";
      alert("No se pudo generar el archivo: " + (err.message || String(err)));
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerText = originalLabel;
      }, 2000);
    }
  }

  function downloadTextFile(filename, content) {
    const flatName = filename.replace(/[\\/]/g, "__");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = flatName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function parseDiff(diffText) {
    const files = [];
    const chunks = diffText.split(/^diff --git /m).slice(1);
    for (const chunk of chunks) {
      const fullChunk = "diff --git " + chunk;
      const headerLine = chunk.split("\n")[0]; // a/path b/path
      const match = headerLine.match(/a\/(.+?) b\/(.+)$/);
      const filename = match ? match[2] : headerLine.trim();
      if (/^Binary files /m.test(chunk)) continue;
      files.push({ filename, patch: fullChunk.trim() });
    }
    return files;
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }
  function cssEscape(str) {
    return String(str).replace(/["\\]/g, "\\$&");
  }
})();
