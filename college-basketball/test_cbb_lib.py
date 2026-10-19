"""Unit tests for cbb_lib (python -m unittest -v)."""
import unittest

from cbb_lib import bracket_rows, game_line, group_bracket, idle_seconds, involves, is_close, render_bracket, round_rank, winner


def ev(i, away, a, home, h, state="post", period=2, detail="Final", date="2026-03-20T16:00Z", **tour):
    """An event in the API's shape; `tour` becomes the tournament annotation (region, round, firstFour)."""
    g = {
        "id": str(i), "date": date,
        "status": {"state": state, "completed": state == "post", "period": period, "detail": detail},
        "awayTeam": {"id": f"{away}-id", "abbreviation": away, "score": a, "winner": state == "post" and a > h},
        "homeTeam": {"id": f"{home}-id", "abbreviation": home, "score": h, "winner": state == "post" and h > a},
    }
    if tour:
        g["tournament"] = {"region": tour.get("region"), "round": tour.get("round"), "firstFour": tour.get("firstFour", False)}
    return g


GAMES = [
    ev(1, "DUKE", 81, "MTST", 62, region="East", round="1st Round"),
    ev(2, "UNC", 70, "UCLA", 72, region="South", round="2nd Round", date="2026-03-22T18:00Z"),
    ev(3, "HOU", 60, "AUB", 58, round="Final Four", date="2026-04-04T22:00Z"),
    ev(4, "SFPA", 68, "ALST", 70, region="South", round="First Four", firstFour=True, date="2026-03-17T23:00Z"),
    ev(5, "KU", 0, "ARIZ", 0, state="pre", period=0, detail="Sat, March 21st at 2:40 PM EDT", region="West", round="2nd Round", date="2026-03-21T18:40Z"),
]


class Tests(unittest.TestCase):
    def test_game_line(self):
        self.assertEqual(game_line(GAMES[0]), "DUKE 81 - 62 MTST  (Final)")
        self.assertEqual(game_line(GAMES[4]), "KU @ ARIZ  (Sat, March 21st at 2:40 PM EDT)")

    def test_involves(self):
        self.assertTrue(involves(GAMES[0], ["duke"]))
        self.assertTrue(involves(GAMES[0], ["MTST-id"]))
        self.assertFalse(involves(GAMES[0], ["UNC"]))
        self.assertTrue(involves(GAMES[0], []))

    def test_is_close(self):
        live = ev(9, "A", 70, "B", 67, state="in", period=2, detail="1:02 - 2nd Half")
        self.assertTrue(is_close(live))
        self.assertFalse(is_close(live, margin=2))
        self.assertFalse(is_close(ev(9, "A", 30, "B", 30, state="in", period=1)))  # first half
        self.assertFalse(is_close(GAMES[0]))  # not live

    def test_idle_seconds(self):
        from datetime import datetime, timezone
        now = datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc).timestamp()
        self.assertEqual(idle_seconds(GAMES, now, default=1800), 6 * 3600)  # next tip-off is 6h40m away: capped
        self.assertEqual(idle_seconds([], now, default=1800), 1800)
        soon = [ev(8, "A", 0, "B", 0, state="pre", date="2026-03-21T12:04Z")]
        self.assertEqual(idle_seconds(soon, now, default=1800), 300)

    def test_winner(self):
        self.assertEqual(winner(GAMES[0]), "DUKE")
        self.assertEqual(winner(GAMES[1]), "UCLA")
        self.assertIsNone(winner(GAMES[4]))

    def test_round_order(self):
        self.assertLess(round_rank("First Four"), round_rank("1st Round"))
        self.assertLess(round_rank("Elite 8"), round_rank("Final Four"))
        self.assertLess(round_rank("Final Four"), round_rank("National Championship"))
        self.assertEqual(round_rank("Something else"), 7)

    def test_group_bracket(self):
        grouped = group_bracket(GAMES)
        self.assertEqual([r for r, _ in grouped], ["First Four", "1st Round", "2nd Round", "Final Four"])
        second = dict(grouped[2][1])
        self.assertEqual(sorted(second), ["South", "West"])
        self.assertEqual(dict(grouped[3][1])["National"][0]["id"], "3")

    def test_render_and_rows(self):
        text = render_bracket(GAMES)
        self.assertTrue(text.startswith("== First Four ==\n  South\n    SFPA 68 - 70 ALST  (Final)  -> ALST"))
        rows = bracket_rows(GAMES)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["round"], "First Four")
        self.assertEqual(rows[-1]["region"], "National")


if __name__ == "__main__":
    unittest.main()
