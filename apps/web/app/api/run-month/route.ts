import { NextResponse } from 'next/server';
import { config } from '@aliran/core';
import { runMonth } from '@aliran/agents';
import { ensureMockKeys } from '../_bootstrap';

export const dynamic = 'force-dynamic';

/** Runs the full month: plan -> redelegate -> payroll -> procurement -> report. */
export async function POST(req: Request) {
  ensureMockKeys();
  const body = await req.json().catch(() => ({}));
  const instruction = body.instruction || "run this month's operations";
  const marketUrl = `${config.SELLER_URL}/api/market-brief`;
  try {
    const result = await runMonth({ instruction, marketUrl, withImage: true, autoApprove: true });
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      plan: result.plan,
      payroll: result.payroll,
      procurement: { ok: result.procurement.ok, synthesis: result.procurement.synthesis, receiptId: result.procurement.receiptId },
      report: result.report,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
