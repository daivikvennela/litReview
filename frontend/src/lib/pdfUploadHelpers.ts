/** MIME is sometimes empty for files from directory traversal. */
export function isPdfLike(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

/** Stable path for UI + multipart filename (preserves nested folders when available). */
export function multipartFilenameForPdf(file: File): string {
  const rp = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  const raw = rp && rp.length > 0 ? rp : file.name
  return raw.replace(/\\/g, '/')
}

function readDirBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

async function walkFileSystemEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    await new Promise<void>((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (file) => {
          if (isPdfLike(file)) out.push(file)
          resolve()
        },
        () => resolve(),
      )
    })
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    let batch = await readDirBatch(reader)
    while (batch.length > 0) {
      for (const child of batch) {
        await walkFileSystemEntry(child, out)
      }
      batch = await readDirBatch(reader)
    }
  }
}

function dedupeByMultipartName(files: File[]): File[] {
  const seen = new Set<string>()
  const out: File[] = []
  for (const f of files) {
    const k = multipartFilenameForPdf(f)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

/**
 * Collect PDFs from a drop target, including nested folders (Chrome / Edge / most Chromium).
 * Falls back to `dataTransfer.files` when directory APIs are unavailable.
 */
export async function gatherPdfFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const out: File[] = []
  const items = dt.items?.length ? Array.from(dt.items) : []

  for (const item of items) {
    const getEntry =
      'webkitGetAsEntry' in item && typeof (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry === 'function'
        ? (item as DataTransferItem & { webkitGetAsEntry: () => FileSystemEntry | null }).webkitGetAsEntry
        : null
    const entry = getEntry ? getEntry.call(item) : null
    if (entry) {
      await walkFileSystemEntry(entry, out)
    } else if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f && isPdfLike(f)) out.push(f)
    }
  }

  if (out.length === 0 && dt.files?.length) {
    for (const f of Array.from(dt.files)) {
      if (isPdfLike(f)) out.push(f)
    }
  }

  return dedupeByMultipartName(out)
}
