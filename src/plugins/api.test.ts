import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginManifest } from './types';
import type { QueuedPluginItem } from './api';

// Node has no DOM: give the module a bare EventTarget as `window`.
function stubWindow() {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  vi.stubGlobal('window', win);
  return win as unknown as Window;
}

describe('plugin queue (load-order-safe registration)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('registers manifests and runs callbacks queued before install', async () => {
    const win = stubWindow();
    const seen: number[] = [];
    const queued: QueuedPluginItem[] = [
      { id: 'early', provides: { deviceSources: [{ id: 'devices', title: 'Early' }] } },
      (api) => {
        seen.push(api.apiVersion);
      },
    ];
    win.floorplanStudioQueue = queued;
    let ready = 0;
    win.addEventListener('floorplan-studio:ready', () => ready++);

    const { installPluginApi } = await import('./api');
    const api = installPluginApi();

    expect(api.registry.plugins().map((p) => p.id)).toEqual(['early']);
    expect(seen).toEqual([api.apiVersion]);
    expect(ready).toBe(1);
  });

  it('pushes after install register immediately', async () => {
    const win = stubWindow();
    const { installPluginApi } = await import('./api');
    const api = installPluginApi();

    const late: PluginManifest = { id: 'late' };
    (win.floorplanStudioQueue ||= [] as QueuedPluginItem[]).push(late);
    expect(api.registry.plugins().map((p) => p.id)).toContain('late');
  });

  it('one bad queued item does not block the rest', async () => {
    const win = stubWindow();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const queued: QueuedPluginItem[] = [
      () => {
        throw new Error('boom');
      },
      { id: 'after-boom' },
    ];
    win.floorplanStudioQueue = queued;
    const { installPluginApi } = await import('./api');
    expect(installPluginApi().registry.plugins().map((p) => p.id)).toContain('after-boom');
    expect(err).toHaveBeenCalled();
  });
});
