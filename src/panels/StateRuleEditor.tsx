import { nanoid } from 'nanoid';
import { StateMode, StateRule } from '../model/schema';
import { ColorInput, Field, NumberInput, Select, TextInput } from '../ui/inputs';

/** Reusable editor for a list of state rules (shared by markers and rooms). */
export function StateRuleEditor({
  rules,
  fallbackEntity,
  showAnimation,
  showIcon,
  onChange,
}: {
  rules: StateRule[];
  fallbackEntity?: string;
  showAnimation?: boolean;
  showIcon?: boolean;
  onChange: (next: StateRule[]) => void;
}) {
  function update(id: string, patch: Partial<StateRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([
      ...rules,
      {
        id: nanoid(6),
        mode: 'boolean',
        entityId: fallbackEntity,
        onColor: '#ffc107',
        offColor: '#6b7280',
      },
    ]);
  }

  return (
    <div className="fp-rules">
      {rules.map((r) => (
        <div key={r.id} className="fp-rule">
          <div className="fp-rule-head">
            <Select<StateMode>
              value={r.mode}
              onChange={(mode) => update(r.id, { mode })}
              options={[
                { value: 'boolean', label: 'On / off' },
                { value: 'threshold', label: 'Threshold' },
                { value: 'gradient', label: 'Gradient (heatmap)' },
                { value: 'stringMatch', label: 'State equals' },
              ]}
            />
            <button className="fp-icon-btn" onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
              ✕
            </button>
          </div>
          <Field label="Entity (blank = default)">
            <TextInput
              value={r.entityId ?? ''}
              placeholder={fallbackEntity ?? 'entity_id'}
              onChange={(v) => update(r.id, { entityId: v || undefined })}
            />
          </Field>

          {r.mode === 'boolean' && (
            <div className="fp-row2">
              <Field label="On color">
                <ColorInput value={r.onColor ?? '#ffc107'} onChange={(v) => update(r.id, { onColor: v })} />
              </Field>
              <Field label="Off color">
                <ColorInput value={r.offColor ?? '#6b7280'} onChange={(v) => update(r.id, { offColor: v })} />
              </Field>
            </div>
          )}

          {r.mode === 'threshold' && (
            <div className="fp-row3">
              <Field label="Compare">
                <Select
                  value={r.compare ?? '>='}
                  onChange={(v) => update(r.id, { compare: v as StateRule['compare'] })}
                  options={[
                    { value: '>', label: '>' },
                    { value: '>=', label: '≥' },
                    { value: '<', label: '<' },
                    { value: '<=', label: '≤' },
                    { value: '==', label: '=' },
                  ]}
                />
              </Field>
              <Field label="Value">
                <NumberInput value={r.value ?? 0} onChange={(v) => update(r.id, { value: v })} />
              </Field>
              <Field label="Color">
                <ColorInput value={r.color ?? '#ef4444'} onChange={(v) => update(r.id, { color: v })} />
              </Field>
            </div>
          )}

          {r.mode === 'gradient' && (
            <div className="fp-row2">
              <Field label="Min">
                <NumberInput value={r.min ?? 0} onChange={(v) => update(r.id, { min: v })} />
              </Field>
              <Field label="Max">
                <NumberInput value={r.max ?? 100} onChange={(v) => update(r.id, { max: v })} />
              </Field>
              <Field label="Min color">
                <ColorInput value={r.minColor ?? '#2563eb'} onChange={(v) => update(r.id, { minColor: v })} />
              </Field>
              <Field label="Max color">
                <ColorInput value={r.maxColor ?? '#dc2626'} onChange={(v) => update(r.id, { maxColor: v })} />
              </Field>
            </div>
          )}

          {r.mode === 'stringMatch' && (
            <div className="fp-row2">
              <Field label="State =">
                <TextInput value={r.match ?? ''} onChange={(v) => update(r.id, { match: v })} />
              </Field>
              <Field label="Color">
                <ColorInput value={r.color ?? '#22c55e'} onChange={(v) => update(r.id, { color: v })} />
              </Field>
            </div>
          )}

          {showIcon && (
            <Field label="Icon on match (mdi name)">
              <TextInput value={r.icon ?? ''} onChange={(v) => update(r.id, { icon: v || undefined })} />
            </Field>
          )}
          {showAnimation && (
            <Field label="Animation on match">
              <Select
                value={r.animation ?? 'none'}
                onChange={(v) => update(r.id, { animation: v as StateRule['animation'] })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'pulse', label: 'Pulse' },
                  { value: 'blink', label: 'Blink' },
                ]}
              />
            </Field>
          )}
        </div>
      ))}
      <button className="fp-add" onClick={add}>
        + Add state rule
      </button>
    </div>
  );
}
