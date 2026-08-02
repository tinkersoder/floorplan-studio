import { HaState } from '../model/entities';
import { Marker, Room, StateRule } from '../model/schema';

// Turn a state value + a StateRule into an effective color (or null if the rule
// doesn't apply). Shared by markers and rooms, used in PREVIEW mode.

const ON_STATES = new Set(['on', 'open', 'home', 'playing', 'active', 'unlocked']);

export const isOn = (state?: string): boolean =>
  state != null && ON_STATES.has(state.toLowerCase());

function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp01(t)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Evaluate a rule against a state and return a color, or null if not matched. */
export function ruleColor(rule: StateRule, state?: HaState): string | null {
  const raw = state?.state;
  switch (rule.mode) {
    case 'boolean':
      return isOn(raw) ? rule.onColor ?? null : rule.offColor ?? null;
    case 'stringMatch':
      return raw != null && raw === rule.match ? rule.color ?? null : null;
    case 'threshold': {
      const num = parseFloat(raw ?? '');
      if (Number.isNaN(num)) return null;
      const cmp = rule.compare ?? '>=';
      const ref = rule.value ?? rule.threshold ?? 0;
      const hit =
        (cmp === '>' && num > ref) ||
        (cmp === '>=' && num >= ref) ||
        (cmp === '<' && num < ref) ||
        (cmp === '<=' && num <= ref) ||
        (cmp === '==' && num === ref);
      return hit ? rule.color ?? null : null;
    }
    case 'gradient': {
      const num = parseFloat(raw ?? '');
      if (Number.isNaN(num)) return null;
      const min = rule.min ?? 0;
      const max = rule.max ?? 100;
      const t = (num - min) / (max - min || 1);
      return lerpColor(rule.minColor ?? '#2563eb', rule.maxColor ?? '#dc2626', t);
    }
    default:
      return null;
  }
}

/** First matching rule's animation, if any. */
export function ruleAnimation(
  rules: StateRule[],
  states: Record<string, HaState>,
  fallbackEntity?: string,
): 'pulse' | 'blink' | null {
  for (const r of rules) {
    const eid = r.entityId ?? fallbackEntity;
    const st = eid ? states[eid] : undefined;
    if (ruleColor(r, st) && r.animation && r.animation !== 'none') return r.animation;
  }
  return null;
}

/** Effective marker color for the given source states (preview mode). */
export function markerColor(m: Marker, states: Record<string, HaState>): string {
  for (const r of m.stateRules) {
    const eid = r.entityId ?? m.entities[0];
    const c = ruleColor(r, eid ? states[eid] : undefined);
    if (c) return c;
  }
  return m.style.color;
}

export function markerIcon(m: Marker, states: Record<string, HaState>): string | undefined {
  for (const r of m.stateRules) {
    const eid = r.entityId ?? m.entities[0];
    if (r.icon && ruleColor(r, eid ? states[eid] : undefined)) return r.icon;
  }
  return m.style.icon;
}

/** Effective room fill for the given source states (preview mode). */
export function roomFill(r: Room, states: Record<string, HaState>): string {
  for (const rule of r.stateRules) {
    const eid = rule.entityId;
    const c = ruleColor(rule, eid ? states[eid] : undefined);
    if (c) return c;
  }
  return r.fill;
}

/** Whether a marker should be shown given its visibility condition. */
export function markerVisible(m: Marker, states: Record<string, HaState>): boolean {
  if (!m.visibility?.entityId) return true;
  const st = states[m.visibility.entityId];
  if (!st) return true;
  if (m.visibility.state != null && m.visibility.state !== '')
    return st.state === m.visibility.state;
  return isOn(st.state);
}

/** "21.4 °C" style label from live state + unit. */
export function stateLabel(entityId: string, states: Record<string, HaState>): string {
  const st = states[entityId];
  if (!st) return '—';
  const unit = st.attributes?.unit_of_measurement;
  return unit ? `${st.state} ${unit}` : st.state;
}
