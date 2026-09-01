// functions/index.js -----------------------------------------------------
// Callable Cloud Function that proxies the NPR tutor to the Claude Messages
// API. The Anthropic key lives in a Secret Manager secret and never reaches
// the browser. Firebase Functions v2, Node 20.
//
// Deploy:
//   firebase use evdtoolkit
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase deploy --only functions:tutor
//
// Requires the Blaze (pay-as-you-go) plan on the Firebase project.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// --- config -----------------------------------------------------------
const MODEL = "claude-opus-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_INPUT_CHARS = 8000;        // per free-text field
const DAILY_CALL_CAP = 400;          // crude global spend guard
const MAX_HISTORY_TURNS = 8;

// --- guard rails: the system prompt ---------------------------------
const SYSTEM_PROMPT = [
  "You are a teaching assistant for a physician trainee (resident or fellow) on a",
  "neurocritical care unit rotation. The trainee is caring for a patient with",
  "aneurysmal subarachnoid hemorrhage (aSAH). Your job is to build the trainee's",
  "mental model of the DISEASE'S NATURAL HISTORY — what to anticipate on each day",
  "of the course — and to give formative feedback on their reasoning.",
  "",
  "Rules:",
  "1. Teach the natural history and the WHY behind each decision. Do not issue",
  "   definitive management orders. Frame choices as considerations and always name",
  "   what should be discussed with the fellow or attending and what warrants",
  "   immediate escalation.",
  "2. A deterministic 'engine brief' is provided in the context. Treat its",
  "   statements about timing, phases, salient risks, and thresholds as ground",
  "   truth. Do not contradict it. If you would add nuance, say 'the tool's model",
  "   says X; the reasoning is...'.",
  "3. Stay within aSAH and within the evidence cards provided. If the trainee asks",
  "   something outside that scope or beyond the evidence, say so plainly rather",
  "   than guessing.",
  "4. Cite evidence cards by their bracketed id (e.g. [DCI-03]) when you lean on",
  "   them. Note when a card is marked UNVERIFIED DRAFT.",
  "5. This tool must never receive protected health information. If the trainee's",
  "   text contains names, MRNs, dates of birth, or similar, tell them to remove it",
  "   and do not repeat it back.",
  "6. Be concise and specific. The trainee is pre-rounding; they need signal.",
].join("\n");

// --- helpers --------------------------------------------------------
function clip(s, n = MAX_INPUT_CHARS) {
  return typeof s === "string" ? s.slice(0, n) : "";
}

function buildUserMessage(data) {
  const parts = [
    "PATIENT STATE (JSON):", clip(data.stateText, 2000), "",
    "ENGINE BRIEF (ground truth):", clip(data.briefText, 6000), "",
    "EVIDENCE CARDS (retrieved):", clip(data.cardsText, 6000), "",
  ];
  if (data.mode === "critique") {
    parts.push(
      "THE TRAINEE'S ASSESSMENT AND PLAN FOR TODAY:", clip(data.learnerText), "",
      "Give feedback in exactly these four sections (use the headers verbatim):",
      "### On target",
      "### Anticipatory gaps",
      "(what the natural history predicts for this day that the trainee did not",
      "account for — this is the most important section)",
      "### Reconsider",
      "(anything in the plan that runs against the evidence or the engine brief)",
      "### Discuss with your team",
      "(the specific questions to raise on rounds and anything to escalate now)");
  } else {
    parts.push(
      "THE TRAINEE'S QUESTION:", clip(data.question), "",
      "Answer as a teacher: explain the natural-history reasoning, cite cards, and",
      "end with what to confirm with the team.");
  }
  return parts.join("\n");
}

async function checkDailyCap() {
  const key = new Date().toISOString().slice(0, 10);
  const ref = db.collection("NprTutorUsage").doc(key);
  const snap = await ref.get();
  const count = snap.exists ? snap.data().count || 0 : 0;
  if (count >= DAILY_CALL_CAP) {
    throw new HttpsError("resource-exhausted",
      "The tutor has hit its daily request limit. Try again tomorrow; the engine brief still works.");
  }
  await ref.set({ count: FieldValue.increment(1), updated: FieldValue.serverTimestamp() }, { merge: true });
}

// --- the callable --------------------------------------------------
exports.tutor = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "256MiB",
    // enforceAppCheck: true,   // enable once App Check is configured (npr-firebase.js)
    cors: true,
  },
  async (request) => {
    const data = request.data || {};
    if (data.mode !== "critique" && data.mode !== "ask") {
      throw new HttpsError("invalid-argument", "mode must be 'critique' or 'ask'");
    }
    const learner = data.mode === "critique" ? data.learnerText : data.question;
    if (!learner || !String(learner).trim()) {
      throw new HttpsError("invalid-argument", "Empty submission.");
    }

    await checkDailyCap();

    const messages = [];
    if (Array.isArray(data.history)) {
      for (const m of data.history.slice(-MAX_HISTORY_TURNS)) {
        if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: clip(m.content, 4000) });
        }
      }
    }
    messages.push({ role: "user", content: buildUserMessage(data) });

    const body = {
      model: MODEL,
      max_tokens: data.mode === "critique" ? 2200 : 1600,
      system: SYSTEM_PROMPT,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      fallbacks: "default",
    };

    let resp;
    try {
      resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new HttpsError("unavailable", "Could not reach the model: " + e.message);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new HttpsError("internal", `Model API error ${resp.status}: ${detail.slice(0, 300)}`);
    }

    const parsed = await resp.json();
    const text = (parsed.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim();

    return {
      text: text || "(the model returned no text)",
      model: parsed.model || MODEL,
      stopReason: parsed.stop_reason || null,
    };
  }
);
