// Plugin event surface.
//
// Listeners need no registry: plugins `addEventListener` on `window` for the
// documented names in `./types.ts`. Everything dispatched here is a
// CustomEvent with `bubbles` + `composed` so it escapes the card's shadow
// root in HACS mode — external listeners on `document`/`window` always see it.

import {
  ActionEventDetail,
  EVENT_ACTION,
  EVENT_PLUGINS_CHANGED,
  EVENT_PROJECT_IMPORTED,
  PluginsChangedDetail,
  ProjectImportedDetail,
} from './types';

function emit<T>(name: string, detail: T): void {
  if (typeof window === 'undefined') return; // node/test contexts have no DOM
  window.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
}

/** A plugin action was clicked in the editor UI. */
export function emitAction(detail: ActionEventDetail): void {
  emit(EVENT_ACTION, detail);
}

/** A project/fragment was merged or replaced via `floorplanStudio.importProject`. */
export function emitProjectImported(detail: ProjectImportedDetail): void {
  emit(EVENT_PROJECT_IMPORTED, detail);
}

/** The registered plugin set changed (register/unregister). */
export function emitPluginsChanged(detail: PluginsChangedDetail): void {
  emit(EVENT_PLUGINS_CHANGED, detail);
}
