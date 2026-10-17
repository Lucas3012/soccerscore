import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildMarkets, MARKETS_PER_MATCH } from "@/lib/odds/markets";
import { getFixtureById } from "@/lib/sports";

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { matchId } = await params;
  const fixture = getFixtureById(decodeURIComponent(matchId));
  if (!fixture) {
    return NextResponse.json({ ok: false, error: "Partida não encontrada." }, { status: 404 });
  }

  const markets = buildMarkets(fixture);
  const total = markets.reduce((acc, market) => acc + market.selections.length, 0);

  return NextResponse.json({
    ok: true,
    fixture: {
      id: fixture.id,
      leagueName: fixture.leagueName,
      leagueId: fixture.leagueId,
      country: fixture.country,
      flag: fixture.flag,
      home: fixture.home,
      away: fixture.away,
      kickoff: fixture.kickoff,
      slot: fixture.slot,
    },
    expected: MARKETS_PER_MATCH,
    total,
    markets,
  });
}
