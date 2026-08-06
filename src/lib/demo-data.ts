import type { CricketMatch, Player } from "@/lib/types";

export const initialPlayers: Player[] = [
  { id: "p-1", name: "Aarav Patel", battingStyle: "Right-hand bat", bowlingStyle: "Right-arm off spin", playerType: "Batting player", matches: 12, runs: 386, highestScore: 74, wickets: 8 },
  { id: "p-2", name: "Rohan Shah", battingStyle: "Left-hand bat", bowlingStyle: "No bowling", playerType: "Batting player", matches: 9, runs: 241, highestScore: 58, wickets: 0 },
  { id: "p-3", name: "Vikram Singh", battingStyle: "Right-hand bat", bowlingStyle: "Right-arm pace", playerType: "Bowling player", matches: 14, runs: 198, highestScore: 41, wickets: 19 },
  { id: "p-4", name: "Nikhil Kumar", battingStyle: "Right-hand bat", bowlingStyle: "Leg spin", playerType: "Bowling player", matches: 11, runs: 167, highestScore: 39, wickets: 14 },
];

export const initialMatches: CricketMatch[] = [
  { id: "m-1", homeTeam: "Green Giants", awayTeam: "Sunday Strikers", date: "2026-08-09", location: "Riverside Ground", overs: 20, status: "Upcoming" },
  { id: "m-2", homeTeam: "Green Giants", awayTeam: "City Challengers", date: "2026-07-26", location: "Lakeside Oval", overs: 20, status: "Completed" },
];
