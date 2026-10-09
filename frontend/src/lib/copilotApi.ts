// ─── COPILOT MULTI-AGENT STATEGRAPH CONTRACT (mirrors backend/app/schemas/copilot.py) ──────
// Track B: Abhayraj Jaiswal — US-005 Week 5 Deliverable

import { apiRequest, fetchAuthToken } from './api'

export type AgentIntent =
  | 'TRAFFIC_DELAY'
  | 'VEHICLE_BREAKDOWN'
  | 'POLICY_QUERY'
  | 'REROUTE_REQUEST'
  | 'GENERAL_INQUIRY'
  | 'OFF_TOPIC'

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface TraceStep {
  step: number
  node: string
  action: string
  details: Record<string, any>
  timestamp: string
  latency_ms: number
}

export interface AgentEntities {
  vehicle_id: string | null
  stop_id: string | null
  delay_minutes: number | null
  location: string | null
  severity: SeverityLevel
  policy_topic: string | null
  rule_reference: string | null
  raw_matches: string[]
}

export interface CopilotQueryResponse {
  session_id: string
  query: string
  intent: AgentIntent
  confidence: number
  entities: AgentEntities
  response: string
  suggested_action: string | null
  execution_trace: TraceStep[]
  latency_ms: number
  timestamp: string
}

export interface IntentCatalogItem {
  intent: AgentIntent
  label: string
  description: string
  example_queries: string[]
  target_handler: string
}

export interface CopilotHealthResponse {
  status: string
  engine: string
  langgraph_available: boolean
  supported_intents_count: number
  rag_corpus_indexed: boolean
}

export const copilotApi = {
  query: async (query: string, sessionId?: string, context?: Record<string, any>, token?: string) => {
    let authToken = token
    if (!authToken) {
      authToken = (await fetchAuthToken('ADMIN')) || undefined
    }
    const headers: Record<string, string> = {}
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }
    return apiRequest<CopilotQueryResponse>('/copilot/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, session_id: sessionId, context }),
    })
  },
  intents: () => apiRequest<IntentCatalogItem[]>('/copilot/intents'),
  health: () => apiRequest<CopilotHealthResponse>('/copilot/health'),
}
