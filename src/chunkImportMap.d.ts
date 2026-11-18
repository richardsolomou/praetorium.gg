declare module 'virtual:chunk-import-map' {
  /** The client build's import map as JSON, in the server bundle of a production build only. */
  const importMap: string | undefined
  export default importMap
}
