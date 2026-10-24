/**
 * Central logging. Error-level issues are always shown; info/debug only when
 * the user enables debug mode in settings. Keeps console usage in one place.
 */
let debug = false;

export function setDebug(v: boolean): void {
  debug = v;
}

export function isDebug(): boolean {
  return debug;
}

export function log(...args: unknown[]): void {
  if (debug) console.log("eari-sync:", ...args);
}

export function warn(...args: unknown[]): void {
  if (debug) console.warn("eari-sync:", ...args);
}

export function error(...args: unknown[]): void {
  console.error("eari-sync:", ...args);
}
