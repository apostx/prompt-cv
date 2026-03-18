import { google } from 'googleapis';
import type { docs_v1 } from 'googleapis';

export interface GoogleClients {
  docs: docs_v1.Docs;
  drive: ReturnType<typeof google.drive>;
}

let defaultClients: GoogleClients | null = null;

function getDefaultClients(): GoogleClients {
  if (!defaultClients) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Missing Google OAuth2 credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN'
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    defaultClients = {
      docs: google.docs({ version: 'v1', auth: oauth2Client }),
      drive: google.drive({ version: 'v3', auth: oauth2Client }),
    };
  }
  return defaultClients;
}

function getClients(clients?: GoogleClients): GoogleClients {
  return clients || getDefaultClients();
}

/**
 * Extract plain text content from Google Docs document
 */
function extractTextContent(document: docs_v1.Schema$Document): string {
  const content = document.body?.content || [];
  let text = '';

  for (const element of content) {
    if (element.paragraph?.elements) {
      for (const elem of element.paragraph.elements) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }
  }

  return text.trim();
}

/**
 * Get document content
 */
export async function getDocument(documentId: string, clients?: GoogleClients): Promise<{
  documentId: string;
  title: string;
  content: string;
}> {
  const { docs } = getClients(clients);
  const response = await docs.documents.get({ documentId });
  const document = response.data;

  return {
    documentId: document.documentId || documentId,
    title: document.title || '',
    content: extractTextContent(document),
  };
}

/**
 * Get document title only (lightweight validation)
 */
export async function getDocumentTitle(documentId: string, clients?: GoogleClients): Promise<{ title: string }> {
  const { docs } = getClients(clients);
  const response = await docs.documents.get({ documentId, fields: 'title' });
  return { title: response.data.title || '' };
}

/**
 * Create a new document
 */
export async function createDocument(
  title: string,
  content?: string,
  clients?: GoogleClients,
): Promise<{ documentId: string; title: string }> {
  const { docs } = getClients(clients);

  // Create empty document
  const createResponse = await docs.documents.create({
    requestBody: { title },
  });

  const documentId = createResponse.data.documentId!;

  // Add initial content if provided
  if (content) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });
  }

  return {
    documentId,
    title: createResponse.data.title || title,
  };
}

/**
 * Update document content (replace all content)
 */
export async function updateDocument(
  documentId: string,
  content: string,
  clients?: GoogleClients,
): Promise<void> {
  const { docs } = getClients(clients);

  // Get current document to find content length
  const doc = await docs.documents.get({ documentId });
  const body = doc.data.body;

  // Calculate end index (document content ends at body.content last element)
  const contentElements = body?.content || [];
  let endIndex = 1;
  for (const element of contentElements) {
    if (element.endIndex && element.endIndex > endIndex) {
      endIndex = element.endIndex;
    }
  }

  const requests: docs_v1.Schema$Request[] = [];

  // Delete existing content (if any beyond the initial newline)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: endIndex - 1,
        },
      },
    });
  }

  // Insert new content
  requests.push({
    insertText: {
      location: { index: 1 },
      text: content,
    },
  });

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

/**
 * Append content to document
 */
export async function appendToDocument(
  documentId: string,
  content: string,
  clients?: GoogleClients,
): Promise<void> {
  const { docs } = getClients(clients);

  // Get current document to find end index
  const doc = await docs.documents.get({ documentId });
  const body = doc.data.body;

  // Find the end index
  const contentElements = body?.content || [];
  let endIndex = 1;
  for (const element of contentElements) {
    if (element.endIndex && element.endIndex > endIndex) {
      endIndex = element.endIndex;
    }
  }

  // Insert at end (before the final newline)
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
            text: content,
          },
        },
      ],
    },
  });
}

/**
 * Export document as HTML (preserves formatting via Google Drive export)
 */
