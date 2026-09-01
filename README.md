# Neuro Pattern Recognition — web

Static Quarto site + a Firebase Cloud Function for the AI tutor. Same model as
`evd-toolkit-web`: deploy the site to GitHub Pages with `quarto publish gh-pages`.

**Module 1: aneurysmal SAH.** All clinical content is DRAFT — see `sources.qmd`.

## Layout

```
_quarto.yml            site config (navbar, theme)
styles.css             npr-* component styles
*.qmd                  pages (index, timeline, simulator, critique, evidence, phases, sources, about)
js/
  npr-data.js          phases, domains + salience, timeline matrix, evidence cards, decision rules
  npr-sim-cases.js     two scripted virtual patients
  npr-engine.js        sahState(), dayBrief(), rankDomains()  — the deterministic core
  npr-simulator.js     sim state machine + scoring
  npr-render.js        DOM helpers + shared renderers
  npr-state-panel.js   the patient-state input panel
  npr-page-*.js        per-page wiring
  npr-firebase.js      Firebase init + the tutor callable
functions/
  index.js             callable "tutor" — proxies to the Claude Messages API
  package.json
firebase.json / .firebaserc   Firebase project = evdtoolkit (shared with EVD Toolkit)
```

The engine is a faithful port of the R reference project at
`Documents/abhijitlele/NeuroPatternRecognition` (which has the full design doc and tests).

## Local preview

```
"C:\Program Files\Quarto\bin\quarto.exe" preview
```

The timeline / simulator / evidence pages work with no backend. The Plan-critique
tutor needs the deployed Cloud Function (below).

## Deploy — the site (GitHub Pages)

One-time:

```
cd C:\Users\neuro\Documents\neuro-pattern-recognition-web
git init && git add -A && git commit -m "Initial NPR web scaffold"
"C:\Program Files\GitHub CLI\gh.exe" repo create neuropeds1/neuro-pattern-recognition-web --public --source=. --remote=origin --push
git checkout --orphan gh-pages && git rm -rf . && git commit --allow-empty -m "init gh-pages" && git push origin gh-pages && git checkout main
```

Then, each deploy:

```
"C:\Program Files\Quarto\bin\quarto.exe" publish gh-pages
```

In the repo Settings → Pages, set the source to the `gh-pages` branch. The site lands at
`https://neuropeds1.github.io/neuro-pattern-recognition-web/`.

## Deploy — the tutor function (Firebase, needs Blaze plan)

```
npm install -g firebase-tools
firebase login
cd C:\Users\neuro\Documents\neuro-pattern-recognition-web
firebase use evdtoolkit

# store the Anthropic key in Secret Manager (paste when prompted)
firebase functions:secrets:set ANTHROPIC_API_KEY

cd functions && npm install && cd ..
firebase deploy --only functions:tutor
```

Notes:

- The `evdtoolkit` project must be on the **Blaze** (pay-as-you-go) plan for Cloud Functions.
  The function has a crude global daily call cap (`DAILY_CALL_CAP` in `functions/index.js`) as
  a spend guard; also set a budget alert in the Google Cloud console and a spend limit on the
  Anthropic key.
- Before a real launch, enable **App Check** (reCAPTCHA v3): register the site in the Firebase
  console, fill the site key in `js/npr-firebase.js`, and set `enforceAppCheck: true` in
  `functions/index.js`. Without it, the function URL is callable by anyone.
- The function writes a counter doc to the `NprTutorUsage` collection in the shared
  `evdtoolkit` Firestore. It does not touch any EVD Toolkit collection or Firestore rules.

## Model

`functions/index.js` calls `claude-opus-5` with adaptive thinking, `effort: medium`, and
server-side refusal fallback. Change `MODEL` there if needed.
