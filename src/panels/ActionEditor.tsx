import { Action, ActionKind } from '../model/schema';
import { Field, Select, TextInput } from '../ui/inputs';

const KINDS: { value: ActionKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'more-info', label: 'More info' },
  { value: 'call-service', label: 'Call service' },
  { value: 'navigate', label: 'Navigate' },
  { value: 'url', label: 'URL' },
];

export function ActionEditor({
  label,
  action,
  onChange,
}: {
  label: string;
  action: Action;
  onChange: (a: Action) => void;
}) {
  return (
    <div className="fp-action">
      <Field label={label}>
        <Select value={action.kind} onChange={(kind) => onChange({ ...action, kind })} options={KINDS} />
      </Field>
      {action.kind === 'call-service' && (
        <>
          <Field label="Service (domain.service)">
            <TextInput
              value={action.service ?? ''}
              placeholder="light.turn_on"
              onChange={(v) => onChange({ ...action, service: v })}
            />
          </Field>
          <Field label="Service data (YAML)">
            <textarea
              rows={3}
              value={action.serviceData ?? ''}
              placeholder={'brightness_pct: 60'}
              onChange={(e) => onChange({ ...action, serviceData: e.target.value })}
            />
          </Field>
        </>
      )}
      {action.kind === 'navigate' && (
        <Field label="Path">
          <TextInput
            value={action.navPath ?? ''}
            placeholder="/lovelace/kitchen"
            onChange={(v) => onChange({ ...action, navPath: v })}
          />
        </Field>
      )}
      {action.kind === 'url' && (
        <Field label="URL">
          <TextInput
            value={action.url ?? ''}
            placeholder="https://…"
            onChange={(v) => onChange({ ...action, url: v })}
          />
        </Field>
      )}
    </div>
  );
}
