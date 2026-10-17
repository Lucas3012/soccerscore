import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { placeBet, validateSlip } from "@/lib/wallet";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const validation = await validateSlip(body.selections);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const stakeCents = Number(body.stakeCents ?? 0);
  const result = await placeBet(user.id, validation.items, stakeCents);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    betId: result.betId,
    totalOdd: result.totalOdd,
    potentialCents: result.potentialCents,
  });
}
