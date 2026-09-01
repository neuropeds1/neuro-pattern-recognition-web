// npr-data.js ---------------------------------------------------------------
// Clinical knowledge model for the SAH module, ported from the R reference
// project (Documents/abhijitlele/NeuroPatternRecognition). All content is DRAFT
// until verified — see sources.qmd. Every evidence card carries verified:false.

// ---- small helpers -------------------------------------------------------

export const clamp = (x, lo = 0, hi = 1) => Math.min(Math.max(x, lo), hi);

// skew-bell salience curve on day post-ictus
export function dayBell(day, start, peakLo, peakHi, end) {
  if (day == null || Number.isNaN(day)) return 0;
  if (day <= start || day >= end) return 0;
  if (day < peakLo) return clamp((day - start) / (peakLo - start));
  if (day <= peakHi) return 1;
  return clamp((end - day) / (end - peakHi));
}

const finite = (x) => typeof x === "number" && Number.isFinite(x);

// ---- phases -------------------------------------------------------------

export const PHASES = [
  { id: "hyperacute", label: "Hyperacute / pre-securing", dayStart: 0, dayEnd: 1,
    summary: "The aneurysm is not yet secured. Everything is organized around preventing rebleeding, treating acute hydrocephalus, and recognizing cardiopulmonary stunning while the patient goes to the angio suite or OR.",
    curveNote: "Rebleeding risk is at its lifetime peak. Secure the aneurysm." },
  { id: "early_post_secure", label: "Early post-securing", dayStart: 1, dayEnd: 4,
    summary: "Aneurysm secured. Blood-pressure goals liberalize, the target becomes euvolemia (not prophylactic hypervolemia), sodium starts to drift, and the daily DCI-surveillance cadence (exam q1h, TCD, imaging plan) is established.",
    curveNote: "Quiet window before the DCI door opens. Set up surveillance now." },
  { id: "dci_window", label: "DCI window", dayStart: 4, dayEnd: 14,
    summary: "Delayed cerebral ischemia is the dominant threat: detect it (exam, TCD, perfusion imaging, cEEG/PbtO2 in the unexaminable patient), treat it (induced hypertension first, endovascular rescue if refractory). Sodium nadir and fever peak fall in this window too.",
    curveNote: "Peak DCI risk ~day 6–9. New deficit = DCI until proven otherwise." },
  { id: "resolution", label: "Resolution", dayStart: 10, dayEnd: 21,
    summary: "Vasospasm risk recedes (later in thick-clot / poor-grade patients). Nimodipine finishes at day 21. EVD weaning begins; a failed wean means a shunt. Mobilization and rehab planning start.",
    curveNote: "Shift from 'prevent ischemia' to 'wean support, assess for shunt'." },
  { id: "recovery", label: "Recovery / pre-discharge", dayStart: 14, dayEnd: 60,
    summary: "Shunt if the wean failed. Taper any AED. Name the cognitive and mood sequelae explicitly — they are common even after good motor recovery. Arrange follow-up vascular imaging and counsel on secondary prevention.",
    curveNote: "Motor recovery can mask cognitive/executive and mood morbidity." },
];

export function phaseForDay(day) {
  let hit = null;
  for (const p of PHASES) {
    if (finite(day) && day >= p.dayStart && day <= p.dayEnd) hit = p;
  }
  return hit || PHASES[PHASES.length - 1];
}

// ---- domain salience --------------------------------------------------

const mfisherFactor = (mf) => {
  if (!finite(mf)) return 0.6;
  return [0.15, 0.3, 0.5, 0.85, 1.0][clamp(Math.round(mf), 0, 4)];
};

const gradeBump = (s) => {
  const gg = [s.wfns, s.huntHess].filter(finite);
  if (gg.length === 0) return 0;
  return [0, 0, 0.03, 0.08, 0.15, 0.2][clamp(Math.round(Math.max(...gg)), 1, 5)];
};

