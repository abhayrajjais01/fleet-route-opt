import React, { useState, useEffect, useRef } from 'react'
import {
  copilotApi,
  AgentIntent,
  AgentEntities,
  TraceStep,
  CopilotQueryResponse,
} from '../../lib/copilotApi'

export interface CopilotMsg {
  id: string
  sender: 'user' | 'assistant'
  content: string
  timestamp: string
  intent?: AgentIntent
  confidence?: number
  entities?: AgentEntities
  suggestedAction?: string | null
  executionTrace?: TraceStep[]
  latencyMs?: number
  traceSummary?: string
}

interface CopilotCommandCenterProps {
  vehicles: any[]
  drivers: any[]
  shipments: any[]
  hubs: any[]
  audit: any[]
  setSection: (section: string) => void
  activeRole: string
  authToken: string | null
}

const INTENT_CONFIG: Record<
  AgentIntent,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  VEHICLE_BREAKDOWN: {
    label: 'Vehicle Breakdown',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: '🚨',
  },
  TRAFFIC_DELAY: {
    label: 'Traffic Delay',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: '⏳',
  },
  POLICY_QUERY: {
    label: 'Compliance SOP',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '📜',
  },
  REROUTE_REQUEST: {
    label: 'Dynamic Reroute',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '🔄',
  },
  GENERAL_INQUIRY: {
    label: 'General Inquiry',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: '🤖',
  },
  OFF_TOPIC: {
    label: 'Off-Topic',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    icon: '💬',
  },
}

