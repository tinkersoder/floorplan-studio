import { useState } from 'react';
import { CURATED_ICONS, iconPath } from './icons';
import { mdiExists } from './mdiFull';

/**
 * Icon picker over the FULL Material Design Icons set (the same library HA uses).
 * Type any mdi name (e.g. "flash", "printer-3d", "washing-machine") with a live
 * preview, plus a row of common quick-picks.
 */
export function IconPicker({ value, onChange }: { value?: string; onChange: (name: string) => void }) {
  const [text, setText] = useState(value ?? '');
  const known = text ? mdiExists(text) : false;

  return (
    <div className="fp-iconpicker">
      <div className="fp-iconpicker-row">
        <IconSwatch name={known ? text : value} ok={known || !text} />
        <input
          value={text}
          placeholder="mdi name, e.g. flash"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.replace(/^mdi:/, '').trim();
            setText(v);
            if (mdiExists(v)) onChange(v);
          }}
        />
      </div>
      {text && !known && <div className="fp-hint">No icon named “{text}”. Try another (HA uses mdi names).</div>}
      <div className="fp-icon-quick">
        {CURATED_ICONS.map((n) => (
          <button
            key={n}
            className={value === n ? 'active' : ''}
            title={n}
            onClick={() => {
              setText(n);
              onChange(n);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d={iconPath(n)} fill="currentColor" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function IconSwatch({ name, ok }: { name?: string; ok: boolean }) {
  return (
    <span className="fp-icon-swatch" data-ok={ok ? 'y' : 'n'}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path d={iconPath(name)} fill="currentColor" />
      </svg>
    </span>
  );
}
