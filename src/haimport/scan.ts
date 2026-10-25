// Read every Lovelace dashboard over the WebSocket and collect floorplan cards.
import type { WsCall } from '../ramses/fetch';
import { FoundCard, findCards } from './cards';

interface DashboardInfo {
  url_path: string | null;
  title?: string;
  mode?: string;
}

export async function scanDashboards(call: WsCall): Promise<{ cards: FoundCard[]; errors: string[] }> {
  const list = await call<DashboardInfo[]>({ type: 'lovelace/dashboards/list' }).catch(() => [] as DashboardInfo[]);
  const targets: DashboardInfo[] = [{ url_path: null, title: 'Overview' }, ...list];
  const cards: FoundCard[] = [];
  const errors: string[] = [];
  await Promise.all(
    targets.map(async (d) => {
      try {
        const cfg = await call<unknown>({ type: 'lovelace/config', url_path: d.url_path, force: false });
        cards.push(...findCards(cfg, d.title || d.url_path || 'Dashboard').map((c) => ({ ...c, key: `${d.url_path ?? ''}#${c.key}` })));
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
