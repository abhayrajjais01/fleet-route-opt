// ─── RAG COMPLIANCE INSPECTOR (US-006, Track A: Manthan Nimodiya) ─────────────
// Semantic search over the verified SOP knowledge base. Every answer shown here is a verbatim
// excerpt returned by the backend vector store, with its source document, § section and similarity
// score — nothing is generated, so nothing can be hallucinated.
import { useState } from 'react'
import { ragApi, type PolicyCitation, type PolicySearchResponse } from '../../lib/ragApi'

const EXAMPLE_QUERIES = [
  'Placard weight threshold for hazmat loads',
  'How long can a driver drive before a break?',
  'Vaccine temperature excursion procedure',
  'Vehicle broke down — what is the procedure?',
  'Can oxidizers travel with flammable liquids?',
  'When is a shipment an SLA breach?',
]

function CitationCard({ c, rank }: { c: PolicyCitation; rank: number }) {
  const best = rank === 1
  return (
    <div className={`rounded-xl p-4 border transition-colors ${best ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${best ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{best ? 'BEST MATCH' : `#${rank}`}</span>
        <span className="font-mono text-xs font-bold text-slate-700">{c.doc_id} {c.section}</span>
        <span className="text-xs font-semibold text-slate-600">{c.heading}</span>
        <span className="ml-auto font-mono text-[10px] text-slate-400">sim {c.score.toFixed(3)}</span>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">“{c.excerpt}”</p>
      <p className="text-[10px] text-slate-400 font-mono mt-3 pt-2 border-t border-slate-100">{c.doc_title} · v{c.version} · effective {c.effective_date}</p>
    </div>
  )
}

export default function ComplianceInspector() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PolicySearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function search(q = query) {
    if (!q.trim() || loading) return
    setQuery(q); setLoading(true); setError(null)
    try {
      setResult(await ragApi.search(q.trim(), []))
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
      <div>
        <p className="text-base font-bold text-slate-800">Compliance & SOP Inspector</p>
        <p className="text-xs text-slate-400 mt-0.5">RAG retrieval over verified logistics SOPs · every result is a cited, verbatim excerpt</p>
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
            <span className="ml-auto text-emerald-600 font-semibold">✓ Verbatim source text, no generated content</span>
          </div>
          {result.results.length === 0 ? (
            <div className="border border-slate-200 bg-white rounded-xl p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">No policy found in the verified knowledge base</p>
              <p className="text-xs text-slate-400 mt-1">No SOP passage matches “{result.query}”. Try different wording, or escalate to the Safety Manager.</p>
            </div>
          ) : (
            result.results.map((c, i) => <CitationCard key={c.chunk_id} c={c} rank={i + 1} />)
          )}
        </div>
      )}
    </div>
  )
}
