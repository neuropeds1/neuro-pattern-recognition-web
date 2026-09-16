// npr-chart.js --------------------------------------------------------------
// Inline SVG trend chart: for the CURRENT patient characteristics, how each
// domain's salience moves across the full day 0-30 course. No chart library —
// a small hand-rolled multi-line chart, consistent with the rest of this
// vanilla-JS app. The point: a domain that is low today but about to spike
// (e.g. DCI at 0.2 today, 0.7 tomorrow) should be visible at a glance so a
// trainee can plan overnight if/thens ahead of it.

import { h } from "./npr-render.js";
import { DOMAINS } from "./npr-data.js";
import { rankDomains } from "./npr-engine.js";

const DAY_MIN = 0;
const DAY_MAX = 30;

// Distinct per-domain colors (not the 5-bucket accent system used elsewhere —
// a multi-line chart needs every series to be visually distinguishable).
const CHART_COLOR = {
  rebleeding: "#c0392b",
  hydrocephalus: "#8e44ad",
  dci: "#e67e22",
  sodium: "#1f6feb",
  cardiopulmonary: "#16a085",
  infection: "#b9770e",
  seizure: "#7f8c8d",
  hematology: "#2ecc71",
  disposition: "#34495e",
};
const chartColor = (d) => CHART_COLOR[d] || "#566573";

// Score for every domain at every day 0..30, with all OTHER inputs held at
// their current values — this is "based on the current patient characteristics".
function computeSeries(state) {
  const domains = Object.keys(DOMAINS);
  const series = Object.fromEntries(domains.map((k) => [k, []]));
  for (let d = DAY_MIN; d <= DAY_MAX; d++) {
    const ranked = rankDomains({ ...state, dayPostIctus: d });
    const byKey = Object.fromEntries(ranked.map((r) => [r.domain, r.score]));
    domains.forEach((k) => series[k].push(byKey[k] ?? 0));
  }
  return series;
}

// Which domains are worth plotting: ranked by their PEAK across the whole
// course (not just today), so a domain that spikes later still shows up.
function pickDomains(series, { max = 7, minPeak = 0.15 } = {}) {
  const peaks = Object.entries(series).map(([domain, arr]) => {
    let peakVal = -Infinity, peakDay = DAY_MIN;
    arr.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakDay = DAY_MIN + i; } });
    return { domain, peakVal, peakDay };
  });
  return peaks.filter((p) => p.peakVal >= minPeak).sort((a, b) => b.peakVal - a.peakVal).slice(0, max);
}

const W = 640, H = 250, ML = 34, MR = 12, MT = 12, MB = 26;
const PW = W - ML - MR, PH = H - MT - MB;
const xAt = (day) => ML + ((day - DAY_MIN) / (DAY_MAX - DAY_MIN)) * PW;
const yAt = (val) => MT + (1 - Math.min(1, Math.max(0, val))) * PH;

function svg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function buildSvg(series, picked, todayDay) {
  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "npr-chart-svg", role: "img",
    "aria-label": "Salience of each dominant risk domain across the day 0 to day 30 course",
  });

  [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
    const y = yAt(v);
    root.appendChild(svg("line", { x1: ML, x2: W - MR, y1: y, y2: y, stroke: "#e2e5ea", "stroke-width": 1 }));
    const t = svg("text", { x: ML - 6, y: y + 3, "text-anchor": "end", "font-size": 9, fill: "#8a94a6" });
    t.textContent = v.toFixed(2);
    root.appendChild(t);
  });

  [0, 7, 14, 21, 28].forEach((d) => {
    const x = xAt(d);
    root.appendChild(svg("line", { x1: x, x2: x, y1: MT, y2: H - MB, stroke: "#eef0f3", "stroke-width": 1 }));
    const t = svg("text", { x, y: H - MB + 14, "text-anchor": "middle", "font-size": 9, fill: "#8a94a6" });
    t.textContent = "d" + d;
    root.appendChild(t);
  });

  if (Number.isFinite(todayDay) && todayDay >= DAY_MIN && todayDay <= DAY_MAX) {
    const x = xAt(todayDay);
    root.appendChild(svg("line", {
      x1: x, x2: x, y1: MT, y2: H - MB, stroke: "#1f6feb", "stroke-width": 1.5, "stroke-dasharray": "4,3",
    }));
    const t = svg("text", { x: x + 4, y: MT + 10, "font-size": 9, fill: "#1f6feb", "font-weight": 700 });
    t.textContent = "today";
    root.appendChild(t);
  }

  picked.forEach(({ domain }) => {
    const arr = series[domain];
    const pts = arr.map((v, i) => `${xAt(DAY_MIN + i)},${yAt(v)}`).join(" ");
    root.appendChild(svg("polyline", {
      points: pts, fill: "none", stroke: chartColor(domain),
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
  });

  return root;
}

export function renderTrendChart(state) {
  const todayDay = state.dayPostIctus;
  const series = computeSeries(state);
  const picked = pickDomains(series);
  if (picked.length === 0) return null;

  const todayIdx = Number.isFinite(todayDay)
    ? Math.min(DAY_MAX, Math.max(DAY_MIN, Math.round(todayDay))) - DAY_MIN
    : null;

  const legendRows = [...picked].sort((a, b) => a.peakDay - b.peakDay).map((p) => {
    const todayVal = todayIdx != null ? series[p.domain][todayIdx] : null;
    const soon = Number.isFinite(todayDay) && p.peakDay > todayDay && (p.peakDay - todayDay) <= 5;
    return h("div", { class: "npr-chart-legend-row" },
      h("span", { class: "npr-chart-dot", style: `background:${chartColor(p.domain)}` }),
      h("span", { class: "npr-strong" }, DOMAINS[p.domain]?.label || p.domain),
      h("span", { class: "npr-muted" },
        todayVal != null ? `today ${todayVal.toFixed(2)} · ` : "",
        `peaks day ${p.peakDay} (${p.peakVal.toFixed(2)})`),
      soon
        ? h("span", { class: "npr-text-danger npr-chart-soon" },
            `↑ peaks in ${p.peakDay - Math.round(todayDay)}d`)
        : null);
  });

  return h("div", { class: "npr-card npr-chart-card" },
    h("div", { class: "npr-card-head" }, "Risk trajectory across the course"),
    h("div", { class: "npr-card-body" },
      h("p", { class: "npr-sm npr-muted npr-chart-caption" },
        "Salience for each domain across the full day 0–30 course, holding today's other inputs fixed. ",
        "Dashed line marks today — use it to see what's about to rise."),
      buildSvg(series, picked, todayDay),
      h("div", { class: "npr-chart-legend" }, legendRows)));
}
