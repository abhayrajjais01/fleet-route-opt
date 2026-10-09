// ─── RAG COMPLIANCE ENGINE CONTRACT (mirrors backend/app/schemas/rag.py) ──────
// Track A: Manthan Nimodiya — US-006
import { apiRequest } from './api'

export type PolicyCategory = 'HAZMAT' | 'DRIVER_REST' | 'COLD_CHAIN' | 'VEHICLE_SAFETY' | 'OPERATIONS'

export interface PolicyCitation {
  chunk_id: string
  doc_id: string
  doc_title: string
  category: PolicyCategory
  section: string
  heading: string
  excerpt: string
  score: number
  version: string
  effective_date: string
}

export interface PolicySearchResponse {
  query: string
  categories: PolicyCategory[] | null
  results: PolicyCitation[]
  top_score: number
  latency_ms: number
  total_chunks_indexed: number
  embedder: string
}

export interface PolicyCategoryInfo { code: PolicyCategory; label: string; document_count: number; chunk_count: number }

export interface PolicyDocumentSummary {
  doc_id: string
  title: string
  category: PolicyCategory
  version: string
  effective_date: string
  references: string
  section_count: number
}

export interface PolicyDocument extends PolicyDocumentSummary {
  sections: { section: string; heading: string; text: string }[]
}

export interface KnowledgeBaseStats { documents: number; chunks: number; vocabulary_size: number; embedder: string; build_ms: number }

export const ragApi = {
  search: (query: string, categories: PolicyCategory[], topK = 5) =>
    apiRequest<PolicySearchResponse>('/rag/search', {
      method: 'POST',
      body: JSON.stringify({ query, top_k: topK, categories: categories.length ? categories : null }),
    }),
  categories: () => apiRequest<PolicyCategoryInfo[]>('/rag/categories'),
  documents: () => apiRequest<PolicyDocumentSummary[]>('/rag/documents'),
  document: (docId: string) => apiRequest<PolicyDocument>(`/rag/documents/${encodeURIComponent(docId)}`),
  stats: () => apiRequest<KnowledgeBaseStats>('/rag/stats'),
}
