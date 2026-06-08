export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && window.litreview?.quit != null
}

export async function quitElectronApp(): Promise<void> {
  if (!isElectronApp()) return
  await window.litreview!.quit()
}
