// ─── RAG COMPLIANCE INSPECTOR (US-006, Track A: Manthan Nimodiya) ─────────────
// Semantic search over the verified SOP knowledge base. Every answer shown here is a verbatim
// excerpt returned by the backend vector store, with its source document, § section and similarity
// score — nothing is generated, so nothing can be hallucinated.
import { useEffect, useState, type ReactNode } from 'react'
import {
  ragApi,
  type KnowledgeBaseStats,
  type PolicyCategory,
  type PolicyCategoryInfo,
  type PolicyCitation,
  type PolicySearchResponse,
} from '../../lib/ragApi'

const CATEGORY_STYLE: Record<PolicyCategory, { bg: string; text: string; icon: string }> = {
  HAZMAT: { bg: '#fef2f2', text: '#b91c1c', icon: '☣️' },
  DRIVER_REST: { bg: '#fffbeb', text: '#b45309', icon: '🛌' },
  COLD_CHAIN: { bg: '#ecfeff', text: '#0e7490', icon: '❄️' },
  VEHICLE_SAFETY: { bg: '#f0fdf4', text: '#15803d', icon: '🛻' },
  OPERATIONS: { bg: '#eff6ff', text: '#1d4ed8', icon: '🧭' },
}

const EXAMPLE_QUERIES = [
  'Placard weight threshold for hazmat loads',
  'How long can a driver drive before a break?',
  'Vaccine temperature excursion procedure',
  'Vehicle broke down — what is the procedure?',
  'Can oxidizers travel with flammable liquids?',
  'When is a shipment an SLA breach?',
]

// Similarity bands calibrated on the WikiQA-style benchmark (backend/app/services/rag/eval_set.json):
// every answerable question's best passage scored ≥ 0.16, every off-topic question scored 0.
function confidence(score: number): { label: string; color: string } {
  if (score >= 0.25) return { label: 'High match', color: '#15803d' }
  if (score >= 0.12) return { label: 'Medium match', color: '#b45309' }
  return { label: 'Weak match', color: '#b91c1c' }
}

const STOP = new Set(['the', 'and', 'for', 'what', 'how', 'can', 'when', 'with', 'does', 'must', 'are', 'before', 'long', 'is'])

/** Highlights words in the excerpt that share a stem with a query word (mirrors the backend's light stemming). */
function highlight(text: string, query: string): ReactNode {
  const stems = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(w => w.slice(0, Math.max(3, Math.min(w.length, w.length > 5 ? w.length - 3 : w.length))))
  if (!stems.length) return text
  const re = new RegExp(`\\b(${stems.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[a-z]*`, 'gi')
  const parts: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index))
    parts.push(<mark key={m.index} className="bg-amber-100 text-slate-900 rounded px-0.5">{m[0]}</mark>)
    last = m.index! + m[0].length
  }
  parts.push(text.slice(last))
  return parts
}

function CategoryBadge({ code, label }: { code: PolicyCategory; label?: string }) {
  const s = CATEGORY_STYLE[code]
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.text}22` }} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap">
      {s.icon} {label ?? code.replace(/_/g, ' ')}
    </span>
  )
}

function ScoreMeter({ score }: { score: number }) {
  const c = confidence(score)
  // Scores above ~0.4 are rare for TF-IDF on short queries, so 0.4 maps to a full bar.
  const pct = Math.min(100, Math.round((score / 0.4) * 100))
  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></div>
      <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: c.color }}>{c.label}</span>
      <span className="font-mono text-[10px] text-slate-400">{score.toFixed(3)}</span>
    </div>
  )
}

function CitationCard({ c, query, rank }: { c: PolicyCitation; query: string; rank: number }) {
  const best = rank === 1
  return (
    <div className={`rounded-xl p-4 border transition-colors ${best ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${best ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{best ? 'BEST MATCH' : `#${rank}`}</span>
        <span className="font-mono text-xs font-bold text-slate-700">{c.doc_id} {c.section}</span>
        <span className="text-xs font-semibold text-slate-600">{c.heading}</span>
        <CategoryBadge code={c.category} />
        <div className="ml-auto"><ScoreMeter score={c.score} /></div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">“{highlight(c.excerpt, query)}”</p>
      <p className="text-[10px] text-slate-400 font-mono mt-3 pt-2 border-t border-slate-100">{c.doc_title} · v{c.version} · effective {c.effective_date}</p>
    </div>
  )
}

