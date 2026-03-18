import Handlebars from 'handlebars';
import {
  exportDocumentAsHtml,
  findOrCreateFolder,
  findFileByName,
  createDocumentFromHtml,
  updateDocumentFromHtml,
  applyParagraphIndentation,
  type GoogleClients,
  type ParagraphIndent,
} from './google-docs.js';

export interface CvGenerateOptions {
  templateDocId: string;
  data: Record<string, unknown>;
  folderPath?: string;
  clients?: GoogleClients;
}

export interface CvGenerateResult {
  documentId: string;
  title: string;
  filename: string;
  created: boolean;
}

export async function generateCv(options: CvGenerateOptions): Promise<CvGenerateResult> {
  const { templateDocId, data, folderPath = 'cv/generated', clients } = options;

  const templateHtml = await exportDocumentAsHtml(templateDocId, clients);
  const cleanedHtml = cleanHandlebarsHtml(templateHtml);

  const template = Handlebars.compile(cleanedHtml);
  let renderedHtml = template(data);
  renderedHtml = autoLinkText(renderedHtml);

  const filename = buildFilename(data);
  if (!filename) {
    throw new Error('Could not derive filename from data.header.name, data.application.position, data.application.company');
  }

  const folderParts = folderPath.split('/').filter(Boolean);
  let parentId: string | undefined;
  for (const part of folderParts) {
    parentId = await findOrCreateFolder(part, parentId, clients);
  }

  const indents = extractParagraphIndents(renderedHtml);
  const existingId = await findFileByName(filename, parentId, clients);
  let documentId: string;
  let created: boolean;

  if (existingId) {
    await updateDocumentFromHtml(existingId, renderedHtml, clients);
    documentId = existingId;
    created = false;
  } else {
    const result = await createDocumentFromHtml(filename, renderedHtml, parentId, clients);
    documentId = result.documentId;
    created = true;
  }

  await applyParagraphIndentation(documentId, indents, clients);

  return { documentId, title: filename, filename, created };
}

export function cleanHandlebarsHtml(html: string): string {
  // Strip HTML tags from inside {{...}} expressions (Google Docs wraps in <span>)
  let cleaned = html.replace(/\{\{([^}]*)\}\}/g, (match) => {
    return match.replace(/<[^>]+>/g, '');
  });
  // Remove <p> wrappers around standalone Handlebars block expressions
  cleaned = cleaned.replace(
    /<p[^>]*>(?:<span[^>]*>)*\s*((?:\{\{[#\/][^}]+\}\}\s*)+)\s*(?:<\/span>)*<\/p>/gi,
    '$1',
  );
  return cleaned;
}

export function autoLinkText(html: string): string {
  // Email addresses → mailto: links (skip existing <a> tags)
  let result = html.replace(
    /(<a\s[^>]*>[\s\S]*?<\/a>)|([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi,
    (_match, existingLink, email) => {
      if (existingLink) return existingLink;
      return `<a href="mailto:${email}">${email}</a>`;
    },
  );
  // URLs → https: links (skip existing <a> tags)
  result = result.replace(
    /(<a\s[^>]*>[\s\S]*?<\/a>)|(https?:\/\/[\w.-]+\.[a-z]{2,}(?:\/[\w./?&=%-]*)?|www\.[\w.-]+\.[a-z]{2,}(?:\/[\w./?&=%-]*)?|(?<![.\w])[\w-]+\.(?:com|org|net|io|dev|co)\b(?:\/[\w./?&=%-]*)?)/gi,
    (match, existingLink, url) => {
      if (existingLink || !url) return match;
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}">${url}</a>`;
    },
  );
  return result;
}

export function extractParagraphIndents(html: string): ParagraphIndent[] {
  const indents: ParagraphIndent[] = [];
  const pTagRegex = /<p[\s>][^>]*>/gi;
  let match;
  while ((match = pTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const marginMatch = tag.match(/margin-left:\s*([\d.]+)pt/);
    const textIndentMatch = tag.match(/text-indent:\s*(-?[\d.]+)pt/);
    const indentStart = marginMatch ? parseFloat(marginMatch[1]) : 0;
    const indentFirstLine = textIndentMatch ? indentStart + parseFloat(textIndentMatch[1]) : undefined;
    indents.push({ indentStart, indentFirstLine });
  }
  return indents;
}

export function toSnakeCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .join('_');
}

function buildFilename(data: Record<string, unknown>): string {
  const d = data as Record<string, any>;
  const name = d.header?.name || '';
  const position = d.application?.position || '';
  const company = d.application?.company || '';
  return toSnakeCase(`${name} ${position} ${company}`.trim());
}
