/** Strip TEI/XML tags for readable plain text (server-side, mirrors frontend teiRelatedWork). */

export function stripTeiTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isRelatedWorkHeadLabel(raw: string): boolean {
  const t = stripTeiTags(raw).toLowerCase();
  return (
    /related\s+work/.test(t) ||
    /prior\s+work/.test(t) ||
    /^background\s*$/.test(t) ||
    /background\s+and\s+related/.test(t) ||
    /literature\s+review/.test(t) ||
    /literature\s+survey/.test(t)
  );
}

function isConclusionHeadLabel(raw: string): boolean {
  const t = stripTeiTags(raw).toLowerCase().trim();
  return (
    /^conclusion/.test(t) ||
    /^conclusions/.test(t) ||
    /discussion\s+and\s+conclusion/.test(t) ||
    /^summary$/i.test(stripTeiTags(raw).trim()) ||
    /concluding\s+remarks/.test(t)
  );
}

function extractSectionAfterHead(xml: string, headMatch: (label: string) => boolean, maxSlice: number): string | null {
  if (!xml?.trim()) return null;
  const headRe = /<head[^>]*>([\s\S]*?)<\/head>/gi;
  let m: RegExpExecArray | null;
  while ((m = headRe.exec(xml)) !== null) {
    if (!headMatch(m[1])) continue;
    const after = xml.slice(m.index + m[0].length);
    const nextHead = after.search(/<head[^>]/i);
    const slice = nextHead >= 0 ? after.slice(0, nextHead) : after.slice(0, maxSlice);
    const text = stripTeiTags(slice);
    if (text.length > 40) return text.slice(0, 50000);
  }
  return null;
}

/** Best-effort "Related work" block from GROBID TEI. */
export function extractRelatedWorkSectionFromTei(xml: string): string | null {
  return extractSectionAfterHead(xml, isRelatedWorkHeadLabel, 20000);
}

/** Best-effort conclusion / summary block from GROBID TEI. */
export function extractConclusionSectionFromTei(xml: string): string | null {
  return extractSectionAfterHead(xml, isConclusionHeadLabel, 15000);
}
