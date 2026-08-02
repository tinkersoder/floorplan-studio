// HACS/Lovelace entry: wraps the whole Floorplan Studio SPA as a custom card
// element. The app is mounted inside a shadow root with its stylesheet injected
// inline, so HA's CSS and the app's CSS can't collide in either direction.
//
// Built by vite.hacs.config.ts into a single dist-hacs/floorplan-studio.js that
// HACS serves as a Lovelace resource.
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from './App';
// `?inline` gives the CSS as a string instead of injecting it into document
// <head> — we put it in the shadow root instead.
import cssText from './styles.css?inline';

const HOST_CSS =
  ':host{display:block;height:var(--floorplan-studio-height,85vh);}' +
  '.fps-root{height:100%;position:relative;overflow:hidden;background:var(--bg,#0b0f17);}';

class FloorplanStudioCard extends HTMLElement {
  private root?: Root;
  private mounted = false;

  // Lovelace requires setConfig on every card. The editor keeps its own state
  // (IndexedDB projects), so there is nothing to configure; a `height:` option
  // maps to the CSS var above.
  setConfig(config?: { height?: string }): void {
    if (config?.height) this.style.setProperty('--floorplan-studio-height', config.height);
  }

  connectedCallback(): void {
    if (this.mounted) return;
    this.mounted = true;
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = HOST_CSS + cssText;
    shadow.appendChild(style);
    const mount = document.createElement('div');
    mount.className = 'fps-root';
    shadow.appendChild(mount);
    this.root = createRoot(mount);
    this.root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }

  disconnectedCallback(): void {
    this.root?.unmount();
    this.root = undefined;
    this.mounted = false;
  }

  // Rough masonry sizing hint (× 50px). The editor is tall.
  getCardSize(): number {
    return 12;
  }
}

if (!customElements.get('floorplan-studio-card')) {
  customElements.define('floorplan-studio-card', FloorplanStudioCard);
}

// Surface it in HA's "Add card" picker.
interface CustomCard {
  type: string;
  name: string;
  description: string;
}
const w = window as unknown as { customCards?: CustomCard[] };
w.customCards = w.customCards || [];
w.customCards.push({
  type: 'floorplan-studio-card',
  name: 'Floorplan Studio',
  description: 'Full floorplan editor inside a dashboard card.',
});
