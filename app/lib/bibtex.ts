import type { Article } from "../db.js";

function escapeBrace(s: string): string {
  return s.replace(/([{}])/g, "\\$1");
}

/** BibTeX-safe brace wrapping for titles / venue strings. */
function braced(s: string | null | undefined): string {
  if (!s?.trim()) return "";
  return `{${escapeBrace(s.trim())}}`;
}

function firstAuthorSlug(authors: string | null | undefined): string {
  if (!authors?.trim()) return "anon";
  const first = authors.split(/[;,]/)[0]?.trim() ?? "";
  const parts = first.split(/\s+/).filter(Boolean);
  const last = parts.length >= 1 ? parts[parts.length - 1].toLowerCase() : "";
  const slug = last.replace(/[^a-z]/gi, "");
  return slug.length >= 2 ? slug.slice(0, 20) : "anon";
}

function titleSlug(title: string | null | undefined): string {
  if (!title?.trim()) return "paper";
  const w = title
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]/gi, "") ?? "paper";
  return w.slice(0, 14) || "paper";
}

function entryType(venueType: string | null | undefined): "article" | "inproceedings" | "misc" {
  const v = (venueType || "").toLowerCase();
  if (v === "conference") return "inproceedings";
  if (v === "journal" || v === "preprint") return "article";
  return "misc";
}

function formatBibtexAuthors(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const parts = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join(" and ");
}

/** Build deterministic BibTeX entries from library metadata (no LLM). */
export function buildBibTeX(articles: Article[]): string {
  const usedKeys = new Set<string>();
  const lines: string[] = [];

  articles.forEach((a, index) => {
    const year = a.year != null ? String(a.year) : "0000";
    const baseKey = `${firstAuthorSlug(a.authors)}${year}${titleSlug(a.title)}`.replace(/[^a-z0-9]/gi, "") || `entry${index}`;
    let key = baseKey.slice(0, 48);
    let suffix = 0;
    while (usedKeys.has(key)) {
      suffix += 1;
      key = `${baseKey.slice(0, 40)}${suffix}`;
    }
    usedKeys.add(key);

    const kind = entryType(a.venue_type);
    const titleField = braced(a.title?.trim() ? a.title : a.pdf_path || "Untitled");
    const authorJoined = formatBibtexAuthors(a.authors);
    const authorField = authorJoined ? braced(authorJoined) : "";

    const fields: string[] = [];
    if (authorField) fields.push(`  author = ${authorField}`);
    fields.push(`  title = ${titleField}`);
    if (a.year != null) fields.push(`  year = {${a.year}}`);

    const venue = a.venue_name?.trim();
    if (kind === "inproceedings") {
      if (venue) fields.push(`  booktitle = ${braced(venue)}`);
      fields.push(`  organization = ${braced(a.venue_type || "Conference")}`);
    } else if (kind === "article") {
      if (venue) fields.push(`  journal = ${braced(venue)}`);
      else if (a.venue_type === "preprint") fields.push(`  journal = {preprint}`);
    } else {
      const noteParts = [a.venue_type, venue].filter(Boolean);
      if (noteParts.length) fields.push(`  note = ${braced(noteParts.join(", "))}`);
    }

    const head =
      kind === "inproceedings"
        ? `@inproceedings{${key},`
        : kind === "article"
          ? `@article{${key},`
          : `@misc{${key},`;

    lines.push(head);
    lines.push(fields.join(",\n"));
    lines.push("}\n");
  });

  return lines.join("\n").trimEnd();
}
