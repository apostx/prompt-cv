// POST /cv/generate request
export interface CvGenerateRequest {
  data: Record<string, unknown>;
  templateDocId: string;
}

// POST /cv/generate response
export interface CvGenerateResponse {
  documentId: string;
  title: string;
  filename: string;
  created: boolean;
}

// PUT /docs/:id/html request
export interface DocUpdateRequest {
  content: string;
}