export const DOMAINS = {
  rebleeding: {
    label: "Rebleeding",
    salience(s) {
      if (s.secured) return { score: 0.02, rationale: "Aneurysm secured — rerupture risk now minimal." };
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const score = d <= 1 ? 0.97 : clamp(0.9 - 0.08 * (d - 1));
      return { score, rationale:
        `Aneurysm NOT secured on day ${finite(s.dayPostIctus) ? d : "?"}. Rerupture risk is highest in the first 24 h and carries high mortality — this dominates management until it is secured.` };
    },
  },
  hydrocephalus: {
    label: "Hydrocephalus / EVD / ICP",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const acute = dayBell(d, -1, 0, 2, 6);
      const wean = s.evd && d >= 10 ? 0.6 : 0;
      const score = clamp(Math.max(acute, wean) + gradeBump(s));
      const why = wean > acute
        ? "EVD in place past day 10 — expect a wean trial; failed wean predicts shunt."
        : "Early window for acute obstructive hydrocephalus from IVH / clot.";
      return { score, rationale: why };
    },
  },
  dci: {
    label: "DCI / vasospasm",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const base = dayBell(d, 3, 6, 9, 21);
      const score = clamp(base * mfisherFactor(s.mfisher) + (s.ivh ? 0.1 : 0) + gradeBump(s));
      const phaseTxt = d < 3 ? "before the DCI window opens (day ~4)"
        : d <= 9 ? "in the peak DCI window (day ~6–9)"
        : d <= 14 ? "in the late DCI window (tapering)"
        : "past the usual DCI window (later if thick clot / poor grade)";
      return { score, rationale:
        `Day ${d} — ${phaseTxt}. Modified Fisher ${finite(s.mfisher) ? s.mfisher : "?"}${s.ivh ? " with IVH" : ""}. Any new focal deficit or drop in exam is DCI until proven otherwise.` };
    },
  },
  sodium: {
    label: "Sodium / volume status",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const base = dayBell(d, 1, 4, 10, 16);
      const na = s.na;
      const naBump = !finite(na) ? 0 : na < 130 ? 0.5 : na < 135 ? 0.3 : 0;
      return { score: clamp(base + naBump), rationale:
        `Hyponatremia (CSW or SIADH) typically emerges day 2–10${finite(na) ? `; current Na ${na}` : ""}. Assess volume status before acting — do NOT fluid-restrict a hypovolemic patient in the DCI window.` };
    },
  },
  cardiopulmonary: {
    label: "Cardiopulmonary",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      return { score: clamp(dayBell(d, -1, 0, 2, 5) + gradeBump(s) * 0.5), rationale:
        "Neurogenic stunned myocardium / neurogenic pulmonary edema cluster in the first 72 h, more so with higher grade. Usually reversible." };
    },
  },
  infection: {
    label: "Fever / infection",
    salience(s) {
      let d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      let evdD = s.evdDays;
      if (!finite(evdD)) evdD = s.evd ? d : 0;
      return { score: clamp(0.15 + 0.03 * d + 0.03 * evdD), rationale:
        `Fever burden rises with hospital day${evdD > 0 ? ` and EVD duration (~${evdD} d)` : ""}. Central fever is a diagnosis of exclusion; include ventriculitis once the EVD has been in > 5 days.` };
    },
  },
  seizure: {
    label: "Seizure / cEEG",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const early = dayBell(d, -1, 0, 2, 5);
      const poor = gradeBump(s) * 2;
      return { score: clamp(Math.max(early * 0.6, poor)), rationale:
        "Onset seizures cluster at ictus. In a poor-grade patient whose exam is worse than the imaging explains, think nonconvulsive seizure — low threshold for continuous EEG." };
    },
  },
  hematology: {
    label: "Anemia / VTE prophylaxis",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      const hgb = s.hgb;
      const inDci = dayBell(d, 3, 6, 9, 16) > 0;
      const anemiaBump = !finite(hgb) ? 0 : hgb < 8 ? 0.5 : hgb < 9 ? 0.3 : 0;
      const vte = s.secured && finite(s.dayPostSecure) && s.dayPostSecure >= 0 && s.dayPostSecure <= 3 ? 0.35 : 0.15;
      return { score: clamp(anemiaBump + vte + (inDci ? 0.15 : 0)), rationale:
        `Transfusion threshold runs higher than the usual ICU trigger while DCI risk is active${finite(hgb) ? ` (current Hgb ${hgb})` : ""}. Pharmacologic VTE prophylaxis usually starts a set interval after the aneurysm is secured — confirm it is actually running.` };
    },
  },
  disposition: {
    label: "Cognition / mood / disposition",
    salience(s) {
      const d = finite(s.dayPostIctus) ? s.dayPostIctus : 0;
      return { score: clamp(0.1 + dayBell(d, 8, 16, 30, 60)), rationale:
        "As the acute threats settle, screen for the cognitive, executive and mood morbidity that persists after good motor recovery, and start rehab / family planning." };
    },
  },
};

