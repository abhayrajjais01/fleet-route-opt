import React, { useState, useRef, useEffect, useMemo } from 'react'
import { API_BASE } from '../../lib/api'
import { buildDisruptionRequest, proposalsApi, type ProposalCard as ProposalCardData } from '../../lib/proposalsApi'
import type { Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import ProposalCard from './ProposalCard'

// Intents the Optimization Agent can turn into a re-route proposal (Week 11)
const DISRUPTION_INTENTS = new Set(['VEHICLE_BREAKDOWN', 'TRAFFIC_DELAY', 'REROUTE_REQUEST'])

interface CopilotSlidingDrawerProps {
  isOpen: boolean
  onToggle: () => void
  authToken: string | null
  activeRole?: string
  /** Live plan used to build re-route proposals (Week 11). */
  fleet?: { shipments: Shipment[]; vehicles: Vehicle[]; drivers: Driver[]; hubs: Hub[] }
  /** Called when the dispatcher accepts a proposal; applies it to the live plan. */
  onApplyProposal?: (card: ProposalCardData, now: string) => Promise<string | void>
  /** Render the built-in floating launcher. Off when the host page provides its own (e.g. a header button). */
  showTrigger?: boolean
}

interface MessageItem {
  id: string
  sender: 'user' | 'copilot'
  text: string
  intent?: string
  confidence?: number
  latencyMs?: number
  guardrail?: {
    passed: boolean
    status: string
    confidence_pct: number
    similarity_score: number
    threshold: number
    citations: Array<{
      doc_id: string
      doc_title: string
      section_number: string
      heading: string
      score: number
      confidence_pct: number
      excerpt: string
    }>
    reason: string
  }
  compliance?: {
    is_compliant: boolean
    compliance_score_pct: number
    violations: Array<{
      rule_code: string
      sop_doc_id: string
      sop_section: string
      severity: string
      description: string
      remediation: string
    }>
    recommendations: string[]
  }
  proposal?: ProposalCardData
  proposalNow?: string
  applyNote?: string
  executionTrace?: Array<{
    step: number
    node: string
    action: string
    latency_ms: number
    details: any
  }>
  timestamp: string
}

const QUICK_PROMPTS = [
  'What is the maximum driver driving limit before mandatory rest?',
  'What are the cold chain temperature transit holdover rules?',
  'Can we co-load Class 3 flammable liquids with oxidizers?',
  'Show all unassigned high priority shipments needing routing',
]

export default function CopilotSlidingDrawer({
  isOpen,
  onToggle,
  authToken,
  activeRole = 'DISPATCHER',
  fleet,
  onApplyProposal,
  showTrigger = true,
}: CopilotSlidingDrawerProps) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'welcome',
      sender: 'copilot',
      text: 'Hello Dispatcher! I am your AI Copilot powered by LangGraph Multi-Agent StateGraph and verified RAG SOP knowledge base. How can I assist with routes, compliance, or fleet disruptions?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [inputQuery, setInputQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isOpen])

  // A disruption prompt about a vehicle that is actually on the road right now
  const onRoadPlate = useMemo(() => {
    if (!fleet) return null
    const busy = new Set(fleet.shipments.filter(s => s.assigned_vehicle_id && ['ASSIGNED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status)).map(s => s.assigned_vehicle_id))
    return fleet.vehicles.find(v => busy.has(v.id))?.plate_number ?? null
  }, [fleet])
  const quickPrompts = onRoadPlate
    ? [`${onRoadPlate} broke down near Sion`, `${onRoadPlate} stuck in traffic, 45 min delay`, ...QUICK_PROMPTS]
    : QUICK_PROMPTS

  /** Week 11: ask the Optimization Agent for a proposal card for a disruption message. */
  async function proposalFor(q: string): Promise<Pick<MessageItem, 'proposal' | 'proposalNow'> & { note?: string }> {
    if (!fleet) return {}
    const body = buildDisruptionRequest(q, fleet.shipments, fleet.vehicles, fleet.drivers, fleet.hubs)
    if (!body) return { note: 'No vehicle is on the road right now, so there is nothing to re-route. Dispatch routes from the Route Planner first.' }
    try {
      return { proposal: await proposalsApi.create(body, authToken), proposalNow: body.now }
    } catch (e) {
      return { note: `I couldn't build a re-route proposal: ${(e as Error).message}` }
    }
  }

  async function decideProposal(msgId: string, card: ProposalCardData, decision: 'ACCEPT' | 'REJECT', now: string) {
    // The plan is saved before the proposal is marked accepted: if saving is refused (someone changed the plan first),
    // this throws, the card shows why, and it stays open.
    const note = decision === 'ACCEPT' ? await onApplyProposal?.(card, now) : undefined
    const updated = await proposalsApi.decide(card.card_id, decision, authToken)
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, proposal: updated, applyNote: note || undefined } : m)))
  }

  async function handleSendQuery(queryToSend?: string) {
    const q = (queryToSend || inputQuery).trim()
    if (!q || isLoading) return

    const userMsg: MessageItem = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInputQuery('')
    setIsLoading(true)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const res = await fetch(`${API_BASE}/api/v1/copilot/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: q,
          context: { role: activeRole },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const extra = DISRUPTION_INTENTS.has(data.intent) ? await proposalFor(q) : {}
        const copilotMsg: MessageItem = {
          id: `cop-${Date.now()}`,
          sender: 'copilot',
          text: extra.note ? `${data.response}

${extra.note}` : data.response,
          proposal: extra.proposal,
          proposalNow: extra.proposalNow,
          intent: data.intent,
          confidence: data.confidence,
          latencyMs: data.latency_ms,
          guardrail: data.guardrail,
          compliance: data.compliance,
          executionTrace: data.execution_trace,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, copilotMsg])
      } else {
        const err = await res.json().catch(() => ({ detail: 'Copilot service error' }))
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'copilot',
            text: `⚠ ${err.detail || 'Service unavailable'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `net-err-${Date.now()}`,
          sender: 'copilot',
          text: `Connection error: ${err.message || 'Unable to connect to AI Copilot'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* ── Persistent Floating AI Pill Button (Always accessible) ── */}
      {showTrigger && <button
        onClick={onToggle}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-slate-900 text-white shadow-2xl border border-slate-700/80 hover:bg-slate-800 active:scale-95 transition-all group"
        title="Open AI Copilot Sliding Drawer"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-400 flex items-center justify-center text-xs font-bold text-white shadow-inner">
          ✦
        </div>
        <span className="text-xs font-bold tracking-wide">AI Copilot</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 group-hover:animate-ping" />
      </button>}

      {/* ── Backdrop Overlay ── */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity"
        />
      )}

      {/* ── Sliding Drawer Flyout (Right Edge) ── */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col font-sans transition-transform duration-300 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-400 flex items-center justify-center text-white text-sm font-bold shadow-md">
              ✦
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                LangGraph AI Copilot
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  StateGraph
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Zero-Hallucination Guardrails & Policy Agent</p>
            </div>
          </div>

          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`${msg.proposal ? 'w-full' : 'max-w-[90%]'} rounded-2xl p-3.5 text-xs ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-md'
                    : 'bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/80 shadow-md'
                }`}
              >
                {/* Header for Copilot message */}
                {msg.sender === 'copilot' && msg.intent && (
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-700/60 text-[10px]">
                    <span className="font-bold text-blue-400">{msg.intent}</span>
                    {msg.latencyMs !== undefined && (
                      <span className="font-mono text-slate-400">⚡ {Math.round(msg.latencyMs)} ms</span>
                    )}
                  </div>
                )}

                {/* Main Text Content */}
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                {/* Zero-Hallucination Guardrail Banner */}
                {msg.guardrail && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60">
                    <div
                      className={`rounded-xl p-2.5 flex items-center justify-between text-[11px] font-semibold border ${
                        msg.guardrail.passed
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{msg.guardrail.passed ? '✓' : '⚠'}</span>
                        <span>
                          {msg.guardrail.passed
                            ? `Grounded in SOP Library (${msg.guardrail.confidence_pct}% Match)`
                            : 'Zero-Hallucination Guardrail Intervened'}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] opacity-75">
                        Thresh: {(msg.guardrail.threshold * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Citation Cards */}
                    {msg.guardrail.citations.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Official SOP Citations ({msg.guardrail.citations.length})
                        </p>
                        {msg.guardrail.citations.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-900/60 border border-slate-700/70 text-[11px]"
                          >
                            <div className="flex items-center justify-between text-slate-300 font-bold">
                              <span>
                                {c.doc_id} {c.section_number}
                              </span>
                              <span className="text-[10px] text-emerald-400 font-mono">
                                {c.confidence_pct}% confidence
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-semibold">{c.heading}</p>
                            <p className="text-[10px] text-slate-400/90 italic mt-1 line-clamp-2">
                              "{c.excerpt}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Compliance Violations Report */}
                {msg.compliance && msg.compliance.violations.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-400">
                      <span>⚠ Regulatory Violations Detected</span>
                      <span>Score: {msg.compliance.compliance_score_pct}%</span>
                    </div>
                    {msg.compliance.violations.map((v, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-rose-300">
                          <span>{v.rule_code}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/20">{v.severity}</span>
                        </div>
                        <p className="text-slate-300">{v.description}</p>
                        <p className="text-emerald-400 text-[10px]">Fix: {v.remediation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Week 11: Structured action proposal with route diff */}
                {msg.proposal && (
                  <ProposalCard
                    card={msg.proposal}
                    onDecide={d => decideProposal(msg.id, msg.proposal!, d, msg.proposalNow ?? '08:00')}
                  />
                )}
                {msg.applyNote && <p className="mt-2 text-[11px] text-amber-300">{msg.applyNote}</p>}

                {/* Multi-Agent Execution Trace Toggle */}
                {msg.executionTrace && msg.executionTrace.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-700/50">
                    <button
                      onClick={() => setExpandedTraceId(expandedTraceId === msg.id ? null : msg.id)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
                    >
                      <span>{expandedTraceId === msg.id ? '▼' : '▶'}</span>
                      <span>Execution Trace ({msg.executionTrace.length} agent nodes)</span>
                    </button>

                    {expandedTraceId === msg.id && (
                      <div className="mt-2 space-y-1.5 pl-2 border-l border-blue-500/30 text-[10px]">
                        {msg.executionTrace.map(step => (
                          <div key={step.step} className="font-mono text-slate-400">
                            <span className="text-blue-300 font-bold">[{step.node}]</span> {step.action}{' '}
                            <span className="text-slate-500">({step.latency_ms} ms)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-slate-800 text-slate-400 text-xs w-48 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>Orchestrating agents...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/60 overflow-x-auto flex gap-1.5 no-scrollbar">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSendQuery(prompt)}
              disabled={isLoading}
              className="whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <form
            onSubmit={e => {
              e.preventDefault()
              handleSendQuery()
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={e => setInputQuery(e.target.value)}
              placeholder="Ask Copilot about SOPs, Hazmat, HOS, or fleet status..."
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md"
            >
              Send
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
