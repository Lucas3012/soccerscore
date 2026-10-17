import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fixtureFromLive, getLiveSnapshot } from "@/lib/live/flashscore";
import { getMainOdds } from "@/lib/odds/markets";

export const dynamic = "force-dynamic";

/** Live board data (Flashscore feed), refreshed at most every ~45 seconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const snapshot = await getLiveSnapshot();

  const matches = snapshot.matches.map((match) => {
    const odds = getMainOdds(fixtureFromLive(match));
    return {
      id: match.matchId,
      leagueName: match.leagueName,
      country: match.country,
      flag: match.flag,
      region: match.region,
      home: match.home,
      away: match.away,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      kickoff: match.kickoff,
      period: match.period,
      clockLabel: match.clockLabel,
      odds,
    };
  });

  return NextResponse.json(
    {
      ok: snapshot.ok,
      updatedAt: snapshot.updatedAt,
      error: snapshot.error,
      matches,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
