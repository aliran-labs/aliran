'use client';

import { useAppState, treasuryView } from '../lib/appState';
import { ReportPanel } from '../components/Panels';

export default function ReportPage() {
  const { state } = useAppState();
  if (!state) return <div className="p-10 text-muted">Loading…</div>;
  const { cap, remaining } = treasuryView(state);
  const hasReport = state.runs.some((r) => r.report);

  if (!hasReport) {
    return (
      <div className="card flex min-h-[360px] flex-col items-center justify-center p-10 text-center">
        <div className="mb-3 h-12 w-12 rounded-card border border-dashed border-border" />
        <p className="text-sm text-muted">No monthly report yet</p>
        <p className="text-xs text-muted/70">
          Run a month on the Dashboard — the creative agent writes the report via Venice.
        </p>
      </div>
    );
  }

  // ReportPanel renders the latest report as themed markdown with real balances.
  return <ReportPanel runs={state.runs} openingUsdc={cap} closingUsdc={remaining} />;
}
