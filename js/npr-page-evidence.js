// npr-page-evidence.js ---------------------------------------------------
import { CARDS } from "./npr-data.js";
import { h, clear, evidenceCardEl } from "./npr-render.js";

const mount = document.getElementById("npr-evidence-out");
if (mount) {
  const search = h("input", { id: "npr-ev-q", type: "search", placeholder: "Search: hyponatremia, DCI, EVD…" });
  const unver = h("label", { class: "npr-check" },
    h("input", { id: "npr-ev-unver", type: "checkbox" }), h("span", {}, "Unverified only"));
  const list = h("div", {});
  const tokenize = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 3);

  function render() {
    const q = tokenize(search.value);
    const unverOnly = document.getElementById("npr-ev-unver").checked;
    let cards = CARDS.filter((c) => !unverOnly || !c.verified);
    if (q.length) {
      cards = cards
        .map((c) => {
          const terms = tokenize([c.topic, c.claim, c.number || "", c.source, c.caveats].join(" "));
          const score = q.filter((t) => terms.includes(t)).length;
          return { c, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.c);
    }
    clear(list);
    if (!cards.length) { list.appendChild(h("p", { class: "npr-muted" }, "No cards match.")); return; }
    cards.forEach((c) => list.appendChild(evidenceCardEl(c)));
  }

  search.addEventListener("input", render);
  unver.querySelector("input").addEventListener("change", render);
  mount.appendChild(h("div", { class: "npr-ev-controls" }, search, unver));
  mount.appendChild(h("p", { class: "npr-muted npr-sm" },
    `${CARDS.length} cards. All DRAFT until reviewed — see the Sources page.`));
  mount.appendChild(list);
  render();
}
