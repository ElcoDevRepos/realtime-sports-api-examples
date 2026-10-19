"""Render the package's sensor templates with plain Jinja2 against a real API response.

    pip install jinja2 pyyaml
    python -m unittest discover -s tests -v

Home Assistant uses Jinja2 too; the sensor templates only use standard filters, so plain Jinja2
renders them the same way. The fixture is a real NHL /events response captured on 18 Oct 2026.
"""
import copy
import json
import unittest
from pathlib import Path

import jinja2
import yaml

HERE = Path(__file__).resolve().parent


class Loader(yaml.SafeLoader):
    pass


Loader.add_constructor("!secret", lambda loader, node: f"<secret {node.value}>")
PACKAGE = yaml.load((HERE.parent / "packages" / "rsa_scores.yaml").read_text(), Loader=Loader)
SENSORS = {s["unique_id"]: s["value_template"] for s in PACKAGE["rest"][0]["sensor"]}
FIXTURE = json.loads((HERE / "nhl-events.fixture.json").read_text())
ENV = jinja2.Environment()


def render(uid, team, data=FIXTURE):
    out = ENV.from_string(SENSORS[uid]).render(value_json=data, states=lambda _entity: team)
    return " ".join(out.split())


class SensorTemplates(unittest.TestCase):
    def test_package_shape(self):
        self.assertEqual(PACKAGE["rest"][0]["headers"]["Authorization"], "<secret rsa_api_auth>")
        self.assertEqual(PACKAGE["rest"][0]["scan_interval"], 86400)
        self.assertEqual(sorted(SENSORS), sorted(["rsa_game_state", "rsa_team_score", "rsa_opponent_score", "rsa_opponent", "rsa_game_detail", "rsa_game_start"]))
        ids = [a["id"] for a in PACKAGE["automation"]]
        self.assertEqual(ids, ["rsa_refresh_while_live", "rsa_refresh_idle", "rsa_game_final", "rsa_team_scored"])

    def test_live_game_as_away_team(self):
        live = next(g for g in FIXTURE["data"] if g["status"]["state"] == "in")
        self.assertEqual(render("rsa_game_state", "car"), "in")
        self.assertEqual(render("rsa_team_score", "CAR"), str(live["awayTeam"]["score"]))
        self.assertEqual(render("rsa_opponent_score", "CAR"), str(live["homeTeam"]["score"]))
        self.assertEqual(render("rsa_opponent", "CAR"), "@ CGY")
        self.assertEqual(render("rsa_game_detail", "CAR"), live["status"]["detail"])
        self.assertEqual(render("rsa_game_start", "CAR"), live["date"][:16] + ":00+00:00")

    def test_finished_game_as_home_team(self):
        final = next(g for g in FIXTURE["data"] if g["status"]["state"] == "post")
        self.assertEqual(render("rsa_game_state", "MIN"), "post")
        self.assertEqual(render("rsa_team_score", "MIN"), str(final["homeTeam"]["score"]))
        self.assertEqual(render("rsa_opponent", "MIN"), "vs CBJ")
        self.assertEqual(render("rsa_game_detail", "MIN"), "Final")

    def test_live_game_wins_over_upcoming(self):
        data = copy.deepcopy(FIXTURE)
        live = next(g for g in data["data"] if g["status"]["state"] == "in")
        nxt = copy.deepcopy(live)
        nxt.update(id="next", date="2099-01-01T00:00Z", status={"state": "pre", "detail": "Later"})
        data["data"].append(nxt)
        self.assertEqual(render("rsa_game_state", "CAR", data), "in")

    def test_upcoming_game_has_no_score(self):
        data = copy.deepcopy(FIXTURE)
        for g in data["data"]:
            g["status"] = {"state": "pre", "detail": "Tue, October 20th at 7:00 PM EDT"}
        self.assertEqual(render("rsa_game_state", "CAR", data), "pre")
        self.assertEqual(render("rsa_team_score", "CAR", data), "unknown")
        self.assertEqual(render("rsa_game_detail", "CAR", data), "Tue, October 20th at 7:00 PM EDT")

    def test_no_game(self):
        self.assertEqual(render("rsa_game_state", "BOS"), "none")
        self.assertEqual(render("rsa_opponent", "BOS"), "none")
        self.assertEqual(render("rsa_game_start", "BOS"), "unknown")
        self.assertEqual(render("rsa_game_state", "BOS", {"success": True, "data": []}), "none")


if __name__ == "__main__":
    unittest.main()
