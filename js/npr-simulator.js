// npr-simulator.js --------------------------------------------------------
// Virtual-patient state machine + scoring. No network.

import { simCase } from "./npr-sim-cases.js";
import { sahState } from "./npr-engine.js";

export function simNew(caseId) {
  const c = simCase(caseId);
  if (!c) throw new Error("Unknown sim case: " + caseId);
  return { caseId, idx: 0, submitted: {}, branchTaken: null };
}

export function simCurrentDay(sess) {
  const c = simCase(sess.caseId);
  return { idx: sess.idx, day: c.days[sess.idx], case: c };
}

export function simScore(day, selected) {
  const sel = new Set(selected);
  const keyHit = day.keyActions.filter((a) => sel.has(a));
  const keyMiss = day.keyActions.filter((a) => !sel.has(a));
  const badHit = day.contraindicated.filter((a) => sel.has(a));
  const nKey = Math.max(1, day.keyActions.length);
  const raw = (keyHit.length - badHit.length) / nKey;
  const pct = Math.round(100 * Math.min(1, Math.max(0, raw)));
  const grade = pct >= 85 ? "on target" : pct >= 60 ? "mostly there"
    : pct >= 35 ? "gaps" : "review this day";
  return { selected: [...selected], correct: keyHit, missed: keyMiss, harmful: badHit, pct, grade };
}

export function simSubmit(sess, selected) {
  const cd = simCurrentDay(sess);
  const sc = simScore(cd.day, selected);
  const next = { ...sess, submitted: { ...sess.submitted, [sess.idx]: sc } };
  const br = cd.case.branch;
  if (br && br.onDayIndex === sess.idx) {
    next.branchTaken = selected.includes(br.ifSelected);
  }
  return { sess: next, score: sc };
}

export const simCanAdvance = (sess) =>
  sess.submitted[sess.idx] != null && sess.idx < simCase(sess.caseId).days.length - 1;

export const simAdvance = (sess) => ({
  ...sess,
  idx: Math.min(sess.idx + 1, simCase(sess.caseId).days.length - 1),
});

export const simIsLast = (sess) => sess.idx >= simCase(sess.caseId).days.length - 1;

export function simEvolutionText(sess, idx) {
  const c = simCase(sess.caseId);
  const d = c.days[idx];
  let txt = d.evolution;
  const br = c.branch;
  if (br && br.onDayIndex === idx && sess.branchTaken != null) {
    txt += "\n\n▸ " + (sess.branchTaken ? br.thenNote : br.elseNote);
  }
  return txt;
}

// Engine state for the current sim day, so the timeline brief can sit alongside.
export function simStateForDay(sess) {
  const cd = simCurrentDay(sess);
  const base = cd.case.initialState;
  const d = cd.day.dayPostIctus;
  return sahState({
    ...base,
    dayPostIctus: d,
    secured: !!base.secured || d >= 1,
    evdDays: base.evd ? d : NaN,
  });
}

export function simSummary(sess) {
  const scs = Object.values(sess.submitted);
  if (scs.length === 0) return null;
  const pcts = scs.map((s) => s.pct);
  return {
    daysDone: scs.length,
    meanPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    harmfulActions: [...new Set(scs.flatMap((s) => s.harmful))],
    missedKeyActions: [...new Set(scs.flatMap((s) => s.missed))],
  };
}
