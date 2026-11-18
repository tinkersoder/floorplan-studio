// Bootstrap: install `window.floorplanStudio` before any provider module is
// evaluated. Import this FIRST in entry points — ES modules evaluate in
// import order, so `import './plugins/install'` must precede provider imports.
import { installPluginApi } from './api';

installPluginApi();