export async function exportDocumentAsHtml(documentId: string, clients?: GoogleClients): Promise<string> {
  const { drive } = getClients(clients);
  const response = await drive.files.export({
    fileId: documentId,
    mimeType: 'text/html',
  });
  return response.data as string;
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string, clients?: GoogleClients): Promise<void> {
  const { drive } = getClients(clients);
  await drive.files.delete({ fileId: documentId });
}

/**
 * Find or create a Google Drive folder by name
 */
export async function findOrCreateFolder(name: string, parentId?: string, clients?: GoogleClients): Promise<string> {
  const { drive } = getClients(clients);
  let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const response = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 1,
  });
  const files = response.data.files || [];
  if (files.length > 0) return files[0].id!;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    },
    fields: 'id',
  });
  return created.data.id!;
}

/**
 * Find a Google Drive folder by name (read-only, does not create)
 */
export async function findFolder(name: string, parentId?: string, clients?: GoogleClients): Promise<string | null> {
  const { drive } = getClients(clients);
  let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const response = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  const files = response.data.files || [];
  return files.length > 0 ? files[0].id! : null;
}

/**
 * Navigate a folder path (e.g. "cv/generated") and return the final folder ID, or null if not found
 */
export async function findFolderByPath(folderPath: string, clients?: GoogleClients): Promise<string | null> {
  const parts = folderPath.split('/').filter(Boolean);
  let parentId: string | undefined;
  for (const part of parts) {
    const id = await findFolder(part, parentId, clients);
    if (!id) return null;
    parentId = id;
  }
  return parentId ?? null;
}

/**
 * Search for a Google Drive file by exact name, optionally within a folder
 */
