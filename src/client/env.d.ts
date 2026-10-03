interface ImportMetaEnv {
  readonly DEV: boolean
  readonly SSR: boolean
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
