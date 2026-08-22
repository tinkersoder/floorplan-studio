import { useState } from 'react';
import { useStore } from '../state/store';
import { Modal } from '../ui/Modal';
import { haClient, readCredentials, saveCredentials, clearCredentials } from './client';
import { getHass, hassAvailable, hassToSource } from './hassBridge';

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const saved = readCredentials();
  const [url, setUrl] = useState(saved?.url ?? 'http://homeassistant.local:8123');
  const [token, setToken] = useState(saved?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const conn = useStore((s) => s.conn);
  const inCard = hassAvailable();

  function useThisDashboard() {
    const h = getHass();
    if (!h) return;
    const { entities, states } = hassToSource(h);
    useStore.getState().useHassSource(entities, states);
    setMsg({ kind: 'ok', text: `Live — ${entities.length} entities from this dashboard.` });
  }

  async function testAndConnect() {
    setBusy(true);
    setMsg(null);
    const { setConn, setLiveSource } = useStore.getState();
    setConn({ status: 'connecting' });
    try {
      await haClient.connect(url, token);
      const { entities, areas } = await haClient.fetchEntities();
      haClient.subscribe((states) => useStore.getState().setLiveSource(entities, states, url));
      setLiveSource(entities, {}, url);
      void areas;
      saveCredentials(url, token);
      setMsg({ kind: 'ok', text: `Connected — ${entities.length} entities loaded.` });
      setConn({ status: 'connected', url, error: undefined });
    } catch (e) {
      const text = explain(e as Error, url);
      setMsg({ kind: 'err', text });
      setConn({ status: 'error', error: text });
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    haClient.disconnect();
    clearCredentials();
    useStore.getState().useDemoSource();
    setMsg(null);
  }

  return (
    <Modal title="Connect to Home Assistant" onClose={onClose}>
      <p className="fp-modal-intro">
        Optional. The app works fully offline with the built-in demo entities. Connecting
        pulls your real entity list and live states for preview. Your token stays in this
        browser and is only ever sent to your own HA instance.
      </p>

      {inCard && (
        <div className="fp-card-connect">
          <button className="fp-primary" onClick={useThisDashboard}>
            Use this dashboard's Home Assistant
          </button>
          <p className="fp-note">
            Running as a dashboard card — go live off this HA instantly, no URL or token
            needed. (Or connect a different HA below.)
          </p>
        </div>
      )}

      <label className="fp-field">
        <span className="fp-field-label">Home Assistant URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://homeassistant.local:8123" />
      </label>
      <label className="fp-field">
        <span className="fp-field-label">Long-lived access token</span>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Profile → Security → Long-lived tokens" />
      </label>

      <div className="fp-modal-actions">
        <button className="fp-primary" disabled={busy || !token} onClick={testAndConnect}>
          {busy ? 'Testing…' : 'Test connection & connect'}
        </button>
        {conn.status === 'connected' && <button onClick={disconnect}>Disconnect (back to demo)</button>}
      </div>

      {msg && <div className={msg.kind === 'ok' ? 'fp-note ok' : 'fp-note err'}>{msg.text}</div>}

      <details className="fp-details">
        <summary>Connection troubleshooting (CORS / mixed-content)</summary>
        <ul>
          <li>
            <strong>Mixed content:</strong> if this app is on <code>https://</code> your HA must also be
            <code> https://</code>. A plain <code>http://</code> HA URL is blocked from an https page. Serve
            this app over http, or put HA behind https.
          </li>
          <li>
            <strong>CORS:</strong> add this app's origin to HA's <code>configuration.yaml</code>:
            <pre>{`http:\n  cors_allowed_origins:\n    - ${location.origin}`}</pre>
            then restart HA.
          </li>
          <li>
            <strong>Token:</strong> create one under your HA <em>Profile → Security → Long-lived access tokens</em>.
          </li>
        </ul>
      </details>
    </Modal>
  );
}

function explain(e: Error, url: string): string {
  const m = (e.message || '').toLowerCase();
  if (url.startsWith('http://') && location.protocol === 'https:')
    return 'Blocked: this app is on https but the HA URL is http (mixed content). Use an https HA URL, or open this app over http.';
  if (m.includes('invalid') || m.includes('auth') || (e as any).code === 'invalid_auth')
    return 'Authentication failed — check the long-lived access token.';
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('websocket'))
    return `Could not reach ${url}. Check the URL is correct/reachable and that HA cors_allowed_origins includes ${location.origin}.`;
  return `Connection failed: ${e.message}`;
}
