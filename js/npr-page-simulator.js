// npr-page-simulator.js -------------------------------------------------
import { SIM_CASES } from "./npr-sim-cases.js";
import {
  simNew, simCurrentDay, simSubmit, simAdvance, simIsLast,
  simEvolutionText, simStateForDay, simSummary,
} from "./npr-simulator.js";
import { dayBrief } from "./npr-engine.js";
import { h, clear, renderBrief } from "./npr-render.js";

const mount = document.getElementById("npr-sim-out");
if (mount) {
  let sess = null;

  const caseSel = h("select", { id: "npr-sim-case" },
    Object.values(SIM_CASES).map((c) => h("option", { value: c.id }, c.label)));
  const startBtn = h("button", { class: "npr-btn npr-btn-primary" }, "Start / restart");
  const controls = h("div", { class: "npr-sim-controls" }, caseSel, startBtn);
  const body = h("div", {});
  mount.appendChild(controls);
  mount.appendChild(body);

  startBtn.addEventListener("click", () => { sess = simNew(caseSel.value); render(); });

  function chips(items, cls) {
    return items.map((t) => h("span", { class: `npr-badge ${cls}` }, t));
  }

  function feedbackEl(sc, day) {
    const alertCls = sc.pct >= 85 ? "npr-alert-success" : sc.pct >= 60 ? "npr-alert-info"
      : sc.pct >= 35 ? "npr-alert-warning" : "npr-alert-danger";
    return h("div", { class: "npr-feedback" },
      h("div", { class: `npr-alert ${alertCls}` },
        h("div", { class: "npr-strong" }, `${sc.pct}% — ${sc.grade}`)),
      sc.correct.length ? h("div", { class: "npr-fb-row" },
        h("div", { class: "npr-sm npr-strong npr-text-success" }, "On target"),
        h("div", {}, chips(sc.correct, "npr-bg-success"))) : null,
      sc.missed.length ? h("div", { class: "npr-fb-row" },
        h("div", { class: "npr-sm npr-strong npr-text-warning" }, "Missed — the anticipatory gap"),
        h("div", {}, chips(sc.missed, "npr-bg-warning"))) : null,
      sc.harmful.length ? h("div", { class: "npr-fb-row" },
        h("div", { class: "npr-sm npr-strong npr-text-danger" }, "Reconsider — runs against the evidence"),
        h("div", {}, chips(sc.harmful, "npr-bg-danger"))) : null,
      h("p", { class: "npr-sm" }, day.teaching));
  }

  function summaryEl(sm) {
    if (!sm) return null;
    return h("div", { class: "npr-card npr-card-primary" },
      h("div", { class: "npr-card-head npr-head-primary" }, "Run complete"),
      h("div", { class: "npr-card-body" },
        h("div", {}, `Mean score across ${sm.daysDone} checkpoints: ${sm.meanPct}%`),
        sm.missedKeyActions.length ? h("div", {},
          h("div", { class: "npr-sm npr-strong" }, "Key actions missed at least once:"),
          h("ul", { class: "npr-list" }, sm.missedKeyActions.map((t) => h("li", {}, t)))) : null,
        sm.harmfulActions.length ? h("div", {},
          h("div", { class: "npr-sm npr-strong npr-text-danger" }, "Harmful actions selected:"),
          h("ul", { class: "npr-list" }, sm.harmfulActions.map((t) => h("li", {}, t)))) : null));
  }

  function render() {
    clear(body);
    if (!sess) { body.appendChild(h("p", { class: "npr-muted" }, "Pick a case and press Start.")); return; }
    const cd = simCurrentDay(sess);
    const day = cd.day;
    const already = sess.submitted[sess.idx];

    body.appendChild(h("div", { class: "npr-card" },
      h("div", { class: "npr-card-head" }, `${cd.case.label} — presentation`),
      h("div", { class: "npr-card-body" }, cd.case.presentation)));

    const boxes = day.options.map((opt, i) =>
      h("label", { class: "npr-check npr-opt" },
        h("input", { type: "checkbox", value: opt, "data-i": i,
          ...(already && already.selected.includes(opt) ? { checked: "checked" } : {}),
          ...(already ? { disabled: "disabled" } : {}) }),
        h("span", {}, opt)));

    const dayCard = h("div", { class: "npr-card" },
      h("div", { class: "npr-card-head" }, `Day ${day.dayPostIctus} post-ictus`),
      h("div", { class: "npr-card-body" },
        h("p", {}, day.vignette),
        h("div", { class: "npr-opts" }, boxes)));
    body.appendChild(dayCard);

    if (!already) {
      const submit = h("button", { class: "npr-btn npr-btn-primary" }, "Submit choices");
      submit.addEventListener("click", () => {
        const selected = [...dayCard.querySelectorAll("input:checked")].map((el) => el.value);
        const r = simSubmit(sess, selected);
        sess = r.sess;
        render();
      });
      dayCard.querySelector(".npr-card-body").appendChild(submit);
    } else {
      const cb = dayCard.querySelector(".npr-card-body");
      cb.appendChild(feedbackEl(already, day));
      cb.appendChild(h("div", { class: "npr-evolution" },
        h("div", { class: "npr-strong" }, "What the natural history did:"),
        h("div", { html: simEvolutionText(sess, sess.idx).replace(/\n/g, "<br>") })));
      if (!simIsLast(sess)) {
        const nextBtn = h("button", { class: "npr-btn npr-btn-success" }, "Advance to next day →");
        nextBtn.addEventListener("click", () => { sess = simAdvance(sess); render(); });
        cb.appendChild(nextBtn);
      } else {
        cb.appendChild(summaryEl(simSummary(sess)));
      }
    }

    const engineState = simStateForDay(sess);
    body.appendChild(h("details", { class: "npr-details" },
      h("summary", {}, "Show the engine's timeline brief for this day"),
      renderBrief(dayBrief(engineState))));
  }

  sess = simNew(caseSel.value);
  render();
}
