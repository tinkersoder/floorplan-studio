// Read every Lovelace dashboard over the WebSocket and collect floorplan cards.
import yaml from 'js-yaml';
import type { WsCall } from '../ha/wsCaller';
import { FoundCard, findCards, replaceCardAtIndex } from './cards';

interface DashboardInfo {
  url_path: string | null;
  title?: string;
  mode?: string;
}

export async function scanDashboards(call: WsCall): Promise<{ cards: FoundCard[]; errors: string[] }> {
  const list = await call<DashboardInfo[]>({ type: 'lovelace/dashboards/list' }).catch(() => [] as DashboardInfo[]);
  const targets: DashboardInfo[] = [{ url_path: null, title: 'Overview', mode: 'storage' }, ...list];
  const cards: FoundCard[] = [];
  const errors: string[] = [];
  await Promise.all(
    targets.map(async (d) => {
      try {
        const cfg = await call<unknown>({ type: 'lovelace/config', url_path: d.url_path, force: false });
        cards.push(
          ...findCards(cfg, d.title || d.url_path || 'Dashboard').map((c, idx) => ({
            ...c,
            key: `${d.url_path ?? ''}#${c.key}`,
            urlPath: d.url_path,
            cardIndex: idx,
            dashboardMode: d.mode ?? 'storage',
          })),
        );
      } catch (e) {
        const msg = (e as { code?: string; message?: string })?.code ?? '';
        // The auto-generated default dashboard has no stored config — not an error.
        if (msg !== 'config_not_found') errors.push(`${d.title ?? d.url_path}: ${(e as Error)?.message ?? msg}`);
      }
    }),
  );
  cards.sort((a, b) => a.where.localeCompare(b.where));
  return { cards, errors };
}

/**
 * Write exported card YAML back into an existing Lovelace card on a storage-mode
 * dashboard via `lovelace/config/save`.
 */
export async function updateDashboardCard(
  call: WsCall,
  target: FoundCard,
  yamlText: string,
): Promise<void> {
  if (target.dashboardMode && target.dashboardMode !== 'storage') {
    throw new Error(`Dashboard "${target.where}" is in ${target.dashboardMode} mode (read-only via WebSocket).`);
  }
  if (typeof target.cardIndex !== 'number') {
    throw new Error('Target card is missing its dashboard index.');
  }
  const parsed = yaml.load(yamlText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Exported YAML did not parse as a card mapping.');
  }
  const cfg = await call<Record<string, unknown>>({
    type: 'lovelace/config',
    url_path: target.urlPath ?? null,
    force: true,
  });
  const nextCfg = structuredClone(cfg);
  if (!replaceCardAtIndex(nextCfg, target.cardIndex, parsed as Record<string, unknown>)) {
    throw new Error(`Card #${target.cardIndex} in "${target.where}" was not found (dashboard changed?).`);
  }
  await call({
    type: 'lovelace/config/save',
    url_path: target.urlPath ?? null,
    config: nextCfg,
  });
}
