const q = (selector) => document.querySelector(selector);
const state = { controller: null };

["signal", "country", "window", "minScore"].forEach((id) => {
  q(`#${id}`).addEventListener("change", load);
});
q("#refresh").addEventListener("click", load);

async function load() {
  state.controller?.abort();
  state.controller = new AbortController();

  const button = q("#refresh");
  const error = q("#error");
  button.disabled = true;
  error.hidden = true;
  q("#status").textContent = "Scanning current public sources";
  q("#list").innerHTML = '<div class="loading">Scanning current public sources…</div>';

  const params = new URLSearchParams({
    window: q("#window").value,
    minScore: q("#minScore").value
  });
  if (q("#signal").value) params.set("signal", q("#signal").value);
  if (q("#country").value) params.set("country", q("#country").value);

  try {
    const response = await fetch(`/api/opportunities?${params}`, {
      cache: "no-store",
      signal: state.controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Live scan failed");

    render(payload.items);
    q("#count").textContent = payload.items.length;
    q("#high").textContent = payload.items.filter((item) => item.score >= 82).length;
    q("#sourceCount").textContent = new Set(payload.items.map((item) => item.domain)).size;
    q("#updated").textContent = new Date(payload.generatedAt).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit"
    });
    q("#status").textContent = `Live · ${payload.items.length} current signals`;
  } catch (err) {
    if (err.name === "AbortError") return;
    error.hidden = false;
    error.textContent = `${err.message} Please retry shortly.`;
    q("#list").innerHTML = '<div class="empty">No live results can be displayed until the source responds.</div>';
    q("#status").textContent = "Temporary source error";
    ["count", "high", "sourceCount", "updated"].forEach((id) => q(`#${id}`).textContent = "—");
  } finally {
    button.disabled = false;
  }
}

function render(items) {
  if (!items.length) {
    q("#list").innerHTML = '<div class="empty">No signals matched these filters in the selected period.</div>';
    return;
  }

  q("#list").innerHTML = items.map((item) => `
    <article class="card">
      <div class="score">${item.score}<span>OPPORTUNITY SCORE</span></div>
      <div>
        <h2><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
        <div class="meta">${escapeHtml(item.domain)} · ${escapeHtml(item.country)} · ${formatDate(item.publishedAt)}</div>
        <div class="chips">
          <span class="chip">${escapeHtml(item.signalLabel)}</span>
          <span class="chip">${escapeHtml(item.country)}</span>
          ${item.sourceLanguage ? `<span class="chip">${escapeHtml(item.sourceLanguage)}</span>` : ""}
        </div>
        <div class="reason"><b>Why surfaced</b><ul>${item.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>
      </div>
      <div class="action">
        <div class="confidence">${escapeHtml(item.confidence)} confidence</div>
        <a class="source-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>
        <div class="suggested"><b>Next check:</b> ${escapeHtml(item.suggestedAction)}</div>
      </div>
    </article>
  `).join("");
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

load();