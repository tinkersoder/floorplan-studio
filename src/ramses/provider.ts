// RAMSES RF / Ramses Extras device provider.
//
// Registers itself through the PUBLIC plugin API exactly the way an external
// integration would (`window.floorplanStudio.registerPlugin`) — it imports
// only the manifest types plus its own fetch/parse helpers, nothing from the
// editor's internals. That makes this file the reference implementation for
// the plugin API: the same code ships unchanged whether it lives in this
// repo or in the integration's own Lovelace assets.
//
// Imported for side effects by both entry points (main.tsx, hacs-card.tsx).
import { fetchRamsesTopology } from './fetch';
import {
  CLASS_ICON,
  parseRamsesInput,
  topologyFromIds,
} from './topology';
import type { ParsedSourceInput, PluginManifest } from '../plugins/types';

const manifest: PluginManifest = {
  id: 'ramses',
  apiVersion: 1,
  provides: {
    deviceSources: [
      {
        id: 'ramses',
        title: 'RAMSES RF / Ramses Extras',
        description:
          'evohome / RAMSES-II devices — zones, TRVs, thermostats, ventilation, CO₂ sensors, remotes',
        fetch: (ws) => fetchRamsesTopology(ws),
        parse: (text, ctx): ParsedSourceInput => {
          const r = parseRamsesInput(text);
          switch (r.kind) {
            case 'topology':
              return { kind: 'topology', topology: r.topology };
            case 'project':
              return { kind: 'project', project: r.project };
            case 'ids': {
              const t = topologyFromIds(r.ids, ctx.entities);
              const matched = t.devices.filter((d) => d.entities.length).length;
              return {
                kind: 'topology',
                topology: t,
                note: ctx.usingDemo
                  ? 'Connect to Home Assistant first — device ids are matched against your real entity list.'
                  : `${matched} matched to HA entities by id.`,
              };
            }
            default:
              return { kind: 'nomatch' };
          }
        },
      },
    ],
    iconMap: { ...CLASS_ICON },
  },
};

window.floorplanStudio?.registerPlugin(manifest);
