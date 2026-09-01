// npr-page-critique.js --------------------------------------------------
import { sahState, dayBrief, briefText } from "./npr-engine.js";
import { CARDS } from "./npr-data.js";
import { h, clear, renderBrief } from "./npr-render.js";
import { buildStatePanel, readStatePanel } from "./npr-state-panel.js";
import { callTutor } from "./npr-firebase.js";

// ---- tiny markdown (headings / bold / lists / paragraphs) --------------
function mdToHtml(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(src || "").split(/\r?\n/);
  let html = "", inList = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  for (let line of lines) {
    const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
    const liMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (hMatch) {
      if (inList) { html += "</ul>"; inList = false; }
      const lvl = Math.min(hMatch[1].length + 1, 5);
      html += `<h${lvl}>${inline(hMatch[2])}</h${lvl}>`;
    } else if (liMatch) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(liMatch[1])}</li>`;
    } else if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---- client-side retrieval over the cards -----------------------------
const tokenize = (s) => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 3);
function retrieveCards(query, brief, k = 6) {
  const q = tokenize(query);
  const boost = new Set(brief.evidenceIds);
  return CARDS
    .map((c) => {
      const terms = tokenize([c.topic, c.claim, c.number || "", c.source, c.caveats].join(" "));
      let score = q.filter((t) => terms.includes(t)).length;
      if (boost.has(c.id)) score += 1.5;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}
const cardsBlock = (cards) => cards.map((c) =>
  `[${c.id}] ${c.topic}\n  claim: ${c.claim}${c.number ? `\n  number: ${c.number}` : ""}\n  source: ${c.source}${c.caveats ? `\n  caveat: ${c.caveats}` : ""}${c.verified ? "" : "\n  (UNVERIFIED DRAFT)"}`
).join("\n\n");

// ---- page wiring -----------------------------------------------------
const panelMount = document.getElementById("npr-critique-panel");
const tabsMount = document.getElementById("npr-critique-tabs");
if (panelMount && tabsMount) {
  let state = sahState(readStatePanel());
  buildStatePanel(panelMount, (raw) => { state = sahState(raw); refreshBrief(); });

  // --- tabs
  const planPane = h("div", {});
  const askPane = h("div", { class: "npr-hidden" });
  const briefPane = h("div", { class: "npr-hidden" });
  const tabBtn = (label, pane) => {
    const b = h("button", { class: "npr-tab" }, label);
    b.addEventListener("click", () => {
      [planPane, askPane, briefPane].forEach((p) => p.classList.add("npr-hidden"));
      pane.classList.remove("npr-hidden");
      tabsMount.querySelectorAll(".npr-tab").forEach((t) => t.classList.remove("npr-tab-active"));
      b.classList.add("npr-tab-active");
    });
    return b;
  };
  const bar = h("div", { class: "npr-tabbar" });
  const b1 = tabBtn("Critique my plan", planPane);
  bar.append(b1, tabBtn("Ask the tutor", askPane), tabBtn("Engine brief", briefPane));
  b1.classList.add("npr-tab-active");
  tabsMount.append(bar, planPane, askPane, briefPane);

  // --- plan critique pane
  const planText = h("textarea", { id: "npr-plan", rows: "10",
    placeholder: "Your assessment and plan for today (no identifiers). e.g. Day 6 Fisher 4 SAH s/p coiling. Exam at baseline. Plan: continue nimodipine, hourly neuro checks, TCDs today, keep euvolemic, Na 134 so will fluid restrict, …" });
  const critiqueBtn = h("button", { class: "npr-btn npr-btn-primary" }, "Get critique");
  const critiqueOut = h("div", {});
  planPane.append(
    h("p", { class: "npr-muted npr-sm" }, tutorStatusText()),
    planText, critiqueBtn, critiqueOut);

  critiqueBtn.addEventListener("click", async () => {
    const txt = planText.value.trim();
    if (!txt) { critiqueOut.innerHTML = "<p class='npr-muted'>Type your plan first.</p>"; return; }
    const brief = dayBrief(state);
    const cards = retrieveCards(txt, brief);
    setBusy(critiqueBtn, critiqueOut, "Tutor is reviewing your plan…");
    try {
      const r = await callTutor({
        mode: "critique",
        stateText: JSON.stringify(state),
        briefText: briefText(brief),
        cardsText: cardsBlock(cards),
        learnerText: txt,
      });
      renderResponse(critiqueOut, r);
    } catch (e) { renderError(critiqueOut, e); }
    critiqueBtn.disabled = false;
  });

  // --- ask pane
  const qInput = h("input", { id: "npr-q", type: "text",
    placeholder: "e.g. Why not just fluid-restrict this Na of 133?" });
  const askBtn = h("button", { class: "npr-btn npr-btn-primary" }, "Ask");
  const askOut = h("div", {});
  const history = [];
  askPane.append(h("p", { class: "npr-muted npr-sm" }, tutorStatusText()), qInput, askBtn, askOut);

  askBtn.addEventListener("click", async () => {
    const q = qInput.value.trim();
    if (!q) return;
    const brief = dayBrief(state);
    const cards = retrieveCards(q, brief);
    setBusy(askBtn, askOut, "Tutor is thinking…", true);
    try {
      const r = await callTutor({
        mode: "ask",
        stateText: JSON.stringify(state),
        briefText: briefText(brief),
        cardsText: cardsBlock(cards),
        question: q,
        history,
      });
      history.push({ role: "user", content: q }, { role: "assistant", content: r.text });
      qInput.value = "";
      renderChat(askOut, history);
    } catch (e) { renderError(askOut, e); }
    askBtn.disabled = false;
  });

  // --- brief pane
  function refreshBrief() {
    clear(briefPane);
    briefPane.appendChild(renderBrief(dayBrief(state)));
  }
  refreshBrief();

  function renderResponse(mount, r) {
    clear(mount);
    mount.appendChild(h("div", { class: "npr-card" },
      h("div", { class: "npr-card-head" }, "Tutor critique",
        h("span", { class: "npr-muted npr-sm" }, "  " + (r.model || ""))),
      h("div", { class: "npr-card-body", html: mdToHtml(r.text) })));
  }
  function renderChat(mount, hist) {
    clear(mount);
    hist.forEach((m) => mount.appendChild(h("div", { class: `npr-turn npr-turn-${m.role}` },
      h("div", { class: "npr-sm npr-strong npr-muted" }, m.role === "user" ? "You" : "Tutor"),
      h("div", { html: m.role === "user" ? escapeHtml(m.content) : mdToHtml(m.content) }))));
  }
  function renderError(mount, e) {
    clear(mount);
    mount.appendChild(h("div", { class: "npr-alert npr-alert-danger" },
      h("div", { class: "npr-strong" }, "Tutor unavailable"),
      h("div", { class: "npr-sm" }, String(e && e.message || e)),
      h("div", { class: "npr-sm" }, "The Engine brief tab still works — it needs no server.")));
  }
}

function tutorStatusText() {
  return "The tutor runs a guard-railed Claude model server-side, fed the deterministic engine brief as ground truth. It teaches; it does not issue orders.";
}
function setBusy(btn, mount, msg, keep = false) {
  btn.disabled = true;
  if (!keep) mount.innerHTML = "";
  mount.insertAdjacentHTML("afterbegin", `<p class="npr-muted npr-busy">${msg}</p>`);
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
