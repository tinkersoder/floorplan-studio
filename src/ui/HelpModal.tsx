import { Modal } from './Modal';

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to add your floorplan to a dashboard" onClose={onClose} wide>
      <div className="fp-help">
        <h3>1 · Design</h3>
        <ul>
          <li>Upload a background (button in the right panel, or paste / drag-drop an image).</li>
          <li>Adjust its opacity, scale, position and rotation; lock it when happy.</li>
          <li>Place markers (M), draw rooms (R), trace walls (W). Click an entity in the left panel to drop a marker.</li>
          <li>Select anything to edit style, state rules and actions on the right.</li>
          <li>Toggle <strong>Preview</strong> to see live/demo states drive your colours and labels.</li>
        </ul>

        <h3>2 · Connect Home Assistant (optional)</h3>
        <ul>
          <li>Click the HA button → enter your HA URL + a long-lived token (Profile → Security).</li>
          <li>Use the same scheme (http/https) as this app to avoid mixed-content blocks.</li>
          <li>If blocked by CORS, add this origin to HA's <code>configuration.yaml</code>:
            <pre>{`http:\n  cors_allowed_origins:\n    - ${location.origin}`}</pre>
          </li>
        </ul>

        <h3>3 · Export → ha-floorplan (rooms + rich rules)</h3>
        <ol>
          <li>Install <strong>ha-floorplan</strong> via HACS → Frontend → “floorplan”, then restart HA.</li>
          <li>Export → target <em>ha-floorplan</em>. Leave <em>Embed</em> selected for a self-contained card.</li>
          <li><strong>Copy YAML</strong>. In your dashboard: Edit → Add Card → <em>Manual</em> → paste → Save.</li>
          <li>If you chose <em>Reference</em> instead, also drop the <code>.png</code> and <code>.svg</code> into
            <code> /config/www/floorplan/</code>.</li>
        </ol>

        <h3>3b · Export → Picture Elements (native, no HACS)</h3>
        <ol>
          <li>Export → target <em>Picture Elements</em>. Copy YAML, add as a Manual card.</li>
          <li>Note: polygon rooms aren’t supported here — use ha-floorplan if you need filled rooms.</li>
        </ol>

        <h3>Saving</h3>
        <p>Everything autosaves to this browser (IndexedDB). Use <strong>Projects</strong> to manage,
          export a JSON backup, or import one on another machine.</p>
      </div>
    </Modal>
  );
}