// ---- timeline (time x system matrix) --------------------------------

const tl = (domain, dayStart, dayEnd, anticipate, o = {}) => ({
  domain, dayStart, dayEnd, anticipate,
  assess: o.assess || [], thresholds: o.thresholds || [],
  pearls: o.pearls || [], redFlags: o.redFlags || [],
  evidence: o.evidence || [], requires: o.requires || null,
});

export const TIMELINE = [
  tl("rebleeding", 0, 3,
    "Until the aneurysm is secured, rerupture is the single biggest threat.", {
    assess: ["Aneurysm secured yet? clip vs coil, planned time",
      "Current SBP and the agent controlling it",
      "Pain / agitation / straining (Valsalva) control",
      "Coagulation status; reverse any anticoagulant / antiplatelet"],
    thresholds: ["Keep SBP controlled with a titratable agent (commonly < ~160)",
      "Secure the aneurysm as early as feasible (within 24–72 h)"],
    pearls: ["A calm, normotensive, pain-controlled patient IS rebleeding prevention",
      "Short-course antifibrinolytics before securing are NOT recommended (ULTRA)"],
    redFlags: ["Sudden severe headache, new neuro deficit, acute hypertension + bradycardia",
      "Acute LOC drop -> emergent CT, likely rebleed or acute hydrocephalus"],
    evidence: ["REBLEED-01", "REBLEED-02", "BP-01", "ANTIFIB-01"],
    requires: (s) => !s.secured }),

  tl("hydrocephalus", 0, 3,
    "Acute obstructive hydrocephalus from IVH / clot presents early with a depressed exam.", {
    assess: ["Level of arousal vs baseline; upgaze; pupils",
      "Ventricular size on the last CT",
      "If EVD: ICP, waveform, drainage volume/hour, level (cm H2O)"],
    thresholds: ["EVD for depressed LOC or radiographic hydrocephalus",
      "Before the aneurysm is secured, avoid aggressive CSF drainage"],
    pearls: ["A patient who 'woke up' after EVD placement had hydrocephalus, not a bad brain",
      "Over-drainage pre-securing can raise transmural pressure and rebleed risk"],
    redFlags: ["Rising ICP, new anisocoria, Cushing response"],
    evidence: ["HCP-01", "HCP-02"] }),

  tl("hydrocephalus", 10, 21,
    "The EVD wean: raise the level or clamp, then watch exam / ICP / ventricular size.", {
    assess: ["Days of EVD drainage so far",
      "Trial: level raised or clamped? for how long?",
      "Exam and headache during the trial; CT ventricle size after"],
    thresholds: ["Failed wean (symptoms, ICP rise, ventriculomegaly) -> VP shunt",
      "Persistent high-volume drainage at day 10+ predicts shunt dependence"],
    pearls: ["Shunt dependence is common after IVH / poor grade / older age — set expectations with family early"],
    redFlags: ["Headache + vomiting + lethargy after a clamp trial -> unclamp, image"],
    evidence: ["HCP-03", "EVD-01"],
    requires: (s) => s.evd }),

  tl("dci", 2, 4,
    "The quiet pre-DCI window: build the surveillance system before you need it.", {
    assess: ["Baseline TCD obtained?", "Documented hourly neuro exam cadence",
      "Imaging plan agreed (when to get CTA/CTP; is DSA access available)"],
    thresholds: ["Modified Fisher 3–4 and/or IVH = high-risk — surveillance is non-negotiable"],
    pearls: ["Good-grade low-Fisher patients can still spasm — do not drop your guard",
      "Nimodipine reduces poor outcome; it does NOT reduce angiographic vasospasm"],
    evidence: ["DCI-01", "FISHER-01", "NIMO-01", "TCD-01"] }),

  tl("dci", 4, 14,
    "Delayed cerebral ischemia: the defining complication of days 4–14, peak ~6–9.", {
    assess: ["Hourly exam: new focal deficit, aphasia, neglect, drop in GCS >= 2",
      "TCD trend (absolute velocity, day-over-day rise, Lindegaard ratio)",
      "CT perfusion / CTA if exam changes or TCDs jump",
      "If unexaminable: cEEG (alpha-delta ratio), PbtO2, scheduled CTP",
      "MAP, volume status, Hgb, temperature, glucose, Na"],
    thresholds: ["New unexplained deficit -> treat as DCI now: induced hypertension trial",
      "Raise MAP ~15–20% and reassess exam within minutes",
      "Refractory -> DSA for IA vasodilator +/- angioplasty",
      "Keep Hgb above the general ICU trigger while DCI risk is active"],
    pearls: ["Rule out the mimics first: seizure, hydrocephalus, hyponatremia, sedation, fever, infection",
      "'Triple-H' is obsolete — prophylactic hypervolemia and hemodilution are out; euvolemia + induced hypertension is the lever",
      "Do not start induced hypertension in a patient whose aneurysm is not secured"],
    redFlags: ["New hemiparesis / aphasia / declining GCS not explained by a mimic",
      "Failure to respond to a blood-pressure challenge -> escalate to endovascular"],
    evidence: ["DCI-01", "DCI-02", "DCI-03", "DCI-04", "DCI-05", "TCD-01", "MMM-01", "ANEM-01", "DRUG-01"] }),

  tl("sodium", 2, 12,
    "Hyponatremia (cerebral salt wasting or SIADH) emerges here, often day 2–10.", {
    assess: ["Na trend (check q6–12 h if high-risk / already drifting)",
      "Volume status: fluid balance, weight, urine output, CVP/POCUS if available",
      "Urine sodium and urine output to separate CSW (volume down) from SIADH (euvolemic)"],
    thresholds: ["CSW: replace volume — isotonic then hypertonic saline, salt tablets, consider fludrocortisone",
      "SIADH: modest fluid restriction is acceptable ONLY if truly euvolemic and not in the DCI window",
      "Avoid rapid overcorrection (osmotic demyelination risk)"],
    pearls: ["The classic trainee error: fluid-restricting a hypovolemic CSW patient and precipitating DCI",
      "Hyponatremia after SAH is usually a salt-wasting / volume problem, not a free-water problem"],
    redFlags: ["Na falling > 6–8 mmol/L per day, or new seizure / obtundation with low Na"],
    evidence: ["NA-01", "NA-02", "NA-03"] }),

  tl("cardiopulmonary", 0, 4,
    "Neurogenic stunned myocardium and neurogenic pulmonary edema cluster in the first 72 h.", {
    assess: ["Admission EKG (QTc, T-wave, ST), troponin trend",
      "Echo if hemodynamically significant — non-coronary wall-motion pattern / apical ballooning",
      "Oxygenation, chest imaging, volume status"],
    thresholds: ["Support hemodynamics while the myocardium recovers; usually reversible in days–weeks",
      "Do not misattribute a stress cardiomyopathy to ACS and anticoagulate a fresh SAH"],
    pearls: ["A modest troponin bump with a preserved-perfusion echo pattern is expected, not an MI",
      "Avoid over-diuresing neurogenic pulmonary edema into hypovolemia before the DCI window"],
    redFlags: ["Cardiogenic shock, refractory hypoxemia, malignant arrhythmia"],
    evidence: ["CARD-01"] }),

  tl("infection", 2, 21,
    "Fever burden climbs with hospital day and with EVD duration; it worsens DCI.", {
    assess: ["Tmax, trend, and timing relative to procedures / lines",
      "Cultures: blood, urine, respiratory; CSF from the EVD if indicated",
      "Lines / catheters / EVD dwell times",
      "CSF cell count corrected for blood; CSF glucose ratio if ventriculitis suspected"],
    thresholds: ["Treat fever toward normothermia during the DCI window",
      "EVD in > 5 days with a change in CSF or unexplained fever -> evaluate for ventriculitis"],
    pearls: ["Central (neurogenic) fever is a diagnosis of exclusion — work it up before you accept it",
      "A blood-contaminated tap needs the cell-count correction before you call it ventriculitis"],
    redFlags: ["New meningismus, worsening exam with fever, purulent EVD output"],
    evidence: ["EVD-01", "DCI-01"] }),

  tl("seizure", 0, 3,
    "Onset seizures cluster around ictus; the prophylaxis decision is made now.", {
    assess: ["Any witnessed seizure at onset or since", "Current AED, dose, duration planned"],
    thresholds: ["Routine prolonged AED prophylaxis is NOT recommended",
      "If prophylaxis is used, keep it short; avoid phenytoin"],
    pearls: ["Phenytoin is associated with worse cognitive outcome after SAH — choose another agent if one is needed"],
    evidence: ["SEIZ-01"] }),

  tl("seizure", 3, 14,
    "In a poor-grade patient, an exam worse than the imaging explains may be nonconvulsive seizure.", {
    assess: ["Is the exam concordant with the latest imaging?",
      "cEEG if the poor exam is unexplained or fluctuating"],
    thresholds: ["Low threshold for continuous EEG in the unexaminable / fluctuating poor-grade patient"],
    pearls: ["Nonconvulsive status is a DCI mimic — find it before committing to induced hypertension / angiography"],
    redFlags: ["Unexplained persistent coma, subtle rhythmic face/limb twitching, gaze deviation"],
    evidence: ["SEIZ-02", "MMM-01"],
    requires: (s) => { const g = [s.wfns, s.huntHess].filter(finite); return g.length > 0 && Math.max(...g) >= 3; } }),

  tl("hematology", 1, 4,
    "VTE prophylaxis: mechanical from admission, pharmacologic once the aneurysm is secured.", {
    assess: ["Mechanical prophylaxis actually on?",
      "Days since securing; is pharmacologic prophylaxis ordered and running?",
      "Platelets, renal function"],
    thresholds: ["Start pharmacologic VTE prophylaxis a set interval after securing (institutional; often ~24 h post-coil, longer post-clip)"],
    pearls: ["The dropped ball here is pharmacologic prophylaxis being 'held' indefinitely after it was safe to start"],
    evidence: ["VTE-01"] }),

  tl("hematology", 4, 14,
    "Anemia is common; the transfusion threshold runs higher while DCI risk is active.", {
    assess: ["Hgb trend, source of blood loss (phlebotomy, GI, procedural)",
      "Is the patient in the DCI window / actively being augmented?"],
    thresholds: ["Use a higher Hgb trigger than the usual restrictive ICU threshold during the DCI window; individualize"],
    pearls: ["Oxygen delivery to at-risk brain — not a fixed number — drives the transfusion decision here"],
    evidence: ["ANEM-01"] }),

  tl("disposition", 10, 60,
    "As acute threats settle, the morbidity that remains is often cognitive and affective.", {
    assess: ["Formal cognitive screen (attention, memory, executive function)",
      "Screen for depression, anxiety, PTSD, fatigue",
      "PT/OT/SLP engaged; disposition trajectory",
      "Follow-up vascular imaging arranged; secondary-prevention counseling done"],
    thresholds: ["Discontinue / taper AED if used and the patient is seizure-free",
      "Arrange post-coil vascular imaging surveillance per neurosurgery"],
    pearls: ["A patient walking out the door can still have disabling executive dysfunction — name it for the family and the outpatient team",
      "Secondary prevention: smoking cessation, blood-pressure control; screen first-degree relatives per criteria"],
    evidence: ["COG-01", "PREV-01", "FUP-01", "SEIZ-01"] }),
];

