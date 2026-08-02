import { useMemo, useState } from 'react';
import { activeFloor, useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { downloadBlob } from '../persist/ProjectsModal';
import { ExportOptions } from './svg';
import { buildHaFloorplan } from './haFloorplan';
import { buildPictureElements } from './pictureElements';
import { svgToPngBlob, dataUriToBlob } from './png';

type Target = 'ha-floorplan' | 'picture-elements' | 'svg';

export function ExportModal({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const floor = activeFloor(project);
  const [target, setTarget] = useState<Target>('ha-floorplan');
  const [imageMode, setImageMode] = useState<'embed' | 'reference'>('embed');
  const [copied, setCopied] = useState(false);

  const baseName = slug(floor.name || project.name);
  const opts: ExportOptions = useMemo(
    () => ({ image: imageMode, imageBaseName: baseName, localDir: 'floorplan' }),
    [imageMode, baseName],
  );

  const ha = useMemo(() => buildHaFloorplan(project, floor, opts), [project, floor, opts]);
  const pe = useMemo(() => buildPictureElements(project, floor, opts), [project, floor, opts]);

  const yamlText = target === 'picture-elements' ? pe.yaml : target === 'ha-floorplan' ? ha.yaml : ha.svg;

  async function copy() {
    await navigator.clipboard.writeText(yamlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadSvg() {
    downloadBlob(new Blob([ha.svg], { type: 'image/svg+xml' }), `${baseName}.svg`);
  }

  async function downloadPng() {
    // PNG needs an embedded image; force embed for rasterization.
    const embedded = buildHaFloorplan(project, floor, { ...opts, image: 'embed' });
    try {
      const blob = await svgToPngBlob(embedded.svg, floor.canvas.width, floor.canvas.height);
      downloadBlob(blob, `${baseName}.png`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function downloadFiles() {
    if (target === 'svg') return downloadSvg();
    downloadBlob(new Blob([yamlText], { type: 'text/yaml' }), `${baseName}.card.yaml`);
    if (target === 'ha-floorplan') downloadSvg();
    if (imageMode === 'reference' && floor.background.dataUri) {
      downloadBlob(dataUriToBlob(floor.background.dataUri), `${baseName}.png`);
    }
  }

  return (
    <Modal title="Export to Home Assistant" onClose={onClose} wide>
      <div className="fp-export-grid">
        <div className="fp-export-controls">
          <div className="fp-subtitle">Target</div>
          <label className="fp-radio">
            <input type="radio" checked={target === 'ha-floorplan'} onChange={() => setTarget('ha-floorplan')} />
            <span><strong>ha-floorplan</strong> (HACS card) — SVG + card YAML, supports polygon rooms & rich rules.</span>
          </label>
          <label className="fp-radio">
            <input type="radio" checked={target === 'picture-elements'} onChange={() => setTarget('picture-elements')} />
            <span><strong>Picture Elements</strong> (native, no deps) — icons/labels by %. {pe.roomsSkipped > 0 && <em>Rooms not supported.</em>}</span>
          </label>
          <label className="fp-radio">
            <input type="radio" checked={target === 'svg'} onChange={() => setTarget('svg')} />
            <span><strong>Raw SVG</strong> — the floorplan SVG only.</span>
          </label>

          <div className="fp-divider" />
          <div className="fp-subtitle">Background image</div>
          <label className="fp-radio">
            <input type="radio" checked={imageMode === 'embed'} onChange={() => setImageMode('embed')} />
            <span><strong>Embed</strong> (data URI) — self-contained, zero-friction. Default.</span>
          </label>
          <label className="fp-radio">
            <input type="radio" checked={imageMode === 'reference'} onChange={() => setImageMode('reference')} />
            <span><strong>Reference</strong> — emits <code>/local/floorplan/{baseName}.png</code> + the image file.</span>
          </label>
          <div className="fp-divider" />
          <div className="fp-subtitle">What to do</div>
          <Steps target={target} imageMode={imageMode} baseName={baseName} />

          <div className="fp-divider" />
          <div className="fp-modal-actions">
            <button className="fp-primary" onClick={copy}>{copied ? 'Copied!' : 'Copy YAML/SVG'}</button>
            <button onClick={downloadFiles}>Download files</button>
            {target === 'ha-floorplan' && <button onClick={downloadPng}>Download PNG</button>}
          </div>
        </div>

        <div className="fp-export-preview">
          <div className="fp-subtitle">{target === 'svg' ? 'SVG' : 'YAML'}</div>
          <textarea readOnly value={yamlText} spellCheck={false} />
        </div>
      </div>
    </Modal>
  );
}

function Steps({
  target,
  imageMode,
  baseName,
}: {
  target: Target;
  imageMode: 'embed' | 'reference';
  baseName: string;
}) {
  const dir = <code>/config/www/floorplan/</code>;
  if (target === 'picture-elements') {
    return (
      <div className="fp-note">
        {imageMode === 'embed' ? (
          <>
            <strong>Pure copy-paste — no files, no HACS.</strong> Add via your dashboard →
            <em> Edit → Add card → Manual</em>, paste the YAML, Save. The background is inlined.
          </>
        ) : (
          <>
            Copy <code>{baseName}.png</code> into {dir}, then add the YAML as a Manual card.
          </>
        )}
      </div>
    );
  }
  if (target === 'svg') {
    return <div className="fp-note">Raw floorplan SVG only — use “Download files”.</div>;
  }
  // ha-floorplan
  return (
    <div className="fp-note">
      <strong>Needs the ha-floorplan HACS card.</strong>
      <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        <li>
          <strong>Download files</strong> and copy <code>{baseName}.svg</code>
          {imageMode === 'reference' ? <> and <code>{baseName}.png</code></> : null} into {dir}
        </li>
        <li>Dashboard → <em>Edit → Add card → Manual</em> → paste YAML → Save.</li>
      </ol>
      {imageMode === 'embed' && (
        <div style={{ marginTop: 4 }}>Embed mode puts the image inside the SVG, so it’s the only file.</div>
      )}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'floorplan';
