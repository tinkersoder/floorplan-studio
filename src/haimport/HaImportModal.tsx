import { useMemo, useRef, useState } from 'react';
import yaml from 'js-yaml';
import { useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { createProject } from '../model/defaults';
import { saveProject } from '../persist/db';
import { liveWsCaller } from '../ha/wsCaller';
import { cardsFromText, cardSummary, FoundCard, parseFloorplanCard, parsePictureElements, shortRef } from './cards';
import { basename, isSvgRef, liveAssetContext, loadText } from './assets';
import { scanDashboards } from './scan';
import { ImportResult, importFloorplanSvg, importPictureElements } from './svgImport';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;
type Target = 'new-project' | 'new-floor';

export function HaImportModal({ onClose }: { onClose: () => void }) {
  useStore((s) => s.conn);
  const call = liveWsCaller();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [cards, setCards] = useState<FoundCard[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [target, setTarget] = useState<Target>('new-project');
  const [stripBound, setStripBound] = useState(true);
  const [stageUnresolved, setStageUnresolved] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const card = cards.find((c) => c.key === picked) ?? null;
  const defaultName = useMemo(() => {
    const last = card?.where.split(' › ').pop();
    return !last || last === 'Pasted YAML' ? 'Imported floorplan' : last;
  }, [card]);
  const [floorName, setFloorName] = useState('');

  function setFound(list: FoundCard[], from: string) {
    setCards(list);
    setPicked(list[0]?.key ?? null);
    setFloorName('');
    setResult(null);
    setMsg(
      list.length
        ? { kind: 'info', text: `${list.length} floorplan card${list.length === 1 ? '' : 's'} found in ${from}.` }
        : { kind: 'err', text: `No custom:floorplan-card or picture-elements card found in ${from}.` },
    );
  }

  async function scan() {
    if (!call) return;
    setBusy('Reading dashboards…');
    setMsg(null);
    try {
      const { cards: found, errors } = await scanDashboards(call);
      setFound(found, 'your dashboards');
      if (errors.length && !found.length) setMsg({ kind: 'err', text: errors.join(' · ') });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function parsePasted() {
    try {
      setFound(cardsFromText(text), 'the pasted YAML');
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = new Map(files);
    let yamlText: string | null = null;
    for (const f of Array.from(list)) {
      next.set(f.name.toLowerCase(), f);
      if (/\.(ya?ml)$/i.test(f.name)) yamlText = await f.text();
    }
    setFiles(next);
    if (yamlText && !text.trim()) {
      setText(yamlText);
      try {
        setFound(cardsFromText(yamlText), f0(list));
      } catch {
        /* a split-out ha-floorplan config; picked up via config: path */
      }
    }
  }

  async function runImport() {
    if (!card) return;
    setBusy('Importing…');
    setMsg(null);
    setResult(null);
    const st = useStore.getState();
    const assets = liveAssetContext(files);
    const name = floorName.trim() || defaultName;
    const ctx = { floorName: name, stripBound, stageUnresolved, entities: st.entities, states: st.states, assets };
    try {
      let res: ImportResult;
      if (card.kind === 'floorplan') {
        let spec = parseFloorplanCard(card.card);
        if (spec.configRef) spec = parseFloorplanCard({ config: yaml.load(await loadText(spec.configRef, assets)) });
        let image = spec.image;
        // Only one SVG loaded by hand and the card points somewhere else? Use it.
        if (image && !files.has(basename(image))) {
          const svgs = [...files.values()].filter((f) => /\.svg$/i.test(f.name));
          if (svgs.length === 1 && !assets.base && !image.startsWith('data:')) image = svgs[0].name;
        }
        if (!image) throw new Error('The card has no config.image.');
        if (!isSvgRef(image) && !files.has(basename(image)))
          throw new Error(`ha-floorplan image ${shortRef(image)} isn't an SVG — nothing to bind rules to.`);
        res = await importFloorplanSvg(await loadText(image, assets), spec, ctx);
      } else {
        res = await importPictureElements(parsePictureElements(card.card), ctx);
      }

      if (target === 'new-project') {
        const p = createProject(name);
        p.floors = [res.floor];
        p.activeFloorId = res.floor.id;
        await saveProject(p).catch(() => {});
        st.loadProject(p);
      } else {
        st.commit((p) => {
          p.floors.push(res.floor);
          p.activeFloorId = res.floor.id;
        });
      }
      st.setTool('select');
      st.select(null);
      setResult(res);
      setMsg({
        kind: 'ok',
        text:
          `Imported "${name}": ${res.markers} markers, ${res.rooms} rooms, background ` +
          (res.background === 'svg' ? 'from the original drawing' : res.background === 'image' ? 'image' : 'none') +
          (res.staged.length ? ` · ${res.staged.length} element(s) not found in the SVG, parked along the bottom` : '') +
          (target === 'new-project' ? ' · opened as a new project' : ' · added as a new floor (Ctrl+Z undoes)') +
          '.',
      });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Import a floorplan card from Home Assistant" onClose={onClose} wide>
      <p className="fp-modal-intro">
        Bring an existing <strong>ha-floorplan</strong> card (SVG + rules — e.g. one generated by Ramses Extras or
        exported from Floorplan Studio) or a <strong>picture-elements</strong> card back into the editor. Bound SVG
        elements become markers, <code>area.*</code> / <code>room_*</code> shapes become rooms, and the rest of the
        drawing stays as the background.
      </p>

      <div className="fp-rx-sources">
        <div className="fp-rx-source">
          <div className="fp-subtitle">From your dashboards</div>
          <button className="fp-primary" disabled={!call || !!busy} onClick={scan}>
            {busy === 'Reading dashboards…' ? busy : 'Scan dashboards'}
          </button>
          <div className="fp-hint">
            {call
              ? 'Finds every floorplan / picture-elements card; images are downloaded from /local/….'
              : 'Connect to Home Assistant first (top-right HA button) — or paste the card YAML.'}
          </div>
        </div>
        <div className="fp-rx-source">
          <div className="fp-subtitle">Paste card YAML</div>
          <textarea
            className="fp-rx-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'type: custom:floorplan-card\nconfig:\n  image: /local/floorplan/home.svg\n  rules: …\n\n(a single card, a whole view or the raw dashboard YAML)'}
            spellCheck={false}
          />
          <div className="fp-modal-actions fp-rx-row">
            <button disabled={!text.trim()} onClick={parsePasted}>Find cards</button>
            <button onClick={() => fileRef.current?.click()}>Add files…</button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".svg,.png,.jpg,.jpeg,.webp,.gif,.css,.yaml,.yml,image/*"
              hidden
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {files.size > 0 && (
            <div className="fp-hint">
              Local files (used instead of downloading, matched by name): {[...files.values()].map((f) => f.name).join(', ')}
            </div>
          )}
        </div>
      </div>

      {msg && <div className={`fp-note ${msg.kind === 'info' ? '' : msg.kind}`}>{msg.text}</div>}

      {cards.length > 0 && !result && (
        <>
          <div className="fp-rx-cards">
            {cards.map((c) => (
              <label key={c.key} className={c.key === picked ? 'fp-rx-card active' : 'fp-rx-card'}>
                <input type="radio" name="fp-card" checked={c.key === picked} onChange={() => { setPicked(c.key); setFloorName(''); }} />
                <span>
                  <strong>{c.where}</strong>
                  <span className="fp-rx-sub">{safeSummary(c)}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="fp-rx-options">
            <label className="fp-radio">
              <input type="radio" checked={target === 'new-project'} onChange={() => setTarget('new-project')} />
              New project
            </label>
            <label className="fp-radio">
              <input type="radio" checked={target === 'new-floor'} onChange={() => setTarget('new-floor')} />
              New floor in this project
            </label>
            <label className="fp-check">
              Name
              <input value={floorName} placeholder={defaultName} onChange={(e) => setFloorName(e.target.value)} style={{ width: 180 }} />
            </label>
          </div>
          {card?.kind === 'floorplan' && (
            <div className="fp-rx-options">
              <label className="fp-check">
                <input type="checkbox" checked={stripBound} onChange={(e) => setStripBound(e.target.checked)} />
                Remove imported elements from the background (no double drawing)
              </label>
              <label className="fp-check">
                <input type="checkbox" checked={stageUnresolved} onChange={(e) => setStageUnresolved(e.target.checked)} />
                Park rules whose element isn't in the SVG along the bottom
              </label>
            </div>
          )}

          <div className="fp-modal-actions fp-rx-footer">
            <button className="fp-primary" disabled={!card || !!busy} onClick={runImport}>
              {busy === 'Importing…' ? busy : 'Import card'}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </>
      )}

      {result && (
        <>
          {(result.unresolved.length > 0 || result.warnings.length > 0) && (
            <ul className="fp-rx-merge">
              {result.unresolved.length > 0 && <li>Not found in the SVG: {result.unresolved.join(', ')}</li>}
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="fp-hint">
            Tip: rooms from <code>area.&lt;id&gt;</code> elements already carry their HA area, so <strong>RAMSES</strong>{' '}
            import can drop devices straight into them.
          </div>
          <div className="fp-modal-actions fp-rx-footer">
            <button className="fp-primary" onClick={onClose}>Done</button>
            <button onClick={() => setResult(null)}>Import another</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function safeSummary(c: FoundCard) {
  try {
    return cardSummary(c);
  } catch {
    return c.kind;
  }
}

const f0 = (l: FileList) => l[0]?.name ?? 'the file';