export function timelineActive(day, state = {}) {
  return TIMELINE.filter((e) => {
    const inWindow = finite(day) && day >= e.dayStart && day <= e.dayEnd;
    let gateOk = true;
    if (e.requires) { try { gateOk = !!e.requires(state); } catch { gateOk = true; } }
    return inWindow && gateOk;
  });
}

// ---- evidence cards --------------------------------------------------

const card = (id, topic, claim, o = {}) => ({
  id, topic, claim,
  number: o.number || null, strength: o.strength || "guideline",
  source: o.source || "", caveats: o.caveats || "", verified: false,
});

export const CARDS = [
  card("REBLEED-01", "Rebleeding — timing & rate",
    "Before the aneurysm is secured, rerupture risk is highest in the first 24 hours and carries high mortality.",
    { number: "peak first 2–12 h; substantial risk within 24 h", source: "AHA/ASA-2023; Connolly-2012",
      caveats: "Reported early-rebleed rates vary widely by cohort and by how early imaging was done." }),
  card("REBLEED-02", "Rebleeding — securing window",
    "Secure the ruptured aneurysm as early as feasible, generally within 24–72 hours, to reduce rerupture.",
    { number: "within 24–72 h", source: "AHA/ASA-2023" }),
  card("BP-01", "Blood pressure — pre-securing",
    "Control blood pressure with a titratable agent until the aneurysm is secured; a commonly used ceiling is SBP < ~160 mmHg.",
    { number: "SBP < ~160 mmHg (verify exact guideline wording)", source: "AHA/ASA-2023",
      caveats: "Guideline gives a target/range rather than a single hard number; institutions vary (140 vs 160)." }),
  card("BP-02", "Blood pressure — post-securing",
    "After the aneurysm is secured, blood-pressure goals liberalize; avoid hypotension, especially in the DCI window.",
    { source: "AHA/ASA-2023" }),
  card("ANTIFIB-01", "Antifibrinolytics",
    "Routine short-course tranexamic acid before securing is not recommended; the ULTRA trial showed no improvement in clinical outcome.",
    { strength: "RCT + guideline", source: "ULTRA-2021; AHA/ASA-2023" }),
  card("NIMO-01", "Nimodipine",
    "Oral nimodipine 60 mg every 4 hours for 21 days improves neurologic outcome after aneurysmal SAH. It does not reduce angiographic vasospasm.",
    { number: "60 mg PO q4h x 21 days", strength: "RCT + guideline (strong)", source: "BRANT-1989; AHA/ASA-2023" }),
  card("NIMO-02", "Nimodipine — hypotension",
    "If nimodipine causes hypotension, split the dose (30 mg every 2 hours) rather than discontinuing it.",
    { number: "30 mg PO q2h", source: "AHA/ASA-2023" }),
  card("DCI-01", "DCI — incidence & timing",
    "Delayed cerebral ischemia occurs in roughly 20–30% of patients, in a window of days 4–14, with peak risk around days 6–9.",
    { number: "~20–30%; day 4–14; peak ~6–9", source: "Vergouwen-2010; AHA/ASA-2023",
      caveats: "Peak-day range quoted as 6–8 in some sources, 7–10 in others." }),
  card("DCI-02", "DCI — definition",
    "DCI is clinical deterioration (new focal deficit or a drop in consciousness lasting > 1 h) or a new infarct on imaging, not attributable to another cause. It is distinct from angiographic or TCD vasospasm.",
    { source: "Vergouwen-2010" }),
  card("DCI-03", "DCI — first-line treatment",
    "First-line treatment of DCI is a trial of induced hypertension with maintenance of euvolemia; assess the exam for response.",
    { number: "raise MAP ~15–20%, reassess", source: "AHA/ASA-2023; NCS-2011",
      caveats: "Contraindicated if the aneurysm is unsecured; use caution with cardiac stunning." }),
  card("DCI-04", "DCI — 'triple-H' is obsolete",
    "Prophylactic hypervolemia and hemodilution are not recommended. Maintain euvolemia; use induced hypertension for established DCI.",
    { source: "AHA/ASA-2023; NCS-2011" }),
  card("DCI-05", "DCI — endovascular rescue",
    "For DCI refractory to hemodynamic therapy, endovascular treatment (intra-arterial vasodilators, balloon angioplasty for proximal vessels) is reasonable.",
    { source: "AHA/ASA-2023" }),
  card("TCD-01", "Transcranial Doppler",
    "Rising TCD mean flow velocities (and a rapid day-over-day rise) correlate with angiographic vasospasm; the Lindegaard ratio separates vasospasm from hyperemia.",
    { number: "MCA mean velocity commonly flagged > 120 cm/s; severe > 200 or Lindegaard > 6 (verify)", source: "NCS-MMM-2014",
      caveats: "Operator-dependent; a screening/trend tool, not a stand-alone trigger for treatment." }),
  card("MMM-01", "Multimodal monitoring in poor grade",
    "In the patient too poor-grade to examine, use continuous EEG (decreasing alpha-delta ratio), brain-tissue oxygen, and scheduled perfusion imaging to detect DCI.",
    { source: "NCS-MMM-2014" }),
  card("NA-01", "Hyponatremia — frequency & timing",
    "Hyponatremia occurs in roughly 30–50% of patients, typically between days 2 and 10.",
    { number: "~30–50%; day 2–10", source: "NCS-2011; AHA/ASA-2023" }),
  card("NA-02", "Hyponatremia — CSW vs SIADH",
    "Distinguish cerebral salt wasting (hypovolemia, high urine output, natriuresis) from SIADH (euvolemia) by volume status. Do not fluid-restrict a hypovolemic patient.",
    { source: "NCS-2011" }),
  card("NA-03", "Hyponatremia — treatment",
    "Treat CSW with volume repletion using isotonic and hypertonic saline and salt tablets; fludrocortisone can reduce natriuresis. Avoid rapid overcorrection.",
    { source: "NCS-2011; AHA/ASA-2023" }),
  card("CARD-01", "Neurogenic stunned myocardium",
    "Troponin elevation, EKG changes, and regional wall-motion abnormalities in a non-coronary distribution (including apical ballooning) occur in a substantial minority and are usually reversible over days to weeks.",
    { number: "troponin elevated in ~20–35% (verify)", source: "AHA/ASA-2023" }),
  card("SEIZ-01", "Seizure prophylaxis",
    "Routine prolonged anticonvulsant prophylaxis is not recommended. If prophylaxis is used, keep it short. Avoid phenytoin because of an association with worse cognitive outcome.",
    { source: "AHA/ASA-2023" }),
  card("SEIZ-02", "Nonconvulsive seizure in poor grade",
    "In a poor-grade patient with a depressed or fluctuating exam not explained by imaging, obtain continuous EEG to evaluate for nonconvulsive seizure or status.",
    { source: "AHA/ASA-2023; NCS-MMM-2014" }),
  card("HCP-01", "Acute hydrocephalus",
    "Acute hydrocephalus affects roughly 20–30% and is treated with external ventricular drainage for a depressed level of consciousness or radiographic hydrocephalus.",
    { number: "~20–30%", source: "AHA/ASA-2023" }),
  card("HCP-02", "EVD drainage before securing",
    "Use caution with aggressive CSF drainage before the aneurysm is secured because of a theoretical increase in transmural pressure and rerupture risk.",
    { source: "AHA/ASA-2023", caveats: "Clinical significance is debated; do not withhold needed drainage from a deteriorating patient." }),
  card("HCP-03", "Shunt-dependent hydrocephalus",
    "A substantial minority of patients become shunt-dependent; risk is higher with intraventricular hemorrhage, poor clinical grade, and older age.",
    { number: "commonly quoted ~20% (wide range reported)", source: "AHA/ASA-2023",
      caveats: "Published rates range widely (roughly 8–48%) by cohort and definition." }),
  card("EVD-01", "EVD-associated ventriculitis",
    "Infection risk rises with EVD duration. Interpret CSF with a correction for blood contamination (cell index) and check the CSF-to-serum glucose ratio.",
    { source: "NCS-2011" }),
  card("VTE-01", "VTE prophylaxis timing",
    "Mechanical prophylaxis from admission; start pharmacologic prophylaxis a defined interval after the aneurysm is secured.",
    { number: "pharmacologic often ~24 h post-coil; institutional after clip", source: "AHA/ASA-2023",
      caveats: "Exact interval is institutional and depends on the securing method and any procedural bleeding." }),
  card("ANEM-01", "Transfusion threshold during DCI risk",
    "During the period of DCI risk, use a higher hemoglobin transfusion trigger than the usual restrictive ICU threshold; individualize to the patient.",
    { number: "trigger above the general ICU threshold (verify exact number)", source: "NCS-2011; AHA/ASA-2023" }),
  card("FISHER-01", "Modified Fisher scale",
    "The modified Fisher scale (cistern blood thickness and presence of IVH) predicts symptomatic vasospasm; grades 3–4 carry the highest risk.",
    { source: "AHA/ASA-2023" }),
  card("GRADE-01", "WFNS / Hunt-Hess grade",
    "The presenting clinical grade (WFNS or Hunt-Hess) predicts outcome and overall complication burden and anchors prognostic conversations.",
    { source: "AHA/ASA-2023" }),
  card("DRUG-01", "Statins and magnesium",
    "Neither simvastatin nor intravenous magnesium is recommended for DCI prevention; trials were negative.",
    { strength: "RCT", source: "STASH-2014; MASH-2" }),
  card("COG-01", "Cognitive and mood sequelae",
    "Cognitive, executive, and mood morbidity (depression, anxiety, PTSD, fatigue) are common after SAH even when motor recovery is good; screen for them before discharge.",
    { source: "AHA/ASA-2023" }),
  card("PREV-01", "Secondary prevention",
    "Counsel smoking cessation and blood-pressure control. Screen first-degree relatives for aneurysms when familial-risk criteria are met.",
    { source: "AHA/ASA-2023", caveats: "Familial screening criteria should be quoted exactly from the guideline." }),
  card("FUP-01", "Follow-up vascular imaging",
    "Arrange follow-up vascular imaging after coiling to surveil for aneurysm recurrence or coil compaction; timing per neurosurgery.",
    { source: "AHA/ASA-2023" }),
];

