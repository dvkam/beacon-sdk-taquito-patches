// Rollup exports aggregated stylesheets as text for the shadow DOM hosts.
declare module '*aggregated.css' {
  const cssText: string
  // eslint-disable-next-line import/no-default-export -- The CSS loader provides a default string export.
  export default cssText
}
