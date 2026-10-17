import type { Metadata } from "next";
import LiveBoard, { type LivePayload } from "@/components/LiveBoard";
import { fixtureFromLive, getLiveSnapshot } from "@/lib/live/flashscore";
import { getMainOdds } from "@/lib/odds/markets";

export const metadata: Metadata = {
  title: "Ao vivo — futebol agora",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getLiveSnapshot();

  const matches = snapshot.matches.map((match) => ({
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
    odds: getMainOdds(fixtureFromLive(match)),
  }));

  const initial: LivePayload = {
    ok: snapshot.ok,
    updatedAt: snapshot.updatedAt,
    error: snapshot.error,
    matches,
  };

  return <LiveBoard initial={initial} />;
}
