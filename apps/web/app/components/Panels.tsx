'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Task, Receipt, Run } from '../types';
import { AssetImg, agentColor, short, usdc } from '../lib/ui';

// --- Run-month stepper ------------------------------------------------------
const STEPS = [
  { key: 'plan', label: 'Plan', color: '#8B5CF6' },
  { key: 'pay', label: 'Pay', color: '#2DD4BF' },
  { key: 'buy', label: 'Buy (x402)', color: '#F59E0B' },
  { key: 'report', label: 'Report', color: '#EC4899' },
] as const;

export function Stepper({ done, active }: { done: Record<string, boolean>; active: boolean }) {
  // first not-done step is "current" while a run is active
  const currentIdx = STEPS.findIndex((s) => !done[s.key]);
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const isDone = done[s.key];
        const isCurrent = active && i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="relative flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  background: isDone ? s.color : 'transparent',
                  border: `1.5px solid ${isDone || isCurrent ? s.color : '#232B36'}`,
                  color: isDone ? '#03161a' : isCurrent ? s.color : '#8B949E',
                }}
              >
                {isCurrent && (
                  <span className="absolute inline-flex h-full w-full animate-livepulse rounded-full" style={{ background: `${s.color}66` }} />
                )}
                <span className="relative">{isDone ? '✓' : i + 1}</span>
              </span>
              <span className={`text-[11px] ${isDone ? 'text-text' : isCurrent ? '' : 'text-muted'}`} style={isCurrent ? { color: s.color } : undefined}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="h-px w-5" style={{ background: isDone ? s.color : '#232B36' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Task board -------------------------------------------------------------
const TASK_PILL: Record<string, string> = {
  done: 'bg-cyan/15 text-cyan',
  paid: 'bg-success/15 text-success',
  rejected: 'bg-danger/15 text-danger',
  open: 'bg-surface-2 text-muted',
};

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  return (
    <section className="card p-5">
      <h2 className="label mb-3">Task board</h2>
      <ul className="space-y-2">
        {tasks.length === 0 && <li className="text-sm text-muted">No tasks seeded.</li>}
        {tasks.map((t) => (
          <li
            key={t.id}
            className="relative overflow-hidden rounded-control border border-border bg-surface-2/40 p-3 pl-4"
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: agentColor('payroll') }} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-text">{t.title}</span>
              <span className={`pill ${TASK_PILL[t.status] ?? ''}`}>{t.status}</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              <span className="mono text-text/90">{usdc(t.amountUsdc)} USDC</span> →{' '}
              <span className="mono">{short(t.contributorAddress)}</span>
            </div>
            {t.evidence && <p className="mt-1 line-clamp-2 text-[11px] text-muted/70">evidence: {t.evidence}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- x402 receipts ----------------------------------------------------------
export function Receipts({ receipts }: { receipts: Receipt[] }) {
  return (
    <section className="card p-5">
      <h2 className="label mb-3">x402 receipts</h2>
      {receipts.length === 0 ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center text-center">
          <p className="text-sm text-muted">No purchases yet</p>
          <p className="text-xs text-muted/70">Procurement buys market data over x402.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-control border border-border bg-surface-2/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="mono truncate text-xs text-text/90">{prettyUrl(r.url)}</span>
                <span className="pill bg-success/15 text-success">402 → 200</span>
              </div>
              <div className="mono mt-1 truncate text-[10px] text-muted">
                {r.txHash ? `tx ${short(r.txHash)}` : `payload ${short(r.paymentPayloadHash)}`}
              </div>
              {r.synthesis && (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted">
                  {r.synthesis.trim()}
                </pre>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

function prettyUrl(u: string): string {
  try {
    const p = new URL(u);
    return p.host + p.pathname;
  } catch {
    return u;
  }
}

// --- Monthly report ---------------------------------------------------------
/**
 * Fill the Venice report's unfilled placeholders with REAL treasury balances
 * from /api/state (opening = budget cap, closing = remaining, net = -spent), and
 * strip any other stray brackets so no literal "[...]" ever renders. Also wrap
 * "N USDC" amounts in backticks so they render in mono.
 */
function fillReport(md: string, openingUsdc: number, closingUsdc: number): string {
  const op = `${usdc(openingUsdc)} USDC`;
  const cl = `${usdc(closingUsdc)} USDC`;
  return md
    .replace(/\[\s*previous month closing balance\s*\]/gi, op)
    .replace(/\[\s*opening balance[^\]]*\]/gi, op)
    .replace(/\[\s*current month (?:closing )?balance\s*\]/gi, cl)
    .replace(/\[\s*closing balance[^\]]*\]/gi, cl)
    // any remaining bracketed placeholder → drop the brackets (keep inner text)
    .replace(/\[([^\][]*)\]/g, '$1')
    // amounts → mono via inline code
    .replace(/(?<![`\d])(\d[\d,]*\.?\d*)\s*USDC\b/g, '`$1 USDC`')
    .trim();
}

const MD_COMPONENTS = {
  h1: (p: any) => <h1 className="font-display text-lg font-semibold text-text" {...p} />,
  h2: (p: any) => (
    <h2 className="mt-4 border-b border-border/70 pb-1 font-display text-sm font-semibold uppercase tracking-wide text-text" {...p} />
  ),
  h3: (p: any) => <h3 className="mt-3 font-display text-sm font-semibold text-text/90" {...p} />,
  p: (p: any) => <p className="mt-1.5 text-sm leading-relaxed text-muted" {...p} />,
  ul: (p: any) => <ul className="mt-1.5 space-y-1 text-sm text-muted" {...p} />,
  li: (p: any) => (
    <li className="flex gap-2 leading-relaxed">
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan/60" />
      <span {...p} />
    </li>
  ),
  strong: (p: any) => <strong className="font-semibold text-text" {...p} />,
  code: (p: any) => <code className="mono rounded bg-surface-2/70 px-1 py-0.5 text-[12px] text-text" {...p} />,
  hr: () => <hr className="my-4 border-border/60" />,
  em: (p: any) => <em className="text-muted/80" {...p} />,
  a: (p: any) => <a className="text-link hover:underline" {...p} />,
};

export function ReportPanel({
  runs,
  openingUsdc,
  closingUsdc,
}: {
  runs: Run[];
  openingUsdc: number;
  closingUsdc: number;
}) {
  const latest = [...runs].reverse().find((r) => r.report);
  if (!latest?.report) return null;
  const md = fillReport(latest.report, openingUsdc, closingUsdc);
  return (
    <section className="card mt-6 p-5">
      <h2 className="label mb-3">
        Monthly treasury report <span className="text-creative">· creative agent (Venice)</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="min-w-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {md}
          </ReactMarkdown>
        </div>
        {latest.reportImageUrl && (
          <div>
            <AssetImg
              src="/assets/brand/report-cover.png"
              alt="report cover"
              className="h-44 w-full rounded-control border border-border object-cover"
              fallbackClass="h-44 w-full rounded-control border border-border bg-gradient-to-br from-cyan/20 via-cfo/10 to-creative/20"
            />
            <div className="mono mt-2 break-all text-[10px] text-muted/70">{latest.reportImageUrl}</div>
          </div>
        )}
      </div>
    </section>
  );
}
