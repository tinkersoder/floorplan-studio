import { useEffect, useMemo, useState } from 'react';
import { activeFloor, useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { downloadBlob } from '../persist/ProjectsModal';
import { ExportOptions } from './svg';
import { buildHaFloorplan } from './haFloorplan';
import { buildPictureElements } from './pictureElements';
import { svgToPngBlob, dataUriToBlob } from './png';

type Target = 'ha-floorplan' | 'picture-elements' | 'svg';
type DeployStatus = 'checking' | 'missing' | 'stale' | 'match' | 'unknown';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const floor = activeFloor(project);
  const [target, setTarget] = useState<Target>('ha-floorplan');
  const [imageMode, setImageMode] = useState<'embed' | 'reference'>('embed');
  // ha-floorplan only: how the card gets the SVG. 'inline' = data URI in the
  // card (nothing to copy); 'file' = /local/floorplan/x.svg you drop in www.
  const [delivery, setDelivery] = useState<'inline' | 'file'>('inline');
  const [copied, setCopied] = useState(false);

  const inline = target === 'ha-floorplan' && delivery === 'inline';
  const baseName = slug(floor.name || project.name);
  const opts: ExportOptions = useMemo(
    () => ({
      // inline delivery is fully self-contained, so it forces embedded background.
      image: inline ? 'embed' : imageMode,
      imageBaseName: baseName,
      localDir: 'floorplan',
      svgDelivery: delivery,
      // tie cache-bust to the content version so /local URLs change only when the
      // floorplan actually changes (HA caches /local for 31 days).
      cacheBust: String(project.updatedAt),
    }),
    [imageMode, baseName, project.updatedAt, delivery, inline],
  );

  const ha = useMemo(() => buildHaFloorplan(project, floor, opts), [project, floor, opts]);
  const pe = useMemo(() => buildPictureElements(project, floor, opts), [project, floor, opts]);

  // Separate-file delivery is a two-step manual deploy (export, then copy into
  // www). Catch the "forgot step two" / "stale copy" case here instead of a
  // silent blank card later — see floorplan-studio export notes.
  const deployUrl = `/local/floorplan/${baseName}.svg`;
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('unknown');
  useEffect(() => {
    if (target !== 'ha-floorplan' || delivery !== 'file') {
      setDeployStatus('unknown');
      return;
    }
    let cancelled = false;
    setDeployStatus('checking');
    (async () => {
      try {
        const res = await fetch(deployUrl, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setDeployStatus('missing');
          return;
        }
        const live = await res.text();
        const [liveHash, exportHash] = await Promise.all([sha256(live), sha256(ha.svg)]);
        if (!cancelled) setDeployStatus(liveHash === exportHash ? 'match' : 'stale');
      } catch {
        if (!cancelled) setDeployStatus('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, delivery, deployUrl, ha.svg]);

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

          {target === 'ha-floorplan' && (
            <>
              <div className="fp-divider" />
              <div className="fp-subtitle">SVG delivery</div>
              <label className="fp-radio">
                <input type="radio" checked={delivery === 'inline'} onChange={() => setDelivery('inline')} />
                <span><strong>Inline in card</strong> (data URI) — <em>no files to copy</em>, paste &amp; go. Default.</span>
              </label>
              <label className="fp-radio">
                <input type="radio" checked={delivery === 'file'} onChange={() => setDelivery('file')} />
                <span><strong>Separate .svg file</strong> — card points at <code>/local/floorplan/{baseName}.svg</code> (copy it into www).</span>
              </label>
              {delivery === 'file' && <DeployBanner status={deployStatus} url={deployUrl} />}
            </>
          )}

          <div className="fp-divider" />
          <div className="fp-subtitle">Background image</div>
          {inline ? (
            <div className="fp-note">Inline delivery embeds the background inside the SVG automatically — nothing to configure.</div>
          ) : (
            <>
              <label className="fp-radio">
                <input type="radio" checked={imageMode === 'embed'} onChange={() => setImageMode('embed')} />
                <span><strong>Embed</strong> (data URI) — self-contained, zero-friction. Default.</span>
              </label>
              <label className="fp-radio">
                <input type="radio" checked={imageMode === 'reference'} onChange={() => setImageMode('reference')} />
                <span><strong>Reference</strong> — emits <code>/local/floorplan/{baseName}.png</code> + the image file.</span>
              </label>
            </>
          )}
          <div className="fp-divider" />
          <div className="fp-subtitle">What to do</div>
          <Steps target={target} imageMode={imageMode} baseName={baseName} inline={inline} />

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
  inline,
}: {
  target: Target;
  imageMode: 'embed' | 'reference';
  baseName: string;
  inline: boolean;
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
  if (inline) {
    return (
      <div className="fp-note">
        <strong>Needs the ha-floorplan HACS card. No files to copy.</strong>
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong>Copy YAML</strong> (the whole floorplan is inside it).</li>
          <li>Dashboard → <em>Edit → Add card → Manual</em> → paste → Save.</li>
        </ol>
        <div style={{ marginTop: 4 }}>The SVG rides along as a data URI in <code>config.image</code>.</div>
      </div>
    );
  }
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

function DeployBanner({ status, url }: { status: DeployStatus; url: string }) {
  if (status === 'unknown' || status === 'checking') {
    return <div className="fp-note">Checking live file at <code>{url}</code>…</div>;
  }
  if (status === 'missing') {
    return (
      <div className="fp-note err">
        <strong>⚠ Not found at <code>{url}</code>.</strong> The dashboard card will render blank until you
        download the files and copy the SVG into <code>/config/www/floorplan/</code>.
      </div>
    );
  }
  if (status === 'stale') {
    return (
      <div className="fp-note err">
        <strong>⚠ Live file differs from this export.</strong> Download files again and copy the fresh{' '}
        <code>{url}</code> over the old one, or the dashboard keeps showing the previous floorplan.
      </div>
    );
  }
  return <div className="fp-note ok">✓ Live file at <code>{url}</code> matches this export.</div>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'floorplan';
