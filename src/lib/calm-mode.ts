"use client";

import { useSyncExternalStore } from "react";

/**
 * "אני מסוחררת": מתג שמבטל מיידית את כל האנימציות באתר.
 * המצב חי רק בדף הנוכחי (class על <html>) – בכוונה לא נשמר, ובכל כניסה חדשה צריך ללחוץ שוב.
 * CSS נגזר מה-class (ראו globals.css); רכיבי JS עם אנימציה קוראים אותו דרך useCalm().
 */
export const CALM_CLASS = "calm-mode";
const CALM_EVENT = "calm:change";

export function isCalm(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains(CALM_CLASS);
}

export function setCalm(on: boolean) {
  document.documentElement.classList.toggle(CALM_CLASS, on);
  window.dispatchEvent(new Event(CALM_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(CALM_EVENT, cb);
  return () => window.removeEventListener(CALM_EVENT, cb);
}

/** true כשהמצב "אני מסוחררת" פעיל. בשרת ובהידרציה תמיד false. */
export function useCalm(): boolean {
  return useSyncExternalStore(subscribe, isCalm, () => false);
}