export default function ComplianceInspector() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PolicyCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PolicySearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<PolicyCategoryInfo[]>([])
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null)

  useEffect(() => {
    Promise.all([ragApi.categories(), ragApi.stats()])
      .then(([c, s]) => { setCategories(c); setStats(s) })
      .catch(() => {})
  }, [])

  async function search(q = query) {
    if (!q.trim() || loading) return
    setQuery(q); setLoading(true); setError(null)
    try {
      setResult(await ragApi.search(q.trim(), selected))
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function toggleCategory(code: PolicyCategory) {
    setSelected(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]))
  }

  const labelOf = (code: PolicyCategory) => categories.find(c => c.code === code)?.label

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full p-5 space-y-4 overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-800">Compliance & SOP Inspector</p>
            <p className="text-xs text-slate-400 mt-0.5">RAG retrieval over verified logistics SOPs · every result is a cited, verbatim excerpt</p>
          </div>
          {stats && (
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
              {stats.documents} SOPs · {stats.chunks} passages · {stats.vocabulary_size.toLocaleString()} terms · {stats.embedder}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Ask about HAZMAT placards, driver rest breaks, cold chain, breakdowns…"
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-50 transition bg-white"
          />
          <button onClick={() => search()} disabled={!query.trim() || loading} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-xl transition-colors">
            Search SOPs
          </button>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Filter</span>
          <button onClick={() => setSelected([])} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${selected.length === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>All</button>
          {(categories.length ? categories : (Object.keys(CATEGORY_STYLE) as PolicyCategory[]).map(code => ({ code, label: code.replace(/_/g, ' '), document_count: 0, chunk_count: 0 }))).map(c => {
            const on = selected.includes(c.code)
            const s = CATEGORY_STYLE[c.code]
            return (
              <button key={c.code} onClick={() => toggleCategory(c.code)} style={on ? { background: s.bg, color: s.text, borderColor: s.text } : undefined} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? '' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                {s.icon} {c.label}{c.document_count > 0 && <span className="opacity-60"> · {c.document_count}</span>}
              </button>
            )
          })}
        </div>

        {!result && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {EXAMPLE_QUERIES.map(q => (
              <button key={q} onClick={() => search(q)} className="text-left p-3 border border-slate-200 bg-white rounded-xl text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors">🔍 {q}</button>
            ))}
          </div>
        )}

        {loading && <div className="flex items-center gap-3 text-sm text-slate-500"><span className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />Searching vector store…</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && !loading && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{result.results.length} cited passage{result.results.length === 1 ? '' : 's'}</span>
              <span>· searched {result.total_chunks_indexed} passages in {result.latency_ms.toFixed(2)} ms</span>
              {result.categories && <span>· in {result.categories.map(c => labelOf(c) ?? c).join(', ')}</span>}
              <span className="ml-auto text-emerald-600 font-semibold">✓ Verbatim source text, no generated content</span>
            </div>
            {result.results.length === 0 ? (
              <div className="border border-slate-200 bg-white rounded-xl p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">No policy found in the verified knowledge base</p>
                <p className="text-xs text-slate-400 mt-1">No SOP passage matches “{result.query}”{result.categories ? ' in the selected categories' : ''}. Try different wording{result.categories ? ' or clear the filters' : ''}, or escalate to the Safety Manager.</p>
              </div>
            ) : (
              result.results.map((c, i) => (
                <CitationCard key={c.chunk_id} c={c} query={result.query} rank={i + 1} />
              ))
            )}
          </div>
        )}
      </div>

    </div>
  )
}