const CARD_INDEX = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const cardById = (id) => CARD_INDEX[id] || null;
export const cardsByIds = (ids) => (ids || []).map(cardById).filter(Boolean);

// ---- decision rules -----------------------------------------------

const rule = (domain, trigger, action, evidence = []) => ({ domain, trigger, action, evidence });

export const RULES = [
  rule("rebleeding", "Aneurysm not yet secured",
    "Titratable BP control, pain/stimulation control, reverse anticoagulation, expedite securing; no antifibrinolytic by default.",
    ["REBLEED-02", "BP-01", "ANTIFIB-01"]),
  rule("rebleeding", "Sudden headache + new deficit + acute hypertension in an unsecured patient",
    "Emergent non-contrast CT; treat as rerupture; notify neurosurgery / neuro-IR immediately.", ["REBLEED-01"]),
  rule("hydrocephalus", "Depressed or declining level of consciousness with ventriculomegaly",
    "EVD placement; recheck exam after drainage before attributing deficits to the hemorrhage itself.", ["HCP-01"]),
  rule("hydrocephalus", "EVD still required at day 10+ with high-volume drainage",
    "Structured wean trial; if it fails, plan VP shunt and counsel family about shunt dependence.", ["HCP-03"]),
  rule("dci", "New focal deficit or GCS drop >= 2, mimics excluded",
    "Trial induced hypertension (raise MAP ~15–20%), maintain euvolemia, reassess exam within minutes; DSA if no response.",
    ["DCI-02", "DCI-03", "DCI-05"]),
  rule("dci", "TCD velocities rising rapidly day-over-day",
    "Increase surveillance, correlate with exam, consider CTA/CTP; a number alone does not mandate treatment.", ["TCD-01"]),
  rule("dci", "Poor-grade patient, unexaminable",
    "cEEG (alpha-delta ratio), PbtO2, scheduled CT perfusion for DCI surveillance.", ["MMM-01"]),
  rule("sodium", "Na < 135 and falling",
    "Assess volume status; if hypovolemic (CSW) replete with isotonic/hypertonic saline + salt tabs; do not fluid-restrict.",
    ["NA-02", "NA-03"]),
  rule("cardiopulmonary", "Troponin rise + regional wall-motion abnormality after ictus",
    "Support hemodynamics; recognize neurogenic stunned myocardium; avoid anticoagulating a fresh SAH for a presumed MI.", ["CARD-01"]),
  rule("infection", "Unexplained fever with EVD in place > 5 days",
    "Send CSF (cell index corrected for blood, glucose ratio), blood/urine/respiratory cultures; target normothermia in the DCI window.",
    ["EVD-01"]),
  rule("seizure", "Poor exam out of proportion to imaging",
    "Continuous EEG to exclude nonconvulsive seizure/status before attributing decline to DCI.", ["SEIZ-02"]),
  rule("hematology", "Aneurysm secured, pharmacologic VTE prophylaxis not yet running",
    "Confirm the interval since securing and start pharmacologic prophylaxis per institutional protocol.", ["VTE-01"]),
  rule("disposition", "Approaching discharge",
    "Cognitive + mood screen, taper AED if seizure-free, arrange follow-up vascular imaging, counsel secondary prevention and familial screening.",
    ["COG-01", "PREV-01", "FUP-01", "SEIZ-01"]),
];

export const rulesForDomain = (domain) => RULES.filter((r) => r.domain === domain);
