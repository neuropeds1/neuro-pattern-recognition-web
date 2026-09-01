// npr-page-timeline.js ----------------------------------------------------
import { sahState, dayBrief } from "./npr-engine.js";
import { renderBrief, clear } from "./npr-render.js";
import { buildStatePanel } from "./npr-state-panel.js";

const panelMount = document.getElementById("npr-timeline-panel");
const out = document.getElementById("npr-timeline-out");

if (panelMount && out) {
  buildStatePanel(panelMount, (raw) => {
    const brief = dayBrief(sahState(raw));
    clear(out);
    out.appendChild(renderBrief(brief));
  });
}
