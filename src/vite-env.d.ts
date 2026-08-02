/// <reference types="vite/client" />

// CSS imported with the `?inline` query resolves to the stylesheet text (used by
// the HACS card entry to inject styles into its shadow root).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
