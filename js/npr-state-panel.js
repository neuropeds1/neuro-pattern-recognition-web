// npr-state-panel.js ------------------------------------------------------
// The patient-state input panel, shared by the Timeline and Plan-critique pages.

import { h } from "./npr-render.js";

const sel = (id, label, opts, value = "") =>
  h("label", { class: "npr-field" }, h("span", {}, label),
    h("select", { id },
      opts.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [String(o), String(o)];
        return h("option", { value: v, ...(v === value ? { selected: "selected" } : {}) }, t);
      })));

const num = (id, label) =>
  h("label", { class: "npr-field" }, h("span", {}, label),
    h("input", { id, type: "number", step: "any", placeholder: "—" }));

const chk = (id, label, checked) =>
  h("label", { class: "npr-check" },
    h("input", { id, type: "checkbox", ...(checked ? { checked: "checked" } : {}) }),
    h("span", {}, label));

export function buildStatePanel(mount, onChange) {
  const dayOut = h("output", { id: "npr-day-val" }, "6");
  const daySlider = h("input", { id: "npr-day", type: "range", min: "0", max: "30", step: "1", value: "6" });
  daySlider.addEventListener("input", () => { dayOut.textContent = daySlider.value; });

  const panel = h("div", { class: "npr-panel" },
    h("h3", {}, "Patient state"),
    h("label", { class: "npr-field" },
      h("span", {}, "Day post-ictus: ", dayOut), daySlider),
    h("div", { class: "npr-grid2" },
      sel("npr-wfns", "WFNS", [["", "unknown"], "1", "2", "3", "4", "5"]),
      sel("npr-hh", "Hunt-Hess", [["", "unknown"], "1", "2", "3", "4", "5"])),
    sel("npr-mfisher", "Modified Fisher", [["", "unknown"], "0", "1", "2", "3", "4"]),
    chk("npr-ivh", "Intraventricular hemorrhage", false),
    h("div", { class: "npr-grid2" },
      chk("npr-secured", "Aneurysm secured", true),
      sel("npr-method", "Method", [["coil", "coil"], ["clip", "clip"], ["", "unknown"]], "coil")),
    chk("npr-evd", "EVD in place", false),
    h("div", { class: "npr-grid2" }, num("npr-na", "Serum Na"), num("npr-hgb", "Hgb (g/dL)")),
    chk("npr-nimo", "On nimodipine", true),
    num("npr-age", "Age"),
    h("p", { class: "npr-muted npr-sm" },
      "No identifiers. This drives a deterministic model of SAH natural history."));

  mount.appendChild(panel);
  panel.addEventListener("input", () => onChange(readStatePanel()));
  panel.addEventListener("change", () => onChange(readStatePanel()));
  onChange(readStatePanel());
}

export function readStatePanel() {
  const v = (id) => document.getElementById(id)?.value ?? "";
  const b = (id) => !!document.getElementById(id)?.checked;
  return {
    dayPostIctus: v("npr-day"),
    wfns: v("npr-wfns"), huntHess: v("npr-hh"), mfisher: v("npr-mfisher"),
    ivh: b("npr-ivh"),
    secured: b("npr-secured"), secureMethod: v("npr-method") || null,
    evd: b("npr-evd"),
    na: v("npr-na"), hgb: v("npr-hgb"),
    onNimodipine: b("npr-nimo"), age: v("npr-age"),
  };
}
