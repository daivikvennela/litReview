/// <reference types="vite/client" />

interface LitReviewElectronBridge {
  getVersion: () => Promise<string>
  isElectron: () => Promise<boolean>
  quit: () => Promise<void>
  openExternal: (url: string) => Promise<void>
}

interface Window {
  litreview?: LitReviewElectronBridge
}
