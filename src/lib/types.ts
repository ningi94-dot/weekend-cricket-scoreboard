export type BattingStyle = "Right-hand bat" | "Left-hand bat";
export type BowlingStyle = "Right-arm pace" | "Left-arm pace" | "Right-arm off spin" | "Left-arm orthodox" | "Leg spin" | "No bowling";

export type Player = {
  id: string;
  name: string;
  battingStyle: BattingStyle;
  bowlingStyle: BowlingStyle;
  matches: number;
  runs: number;
  highestScore: number;
  wickets: number;
};

export type MatchStatus = "Upcoming" | "Live" | "Completed";

export type CricketMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  location: string;
  overs: number;
  status: MatchStatus;
};