export async function findFileByName(name: string, folderId?: string, clients?: GoogleClients): Promise<string | null> {
  const { drive } = getClients(clients);
  let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`;
  if (folderId) q += ` and '${folderId}' in parents`;
  const response = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const files = response.data.files || [];
  return files.length > 0 ? files[0].id! : null;
}

/**
 * Create a new Google Doc by importing HTML content
 */
export async function createDocumentFromHtml(
  title: string,
  htmlContent: string,
  folderId?: string,
  clients?: GoogleClients,
): Promise<{ documentId: string; title: string }> {
  const { drive } = getClients(clients);
  const response = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      ...(folderId && { parents: [folderId] }),
    },
    media: {
      mimeType: 'text/html',
      body: htmlContent,
    },
    fields: 'id, name',
  });
  return {
    documentId: response.data.id!,
    title: response.data.name || title,
  };
}

/**
 * Update an existing Google Doc by replacing its content with HTML
 */
export async function updateDocumentFromHtml(
  fileId: string,
  htmlContent: string,
  clients?: GoogleClients,
): Promise<void> {
  const { drive } = getClients(clients);
  await drive.files.update({
    fileId,
    media: {
      mimeType: 'text/html',
      body: htmlContent,
    },
  });
}

/**
 * Get page count by exporting as PDF and counting page markers
 */
export async function getPageCount(documentId: string, clients?: GoogleClients): Promise<number> {
  const { drive } = getClients(clients);
  const response = await drive.files.export({
    fileId: documentId,
    mimeType: 'application/pdf',
  }, { responseType: 'arraybuffer' });

  const buffer = Buffer.from(response.data as ArrayBuffer);
  const content = buffer.toString('latin1');
  const matches = content.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

export interface DocumentMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Get document margins in PT
 */
export async function getDocumentMargins(documentId: string, clients?: GoogleClients): Promise<DocumentMargins> {
  const { docs } = getClients(clients);
  const response = await docs.documents.get({ documentId });
  const style = response.data.documentStyle;

  return {
    top: style?.marginTop?.magnitude ?? 72,
    bottom: style?.marginBottom?.magnitude ?? 72,
    left: style?.marginLeft?.magnitude ?? 72,
    right: style?.marginRight?.magnitude ?? 72,
  };
}

/**
 * Update document margins (values in PT)
 */
export async function updateDocumentMargins(
  documentId: string,
  margins: DocumentMargins,
  clients?: GoogleClients,
): Promise<void> {
  const { docs } = getClients(clients);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{
        updateDocumentStyle: {
          documentStyle: {
            marginTop: { magnitude: margins.top, unit: 'PT' },
            marginBottom: { magnitude: margins.bottom, unit: 'PT' },
            marginLeft: { magnitude: margins.left, unit: 'PT' },
            marginRight: { magnitude: margins.right, unit: 'PT' },
          },
          fields: 'marginTop,marginBottom,marginLeft,marginRight',
        },
      }],
    },
  });
}

/**
 * Get full raw document (for structural analysis)
 */
export async function getRawDocument(documentId: string, clients?: GoogleClients): Promise<docs_v1.Schema$Document> {
  const { docs } = getClients(clients);
  const response = await docs.documents.get({ documentId });
  return response.data;
}

/**
 * Insert page breaks before specified paragraph indices.
 * Indices are document body content indices (paragraph positions in body.content array).
 * Must be applied in reverse order to preserve earlier indices.
 */
export async function insertPageBreaks(
  documentId: string,
  paragraphStartIndices: number[],
  clients?: GoogleClients,
): Promise<void> {
  if (paragraphStartIndices.length === 0) return;
  const { docs } = getClients(clients);

  // Sort descending so earlier insertions don't shift later indices
  const sorted = [...paragraphStartIndices].sort((a, b) => b - a);

  const requests: docs_v1.Schema$Request[] = sorted.map(index => ({
    insertPageBreak: {
      location: { index },
    },
  }));

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

/**
 * Remove all forced page breaks from a document.
 * Returns the number of page breaks removed.
 */
export async function removePageBreaks(documentId: string, clients?: GoogleClients): Promise<number> {
  const doc = await getRawDocument(documentId, clients);
  const content = doc.body?.content || [];

  // Collect startIndex of every pageBreak element
  const breakIndices: number[] = [];
  for (const element of content) {
    if (!element.paragraph) continue;
    for (const elem of element.paragraph.elements || []) {
      if (elem.pageBreak && elem.startIndex != null && elem.endIndex != null) {
        breakIndices.push(elem.startIndex);
      }
    }
  }

  if (breakIndices.length === 0) return 0;

  const { docs } = getClients(clients);

  // Delete in reverse order to preserve earlier indices
  const sorted = [...breakIndices].sort((a, b) => b - a);
  const requests: docs_v1.Schema$Request[] = sorted.map(index => ({
    deleteContentRange: {
      range: { startIndex: index - 1, endIndex: index + 1 },
    },
  }));

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });

  return breakIndices.length;
}

export interface ParagraphIndent {
  indentStart: number;
  indentFirstLine?: number;
}

/**
 * Apply paragraph indentation to a document.
 * Google Drive HTML import drops margin-left and text-indent values,
 * so we fix them via the Docs API after import.
 */
export async function applyParagraphIndentation(
  documentId: string,
  indents: ParagraphIndent[],
  clients?: GoogleClients,
): Promise<void> {
  const { docs } = getClients(clients);
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content || [];

  // Collect paragraph start indices
  const paragraphs: { startIndex: number }[] = [];
  for (const element of content) {
    if (element.paragraph && element.startIndex != null) {
      paragraphs.push({ startIndex: element.startIndex });
    }
  }

  const requests: docs_v1.Schema$Request[] = [];
  const len = Math.min(paragraphs.length, indents.length);

  for (let i = 0; i < len; i++) {
    const { indentStart, indentFirstLine } = indents[i];
    const paragraphStyle: docs_v1.Schema$ParagraphStyle = {
      indentStart: { magnitude: indentStart, unit: 'PT' },
    };
    let fields = 'indentStart';

    if (indentFirstLine != null) {
      paragraphStyle.indentFirstLine = { magnitude: indentFirstLine, unit: 'PT' };
      fields += ',indentFirstLine';
    }

    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: paragraphs[i].startIndex,
          endIndex: paragraphs[i].startIndex + 1,
        },
        paragraphStyle,
        fields,
      },
    });
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  }
}
