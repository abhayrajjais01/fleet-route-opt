// ─── FSM LIFECYCLE PROGRESS BAR (US-008, Week 6 Track B) ───────────────────
import React from 'react'
import type { ShipmentStatus } from '../../lib/types'

interface FsmProgressBarProps {
  status: ShipmentStatus
  failureReason?: string
  delayMinutes?: number
  timeWindow?: string
  stopSequence?: number
  compact?: boolean
}

interface StepDef {
  key: ShipmentStatus
  label: string
  sublabel: string
}

const STEPS: StepDef[] = [
  { key: 'UNASSIGNED', label: 'Ingested', sublabel: 'Order In Queue' },
  { key: 'ASSIGNED', label: 'Planned', sublabel: 'Vehicle Assigned' },
  { key: 'IN_TRANSIT', label: 'In Transit', sublabel: 'En Route to Stop' },
  { key: 'ARRIVED', label: 'Arrived', sublabel: 'At Consignee Gate' },
  { key: 'DELIVERED', label: 'Delivered', sublabel: 'Handover Verified' },
]

export const FsmProgressBar: React.FC<FsmProgressBarProps> = ({
  status,
  failureReason,
  delayMinutes,
  timeWindow,
  stopSequence,
  compact = false,
}) => {
  const isFailed = status === 'FAILED'

  // Map status to active index (0 to 4)
  const getStepIndex = (st: ShipmentStatus): number => {
    switch (st) {
      case 'UNASSIGNED':
      case 'CLUSTERED':
        return 0
      case 'ASSIGNED':
        return 1
      case 'IN_TRANSIT':
        return 2
      case 'ARRIVED':
        return 3
      case 'DELIVERED':
        return 4
      case 'FAILED':
        return 3 // Fails during transit or arrival
      default:
        return 0
    }
  }

  const activeIdx = getStepIndex(status)

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex items-center gap-1">
          {STEPS.map((s, idx) => {
            const isCompleted = !isFailed && idx < activeIdx
            const isCurrent = !isFailed && idx === activeIdx
            return (
              <React.Fragment key={s.key}>
                <div
                  title={`${s.label}: ${s.sublabel}`}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    isFailed && idx === activeIdx
                      ? 'bg-rose-500 ring-2 ring-rose-200 animate-pulse'
                      : isCompleted
                      ? 'bg-emerald-500'
                      : isCurrent
                      ? 'bg-blue-600 ring-2 ring-blue-200 animate-pulse'
                      : 'bg-slate-200'
                  }`}
                />
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-3 h-0.5 ${
                      !isFailed && idx < activeIdx ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>
        <span
          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
            isFailed
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : status === 'DELIVERED'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : status === 'ARRIVED'
              ? 'bg-purple-50 text-purple-700 border border-purple-200'
              : status === 'IN_TRANSIT'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status.replace(/_/g, ' ')}
        </span>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      {/* Top Header with Stop Details & Alert Badges */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2">
          {stopSequence !== undefined && (
            <span className="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">
              Stop #{stopSequence}
            </span>
          )}
          <span className="font-semibold text-slate-700">FSM Lifecycle Tracking</span>
          {timeWindow && (
            <span className="text-slate-400 font-mono text-[11px]">
              Window: {timeWindow}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {delayMinutes && delayMinutes > 0 ? (
            <span className="bg-amber-100 text-amber-800 border border-amber-300 font-semibold px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1">
              <span>⚠️</span> +{delayMinutes}m Delayed
            </span>
          ) : null}

          {isFailed ? (
            <span className="bg-rose-100 text-rose-800 border border-rose-300 font-semibold px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1">
              <span>✕</span> FAILED ({failureReason || 'Consignee Unavailable'})
            </span>
          ) : (
            <span
              className={`font-semibold px-2 py-0.5 rounded-full text-[10px] uppercase ${
                status === 'DELIVERED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : status === 'ARRIVED'
                  ? 'bg-purple-100 text-purple-800'
                  : status === 'IN_TRANSIT'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Stepper Flow */}
      <div className="relative flex items-center justify-between">
        {/* Connector Line behind steps */}
        <div className="absolute top-1/2 left-3 right-3 h-0.5 -translate-y-1/2 bg-slate-200 z-0" />
        <div
          className="absolute top-1/2 left-3 h-0.5 -translate-y-1/2 bg-emerald-500 transition-all duration-300 z-0"
          style={{
            width: isFailed
              ? `${(activeIdx / (STEPS.length - 1)) * 100}%`
              : `${(activeIdx / (STEPS.length - 1)) * 100}%`,
          }}
        />

        {STEPS.map((s, idx) => {
          const isCompleted = !isFailed && idx < activeIdx
          const isCurrent = !isFailed && idx === activeIdx
          const isFailedStep = isFailed && idx === activeIdx

          return (
            <div key={s.key} className="relative z-10 flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all shadow-sm ${
                  isFailedStep
                    ? 'bg-rose-600 text-white ring-4 ring-rose-100 scale-110'
                    : isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110 animate-pulse'
                    : 'bg-white border-2 border-slate-300 text-slate-400'
                }`}
              >
                {isCompleted ? '✓' : isFailedStep ? '✕' : idx + 1}
              </div>
              <span
                className={`text-[10px] font-semibold mt-1 whitespace-nowrap ${
                  isFailedStep
                    ? 'text-rose-700'
                    : isCurrent
                    ? 'text-blue-700 font-bold'
                    : isCompleted
                    ? 'text-slate-800'
                    : 'text-slate-400'
                }`}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
