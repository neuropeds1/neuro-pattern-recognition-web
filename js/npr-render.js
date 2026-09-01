// npr-render.js -----------------------------------------------------------
// Tiny DOM helpers + shared renderers (brief, evidence cards).

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return el;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

const ACCENT = {
  rebleeding: "danger", dci: "danger", hydrocephalus: "warning", sodium: "info",
  cardiopulmonary: "warning", infection: "info", seizure: "warning",
  hematology: "secondary", disposition: "success",
};
const accent = (d) => ACCENT[d] || "secondary";

function salienceBar(score) {
  const pct = Math.round(100 * (Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0));
  const cls = pct >= 60 ? "danger" : pct >= 35 ? "warning" : "secondary";
  return h("div", { class: "npr-bar" },
    h("div", { class: `npr-bar-fill npr-bg-${cls}`, style: `width:${pct}%` }));
}

function bulletCard(title, items) {
  if (!items || items.length === 0) return null;
  return h("div", { class: "npr-card" },
    h("div", { class: "npr-card-head" }, title),
    h("ul", { class: "npr-list" },
      items.map((it) => h("li", {},
        it.domain ? h("span", { class: "npr-chip" }, it.domain) : null,
        " " + (it.text || it)))));
}

export function evidenceCardEl(c, { compact = false } = {}) {
  return h("div", { class: "npr-card npr-evcard" },
    h("div", { class: "npr-card-head npr-evhead" },
      h("span", {}, `[${c.id}] ${c.topic}`),
      h("span", { class: c.verified ? "npr-badge npr-bg-success" : "npr-badge npr-bg-warning" },
        c.verified ? "verified" : "unverified draft")),
    h("div", { class: "npr-card-body" },
      h("p", {}, c.claim),
      c.number ? h("p", { class: "npr-muted npr-sm" }, h("b", {}, "Number: "), c.number) : null,
      !compact ? h("p", { class: "npr-muted npr-sm" }, h("b", {}, "Strength: "), c.strength) : null,
      h("p", { class: "npr-muted npr-sm" }, h("b", {}, "Source: "), c.source),
      c.caveats ? h("p", { class: "npr-muted npr-sm npr-italic" }, h("b", {}, "Caveat: "), c.caveats) : null));
}

export function renderBrief(brief) {
  const b = brief;
  const risksEl = h("div", { class: "npr-card" },
    h("div", { class: "npr-card-head" }, "Dominant risks today"),
    h("div", { class: "npr-card-body" },
      b.risks.map((r) => h("div", { class: "npr-risk" },
        h("div", { class: "npr-risk-row" },
          h("span", { class: `npr-strong npr-text-${accent(r.domain)}` }, r.label),
          h("span", { class: "npr-muted npr-sm" }, r.score.toFixed(2))),
        salienceBar(r.score),
        h("div", { class: "npr-sm" }, r.rationale)))));

  const redFlagsEl = b.redFlags.length
    ? h("div", { class: "npr-card npr-card-danger" },
        h("div", { class: "npr-card-head npr-head-danger" }, "Red flags — escalate"),
        h("ul", { class: "npr-list" },
          b.redFlags.map((f) => h("li", {},
            h("span", { class: "npr-chip" }, f.domain), " " + f.text))))
    : null;

  const rulesEl = b.rules.length
    ? h("div", { class: "npr-card" },
        h("div", { class: "npr-card-head" }, "Decision rules in play"),
        h("ul", { class: "npr-list" },
          b.rules.map((rl) => h("li", {},
            h("b", {}, "If "), rl.trigger, h("b", {}, " → "), rl.action,
            rl.evidence.length ? h("span", { class: "npr-muted npr-sm" }, ` [${rl.evidence.join(", ")}]`) : null))))
    : null;

  const evEl = b.evidenceCards.length
    ? h("details", { class: "npr-details" },
        h("summary", {}, `Evidence (${b.evidenceCards.length} cards)`),
        h("div", {}, b.evidenceCards.map((c) => evidenceCardEl(c, { compact: true }))))
    : null;

  return h("div", {},
    h("div", { class: "npr-alert npr-alert-primary" },
      h("div", { class: "npr-strong" }, b.curveLine),
      h("div", { class: "npr-sm" }, b.phaseSummary)),
    risksEl,
    bulletCard("Anticipate today", b.anticipate),
    bulletCard("Assess today", b.assess),
    bulletCard("Decision thresholds / triggers", b.thresholds),
    bulletCard("Common trainee errors / pearls", b.pearls),
    redFlagsEl,
    rulesEl,
    evEl);
}
