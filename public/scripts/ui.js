export const $ = sel => document.querySelector(sel);
export const on = (el, evt, fn) => el.addEventListener(evt, fn, { passive: false });
