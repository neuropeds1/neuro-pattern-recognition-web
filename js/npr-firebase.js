// npr-firebase.js --------------------------------------------------------
// Firebase init + the tutor callable. Reuses the EVD Toolkit Firebase project
// (Firestore API keys are not secrets in Firebase's model — access is governed
// by Security Rules and, for the tutor, by the Cloud Function + App Check).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyD1FLnIrd86qOsFPLi5y1q_EIU0lhL5gxc",
  authDomain: "evdtoolkit.firebaseapp.com",
  projectId: "evdtoolkit",
  storageBucket: "evdtoolkit.firebasestorage.app",
  messagingSenderId: "1002374431151",
  appId: "1:1002374431151:web:fe3724bb1f39eb4744af5a",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const functions = getFunctions(app); // default region us-central1

// Optional App Check (recommended before a public launch). Register the site
// for reCAPTCHA v3 in the Firebase console, then uncomment:
//
// import { initializeAppCheck, ReCaptchaV3Provider }
//   from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
// initializeAppCheck(app, {
//   provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"),
//   isTokenAutoRefreshEnabled: true,
// });

const tutorCallable = httpsCallable(functions, "tutor", { timeout: 120000 });

export async function callTutor(payload) {
  const res = await tutorCallable(payload);
  return res.data; // { text, model, stopReason }
}
