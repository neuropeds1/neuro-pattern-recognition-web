// npr-engine.js -----------------------------------------------------------
// Deterministic core. No network. Given a patient state, produce the
// "today on the natural history timeline" brief.

import {
  PHASES, phaseForDay, DOMAINS, TIMELINE, timelineActive,
  cardsByIds, rulesForDomain, clamp,
} from "./npr-data.js";

const finite = (x) => typeof x === "number" && Number.isFinite(x);
const numOrNaN = (x) => {
  if (x === "" || x == null) return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
};

// Canonical state with defaults.
export function sahState(o = {}) {
  const dayPostIctus = numOrNaN(o.dayPostIctus);
  let dayPostSecure = numOrNaN(o.dayPostSecure);
  let evdDays = numOrNaN(o.evdDays);
  const secured = !!o.secured;
  const evd = !!o.evd;
  if (!finite(evdDays) && evd && finite(dayPostIctus)) evdDays = dayPostIctus;
  if (!finite(dayPostSecure) && secured && finite(dayPostIctus)) {
    dayPostSecure = Math.max(0, dayPostIctus - 1);
  }
  return {
    dayPostIctus, dayPostSecure,
    wfns: numOrNaN(o.wfns), huntHess: numOrNaN(o.huntHess), mfisher: numOrNaN(o.mfisher),
    ivh: !!o.ivh, secured, secureMethod: o.secureMethod || null,
    evd, evdDays, na: numOrNaN(o.na), hgb: numOrNaN(o.hgb),
    onNimodipine: o.onNimodipine == null ? null : !!o.onNimodipine,
    age: numOrNaN(o.age),
  };
}

export function rankDomains(state) {
  const rows = Object.entries(DOMAINS).map(([key, d]) => {
    let sal;
    try { sal = d.salience(state); } catch { sal = { score: 0, rationale: "" }; }
    let sc = Number(sal && sal.score);
    if (!Number.isFinite(sc)) sc = 0;
    return { domain: key, label: d.label, score: clamp(sc), rationale: (sal && sal.rationale) || "" };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

const uniq = (arr) => [...new Set(arr.filter((x) => x != null && x !== ""))];

export function dayBrief(state) {
  const day = state.dayPostIctus;
  const phase = phaseForDay(day);
  const ranked = rankDomains(state);
  const active = timelineActive(day, state);

  // gather guidance fields, each item tagged with its domain
  const gather = (field) =>
    active.flatMap((e) => (e[field] || []).map((text) => ({ domain: e.domain, text })));

  const evidenceIds = uniq(active.flatMap((e) => e.evidence || []));

  const curveLine = `Day ${finite(day) ? day : "?"} post-ictus — ${phase.label}. ${phase.curveNote}`;

  // keep top 4 domains plus any with score >= 0.35
  const keep = new Set([
    ...ranked.slice(0, 4).map((r) => r.domain),
    ...ranked.filter((r) => r.score >= 0.35).map((r) => r.domain),
  ]);
  const risks = ranked.filter((r) => keep.has(r.domain));

  const rules = uniq(risks.map((r) => r.domain)).flatMap(rulesForDomain);

  return {
    state, day, phase, curveLine, phaseSummary: phase.summary,
    risks,
    assess: gather("assess"),
    thresholds: gather("thresholds"),
    pearls: gather("pearls"),
    redFlags: gather("redFlags"),
    anticipate: active.map((e) => ({ domain: e.domain, text: e.anticipate })),
    evidenceIds,
    evidenceCards: cardsByIds(evidenceIds),
    rules,
  };
}

// Compact plain-text rendering — the ground-truth block handed to the tutor.
export function briefText(b) {
  const lines = [];
  lines.push(`WHERE ON THE CURVE: ${b.curveLine}`, "");
  lines.push(`PHASE: ${b.phase.label} — ${b.phaseSummary}`, "");
  lines.push("DOMINANT RISKS TODAY (salience 0-1):");
  for (const r of b.risks) lines.push(`  - ${r.label} [${r.score.toFixed(2)}]: ${r.rationale}`);
  lines.push("", "ANTICIPATE TODAY:");
  for (const a of b.anticipate) lines.push(`  - (${a.domain}) ${a.text}`);
  lines.push("", "ASSESS TODAY:");
  for (const a of b.assess) lines.push(`  - ${a.text}`);
  lines.push("", "DECISION THRESHOLDS / TRIGGERS:");
  for (const t of b.thresholds) lines.push(`  - ${t.text}`);
  lines.push("", "COMMON TRAINEE ERRORS / PEARLS:");
  for (const p of b.pearls) lines.push(`  - ${p.text}`);
  lines.push("", "RED FLAGS — ESCALATE:");
  for (const f of b.redFlags) lines.push(`  - ${f.text}`);
  lines.push("", `EVIDENCE CARDS: ${b.evidenceIds.join("; ")}`);
  return lines.join("\n");
}

export { PHASES };
