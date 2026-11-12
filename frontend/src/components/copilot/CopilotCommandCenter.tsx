import type { AdminSection } from '../../lib/types'
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
  setSection: (section: AdminSection) => void
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
  activeRole,
  authToken,
}) => {
  const [messages, setMessages] = useState<CopilotMsg[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        "Hi! I'm your dispatch assistant. Tell me what's happening on the road and I'll suggest the next step.\n\n" +
        "• **A breakdown or accident**: I'll work out who should take over the stops\n" +
        "• **A traffic delay**: I'll show which deliveries are affected\n" +
        "• **A policy question**: I'll answer from the verified SOPs and cite them\n" +
        "• **Re-routing**: I'll suggest a better stop order",
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
    { label: 'V-101 broke down', q: 'Vehicle V-101 has broken down on NH-48 with flat tire' },
    { label: 'Traffic delay on the highway', q: 'Heavy traffic congestion on Eastern Express Highway, 45 minute delay for Vehicle V-102' },
    { label: 'How long can a driver drive?', q: 'What is the maximum driver driving limit before mandatory rest break?' },
    { label: 'Re-route V-103', q: 'Reroute vehicle V-103 to avoid flooded highway and detour to next stop' },
    { label: 'What still needs planning?', q: 'Which shipments are unassigned and need routing?' },
    { label: "How are we doing today?", q: "Give me a performance summary for today" },
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
      const operationalContext = {
        shipments: shipments.map((s) => ({
          id: s.id,
          tracking_number: s.tracking_number,
          customer_name: s.customer_name,
          destination_address: s.destination_address,
          weight_kg: s.weight_kg,
          priority: s.priority,
          status: s.status,
          time_window_start: s.time_window_start,
          time_window_end: s.time_window_end,
        })),
        total_vehicles_count: vehicles.length,
        active_vehicles_count: vehicles.filter((v) => v.current_status !== 'AVAILABLE' && v.current_status !== 'DECOMMISSIONED').length,
        total_drivers_count: drivers.length,
        on_duty_drivers_count: drivers.filter((d) => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length,
        in_transit_shipments_count: shipments.filter((s) => s.status === 'IN_TRANSIT').length,
        unassigned_shipments_count: shipments.filter((s) => s.status === 'UNASSIGNED').length,
        otif_rate: '99.2%',
        active_role: activeRole,
      }

      const resp: CopilotQueryResponse = await copilotApi.query(
        text,
        undefined,
        operationalContext,
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
    } catch (err: any) {
      const errMsg = err?.message || 'Could not reach backend API server.'
      const assistantMsgId = (Date.now() + 1).toString()
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          sender: 'assistant',
          content: `I couldn't reach the assistant just now (${errMsg}). Nothing has changed, so you can try again in a moment.`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          intent: 'OFF_TOPIC',
          confidence: 0.0,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const onRoad = vehicles.filter((v) => v.current_status === 'IN_TRANSIT').length
  const waiting = shipments.filter((s) => s.status === 'UNASSIGNED').length
  const onDuty = drivers.filter((d) => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length
  const glance = [
    { value: onRoad, label: onRoad === 1 ? 'vehicle on the road' : 'vehicles on the road', go: 'tracking' as AdminSection, cta: 'Track', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', tint: 'bg-violet-50 text-violet-600' },
    { value: waiting, label: waiting === 1 ? 'order waiting to be planned' : 'orders waiting to be planned', go: 'routes' as AdminSection, cta: 'Plan', tone: waiting > 0 ? 'attention' : undefined, icon: 'M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7.5 12 12l8.7-4.5M12 22V12', tint: 'bg-amber-50 text-amber-600' },
    { value: onDuty, label: onDuty === 1 ? 'driver on duty' : 'drivers on duty', go: 'fleet' as AdminSection, cta: 'View', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', tint: 'bg-sky-50 text-sky-600' },
    { value: '99.2%', label: 'on time and in full', go: 'reports' as AdminSection, cta: 'Reports', icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3', tint: 'bg-emerald-50 text-emerald-600' },
  ]
  const STATUS_ORDER: Record<string, number> = { UNASSIGNED: 0, FAILED: 1, ARRIVED: 2, IN_TRANSIT: 3, ASSIGNED: 4 }
  const STATUS_LABEL: Record<string, { text: string; dot: string }> = {
    UNASSIGNED: { text: 'Needs planning', dot: 'bg-amber-400' },
    FAILED: { text: 'Delivery failed', dot: 'bg-red-400' },
    ARRIVED: { text: 'At the stop', dot: 'bg-violet-400' },
    IN_TRANSIT: { text: 'On the way', dot: 'bg-blue-400' },
    ASSIGNED: { text: 'Scheduled', dot: 'bg-slate-300' },
  }
  const active = shipments
    .filter((s) => s.status !== 'DELIVERED')
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
  const initials = (activeRole === 'ADMIN' ? 'AJ' : activeRole === 'FLEET_MANAGER' ? 'KS' : activeRole === 'DISPATCHER' ? 'MN' : 'RK')

  const Bold = ({ text }: { text: string }) => (
    <>{text.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-800">{part}</strong> : <span key={i}>{part}</span>)}</>
  )

  return (
    <div className="h-full overflow-hidden flex flex-col gap-5 px-6 pt-5 pb-6">
      {/* Day at a glance */}
      <div className="flex-shrink-0 grid grid-cols-2 xl:grid-cols-4 gap-3">
        {glance.map((g) => (
          <button key={g.label} onClick={() => setSection(g.go)}
            className="group text-left rounded-2xl bg-white border border-slate-200 px-5 py-4 hover:border-violet-200 hover:shadow-md transition flex items-center gap-4">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${g.tint}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d={g.icon} /></svg>
            </span>
            <span className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-800 tabular-nums">{g.value}</span>
              {g.tone === 'attention' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 -translate-y-1" />}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-sm text-slate-500">{g.label}</span>
              <span className="text-xs text-violet-600 opacity-0 group-hover:opacity-100 transition">{g.cta} →</span>
            </div>
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex gap-5">
        {/* Conversation */}
        <section className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden" aria-label="Dispatch assistant">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
              {messages.map((m) => {
                const intentCfg = m.intent && m.intent !== 'OFF_TOPIC' ? INTENT_CONFIG[m.intent] : null
                const isAssistant = m.sender === 'assistant'
                const isTraceOpen = !!openTraces[m.id]
                return (
                  <div key={m.id} className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${isAssistant ? 'bg-violet-50 text-violet-600 ring-1 ring-violet-100' : 'bg-slate-100 text-slate-600'}`}>
                      {isAssistant
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
                        : initials}
                    </div>
                    <div className={`max-w-[80%] space-y-2 ${isAssistant ? '' : 'items-end flex flex-col'}`}>
                      <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${isAssistant ? 'bg-slate-50 text-slate-700 rounded-tl-md' : 'bg-violet-600 text-white rounded-tr-md'}`}>
                        {intentCfg && (
                          <p className="mb-1.5 text-xs text-slate-500">
                            {intentCfg.label}{m.confidence !== undefined && <span className="text-slate-400"> · {Math.round(m.confidence * 100)}% sure</span>}
                          </p>
                        )}
                        <div className="space-y-2 whitespace-pre-line">
                          {m.content.split('\n\n').map((paragraph, pIdx) => <p key={pIdx}>{isAssistant ? <Bold text={paragraph} /> : paragraph}</p>)}
                        </div>

                        {m.entities && m.entities.raw_matches && m.entities.raw_matches.length > 0 && (
                          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                            {[m.entities.vehicle_id && `Vehicle ${m.entities.vehicle_id}`,
                              m.entities.delay_minutes && `${m.entities.delay_minutes} min delay`,
                              m.entities.location,
                              m.entities.severity && m.entities.severity !== 'LOW' && `${m.entities.severity.toLowerCase()} severity`,
                              m.entities.policy_topic && m.entities.policy_topic.replace(/_/g, ' ').toLowerCase(),
                            ].filter(Boolean).map((t) => (
                              <span key={String(t)} className="text-xs px-2 py-0.5 rounded-full bg-white ring-1 ring-slate-200 text-slate-600">{t}</span>
                            ))}
                          </div>
                        )}

                        {m.suggestedAction && (
                          <div className="mt-3 p-3 rounded-xl bg-white ring-1 ring-violet-100 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs text-violet-700">Suggested next step</p>
                              <p className="text-sm text-slate-700">{m.suggestedAction}</p>
                            </div>
                            <button
                              onClick={() => setSection(m.intent === 'VEHICLE_BREAKDOWN' || m.intent === 'REROUTE_REQUEST' ? 'routes' : m.intent === 'TRAFFIC_DELAY' ? 'tracking' : m.intent === 'POLICY_QUERY' ? 'compliance' : 'routes')}
                              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition">
                              Open
                            </button>
                          </div>
                        )}
                      </div>

                      {m.executionTrace && m.executionTrace.length > 0 && (
                        <div className="px-1">
                          <button onClick={() => toggleTrace(m.id)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3 h-3 transition-transform ${isTraceOpen ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
                            How I worked this out · {m.executionTrace.length} steps · {m.latencyMs} ms
                          </button>
                          {isTraceOpen && (
                            <ol className="mt-2 ml-1 pl-4 border-l border-slate-200 space-y-2">
                              {m.executionTrace.map((step) => (
                                <li key={step.step} className="text-xs">
                                  <span className="font-medium text-slate-700">{step.node}</span>
                                  <span className="text-slate-400"> · {step.latency_ms} ms</span>
                                  <p className="text-slate-500">{step.action}</p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-slate-400 px-1">{m.timestamp}</p>
                    </div>
                  </div>
                )
              })}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-50 ring-1 ring-violet-100" />
                  <div className="px-4 py-3 bg-slate-50 rounded-2xl rounded-tl-md flex items-center gap-2 text-sm text-slate-500">
                    Thinking it through
                    <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="flex-shrink-0 border-t border-slate-100 px-6 pt-3 pb-5">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 flex-wrap mb-3">
                <span className="text-xs text-slate-400 py-1">Try asking</span>
                {quickScenarios.map((a) => (
                  <button key={a.label} onClick={() => handleSend(a.q)} disabled={loading}
                    className="text-xs px-3 py-1 rounded-full bg-slate-50 ring-1 ring-slate-200 text-slate-600 hover:bg-violet-50 hover:ring-violet-200 hover:text-violet-700 transition disabled:opacity-50">
                    {a.label}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleSend(input) }}
                className="flex items-center gap-2 rounded-2xl bg-slate-50 ring-1 ring-slate-200 focus-within:ring-violet-300 focus-within:bg-white transition pl-4 pr-1.5 py-1.5">
                <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message the dispatch assistant"
                  placeholder="Describe what's happening, e.g. “V-101 broke down on NH-48”"
                  className="flex-1 bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 outline-none py-1.5" />
                <button type="submit" disabled={!input.trim() || loading} aria-label="Send"
                  className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </form>
              {engineInfo && <p className="mt-2 text-center text-xs text-slate-400">Runs on the {engineInfo.engine}. Suggestions always wait for your approval.</p>}
            </div>
          </div>
        </section>

        {/* Active shipments */}
        <aside className="hidden lg:flex w-80 flex-shrink-0 flex-col rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden" aria-label="Active shipments">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Active shipments</p>
              <p className="text-xs text-slate-400">{active.length} not yet delivered</p>
            </div>
            <button onClick={() => setSection('shipments')} className="text-sm text-violet-600 hover:text-violet-800">New</button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {active.map((s) => {
              const st = STATUS_LABEL[s.status] ?? { text: s.status, dot: 'bg-slate-300' }
              return (
                <button key={s.id} onClick={() => setSection(s.status === 'UNASSIGNED' ? 'routes' : 'shipments')}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700 truncate">{s.customer_name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap"><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.text}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{s.tracking_number} · {s.weight_kg} kg · {s.time_window_start}–{s.time_window_end}</p>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