export const CopilotCommandCenter: React.FC<CopilotCommandCenterProps> = ({
  vehicles,
  drivers,
  shipments,
  hubs,
  setSection,
  authToken,
}) => {
  const [messages, setMessages] = useState<CopilotMsg[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        "Welcome to the **LangGraph Dispatcher Copilot (US-005)**.\n\n" +
        "I provide deterministic intent routing, entity extraction, and multi-agent StateGraph coordination for your fleet:\n" +
        "• **Emergency Disruptions**: Report breakdowns or engine stalls\n" +
        "• **Corridor Delays**: Inject dynamic traffic delay buffers\n" +
        "• **Regulatory SOPs**: RAG-grounded retrieval from verified compliance manuals\n" +
        "• **Dynamic Optimization**: Request instant stop resequencing\n\n" +
        "Try typing a command or clicking one of the scenario chips below.",
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [openTraces, setOpenTraces] = useState<Record<string, boolean>>({})
  const [engineInfo, setEngineInfo] = useState<{ engine: string; available: boolean } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    copilotApi
      .health()
      .then((h) => setEngineInfo({ engine: h.engine, available: h.langgraph_available }))
      .catch(() => setEngineInfo({ engine: 'Deterministic StateGraph Engine', available: true }))
  }, [])

  const quickScenarios = [
    { label: '🚨 Vehicle V-101 breakdown', q: 'Vehicle V-101 has broken down on NH-48 with flat tire' },
    { label: '⏳ Traffic delay on Highway', q: 'Heavy traffic congestion on Eastern Express Highway, 45 minute delay for Vehicle V-102' },
    { label: '📜 Maximum driver shift policy', q: 'What is the maximum driver driving limit before mandatory rest break?' },
    { label: '🔄 Reroute vehicle V-103', q: 'Reroute vehicle V-103 to avoid flooded highway and detour to next stop' },
    { label: '📦 Unassigned shipments', q: 'Which shipments are unassigned and need routing?' },
    { label: "📊 Today's KPIs", q: "Give me a performance summary for today" },
  ]

  function toggleTrace(id: string) {
    setOpenTraces((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSend(text: string) {
    if (!text.trim() || loading) return
    const userMsgId = Date.now().toString()
    const timestamp = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', content: text, timestamp },
    ])
    setInput('')
    setLoading(true)

    try {
      const resp: CopilotQueryResponse = await copilotApi.query(
        text,
        undefined,
        undefined,
        authToken || undefined
      )
      const assistantMsgId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          content: resp.response,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          intent: resp.intent,
          confidence: resp.confidence,
          entities: resp.entities,
          suggestedAction: resp.suggested_action,
          executionTrace: resp.execution_trace,
          latencyMs: resp.latency_ms,
        },
      ])
    } catch {
      // Local fallback in case backend is completely offline
      const assistantMsgId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          content:
            "⚡ Local Fallback: Could not reach backend API server. " +
            "Please ensure the FastAPI backend is running on :8000.",
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          intent: 'OFF_TOPIC',
          confidence: 0.5,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const statBar = [
    {
      label: 'Vehicles Active',
      value: vehicles.filter((v) => v.current_status !== 'AVAILABLE' && v.current_status !== 'DECOMMISSIONED').length,
      color: '#2563eb',
    },
    {
      label: 'In Transit',
      value: shipments.filter((s) => s.status === 'IN_TRANSIT').length,
      color: '#7c3aed',
    },
    {
      label: 'Unassigned',
      value: shipments.filter((s) => s.status === 'UNASSIGNED').length,
      color: '#dc2626',
    },
    {
      label: 'Drivers On Duty',
      value: drivers.filter((d) => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length,
      color: '#15803d',
    },
    { label: 'OTIF Rate', value: '99.2%', color: '#15803d' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/40">
      {/* Top Telemetry Stat Bar */}
      <div className="flex-shrink-0 flex items-center border-b border-slate-200 bg-white shadow-xs">
        {statBar.map((s, i) => (
          <div
            key={s.label}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 ${
              i < statBar.length - 1 ? 'border-r border-slate-200' : ''
            }`}
          >
            <p className="text-lg font-black" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
              {s.label}
            </p>
          </div>
        ))}
        <div className="px-4 flex items-center gap-2 border-l border-slate-200">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-violet-50 text-violet-700 border border-violet-200">
            <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
            {engineInfo?.engine || 'LangGraph StateGraph'}
          </span>
          <button
            onClick={() => setSection('shipments')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs"
          >
            + New Shipment
          </button>
        </div>
      </div>

      {/* Main Copilot Console Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Live Assets & Shipments Sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Live Shipments
            </p>
            <span className="text-[10px] font-mono text-slate-400">
              {shipments.filter((s) => s.status !== 'DELIVERED').length} Active
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {shipments
              .filter((s) => s.status !== 'DELIVERED')
              .map((s) => (
                <div
                  key={s.id}
                  className="px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setSection('shipments')}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[11px] font-bold text-blue-700">
                      {s.tracking_number}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        s.status === 'UNASSIGNED'
                          ? 'bg-rose-100 text-rose-700'
                          : s.status === 'IN_TRANSIT'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 font-medium truncate">
                    {s.customer_name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {s.weight_kg}kg • <span className="font-semibold">{s.priority}</span>
                  </p>
                </div>
              ))}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-[11px]">
            <button
              onClick={() => setSection('compliance')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Compliance Inspector →
            </button>
            <button
              onClick={() => setSection('audit')}
              className="text-slate-500 hover:text-slate-700"
            >
              Audit Trail
            </button>
          </div>
        </div>

        {/* Right Chat Stream & Reasoning Console */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/60">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map((m) => {
              const intentCfg = m.intent ? INTENT_CONFIG[m.intent] : null
              const isAssistant = m.sender === 'assistant'
              const isTraceOpen = !!openTraces[m.id]

              return (
                <div
                  key={m.id}
                  className={`flex gap-3.5 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-xs ${
                      isAssistant ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isAssistant ? 'AI' : 'AJ'}
                  </div>

                  <div className="max-w-[78%] space-y-2">
                    {/* Message Bubble */}
                    <div
                      className={`px-4 py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-xs ${
                        isAssistant
                          ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                          : 'bg-blue-600 text-white rounded-tr-xs'
                      }`}
                    >
                      {/* Intent Classification Header */}
                      {intentCfg && (
                        <div className="mb-2.5 pb-2 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${intentCfg.bg} ${intentCfg.text} ${intentCfg.border} flex items-center gap-1`}
                            >
                              <span>{intentCfg.icon}</span>
                              <span>{intentCfg.label}</span>
                            </span>
                            {m.confidence !== undefined && (
                              <span className="text-[10px] font-mono font-semibold text-slate-400">
                                {Math.round(m.confidence * 100)}% match
                              </span>
                            )}
                          </div>

                          {m.latencyMs !== undefined && (
                            <span className="text-[10px] font-mono text-slate-400">
                              ⚡ {m.latencyMs} ms
                            </span>
                          )}
                        </div>
                      )}

                      {/* Content with Markdown-style bold parsing */}
                      <div className="space-y-1">
                        {m.content.split('\n\n').map((paragraph, pIdx) => (
                          <p key={pIdx}>
                            {paragraph.split('**').map((part, i) =>
                              i % 2 === 1 ? (
                                <strong key={i} className="font-bold text-slate-900">
                                  {part}
                                </strong>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        ))}
                      </div>

                      {/* Extracted Entities Pills */}
                      {m.entities && m.entities.raw_matches && m.entities.raw_matches.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">
                            Entities:
                          </span>
                          {m.entities.vehicle_id && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                              🚛 {m.entities.vehicle_id}
                            </span>
                          )}
                          {m.entities.delay_minutes && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                              ⏳ {m.entities.delay_minutes} min
                            </span>
                          )}
                          {m.entities.location && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              📍 {m.entities.location}
                            </span>
                          )}
                          {m.entities.severity && m.entities.severity !== 'LOW' && (
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                                m.entities.severity === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-orange-100 text-orange-800 border-orange-300'
                              }`}
                            >
                              🔥 {m.entities.severity}
                            </span>
                          )}
                          {m.entities.policy_topic && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200">
                              📜 {m.entities.policy_topic}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Suggested Action Box */}
                      {m.suggestedAction && (
                        <div className="mt-3 p-2.5 rounded-xl bg-violet-50/80 border border-violet-200 flex items-center justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <span className="text-base">💡</span>
                            <div>
                              <p className="text-[10px] font-bold text-violet-800 uppercase tracking-wide">
                                Suggested Operational Action
                              </p>
                              <p className="text-xs text-violet-900 font-medium">
                                {m.suggestedAction}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (m.intent === 'VEHICLE_BREAKDOWN' || m.intent === 'TRAFFIC_DELAY') {
                                setSection('shipments')
                              } else if (m.intent === 'POLICY_QUERY') {
                                setSection('compliance')
                              } else {
                                setSection('workflow')
                              }
                            }}
                            className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition shadow-xs"
                          >
                            Execute →
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expandable StateGraph Execution Trace */}
                    {m.executionTrace && m.executionTrace.length > 0 && (
                      <div className="px-1">
                        <button
                          onClick={() => toggleTrace(m.id)}
                          className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-slate-500 hover:text-slate-800 transition"
                        >
                          <span>{isTraceOpen ? '▾' : '▸'}</span>
                          <span>StateGraph Trace ({m.executionTrace.length} steps, {m.latencyMs}ms)</span>
                        </button>

                        {isTraceOpen && (
                          <div className="mt-1.5 p-3 rounded-xl bg-white border border-slate-200 text-xs font-mono space-y-2 shadow-xs">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              LangGraph Workflow Execution Sequence
                            </p>
                            <div className="space-y-2">
                              {m.executionTrace.map((step) => (
                                <div
                                  key={step.step}
                                  className="flex items-start gap-2 pb-1.5 border-b border-slate-100 last:border-0"
                                >
                                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    {step.step}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-blue-700">{step.node}</span>
                                      <span className="text-[10px] text-slate-400">
                                        +{step.latency_ms} ms
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600">{step.action}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 px-1">{m.timestamp}</p>
                  </div>
                </div>
              )
            })}

            {loading && (
              <div className="flex gap-3.5">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  AI
                </div>
                <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-xs shadow-xs flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Routing query through StateGraph...
                  </span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Scenario Quick Action Chips */}
          <div className="flex-shrink-0 px-6 py-2 flex gap-2 flex-wrap border-t border-slate-200 bg-white">
            <span className="text-[10px] uppercase font-bold text-slate-400 py-1 mr-1">
              Test Prompts:
            </span>
            {quickScenarios.map((a) => (
              <button
                key={a.label}
                onClick={() => handleSend(a.q)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1 border border-slate-200 rounded-full text-slate-700 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors font-medium disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Natural Language Query Bar */}
          <div className="flex-shrink-0 px-6 pb-4 pt-2 bg-white flex gap-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
              placeholder="Ask Copilot: 'Vehicle V-101 breakdown on NH-48', 'Heavy traffic on expressway', 'Check driver rest rule'..."
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition bg-slate-50 shadow-inner"
            />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || loading}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold transition-colors shadow-xs"
            >
              Send Command
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
