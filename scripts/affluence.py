"""Indicateur d'affluence : estime le nombre de spectateurs (ou de participants)
attendus pour chaque événement à partir de data/attendance.json (chiffres sourcés)."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "attendance.json"


def _k(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _has(hay, needle):
    n = _k(needle)
    return bool(n) and re.search(r"(^| )" + re.escape(n) + r"( |$)", _k(hay)) is not None


def level(n):
    if not n:
        return 0
    for i, lim in enumerate((1000, 5000, 15000, 40000), start=1):
        if n < lim:
            return i
    return 5


class Affluence:
    def __init__(self):
        d = json.loads(SRC.read_text()) if SRC.exists() else {}
        self.venues = d.get("venues", {})
        self.clubs = d.get("clubs", {})
        self.events = d.get("events", {})
        self.races = d.get("races", {})
        self.vkeys = sorted(self.venues, key=len, reverse=True)

    def venue_cap(self, ev):
        v = ev.get("venue") or ""
        for name in self.vkeys:
            info = self.venues[name]
            alias = [name] + info.get("aliases", [])
            if any(_has(v, a) or _k(a) == _k(v) for a in alias):
                cap = (info.get("by_sport") or {}).get(ev.get("sport")) or info.get("capacity")
                return cap, name, info
        return None, None, None

    def compute(self, ev):
        title, cat = ev.get("title", ""), ev.get("category", "")
        cap, vname, vinfo = self.venue_cap(ev)
        res = None
        # 1. courses participatives
        for name, r in self.races.items():
            if _has(title, r.get("match") or name) and r.get("participants"):
                res = {"n": r["participants"], "unit": "participants", "basis": f"{r.get('unit', 'participants')} édition {r.get('edition', 'précédente')}", "src": r.get("source"), "approx": r.get("approx", False)}
                cap = None
                break
        # 2. grands événements connus
        if not res:
            for name, e in self.events.items():
                if _has(title, e.get("match") or name):
                    n = e.get("daily") or e.get("attendance")
                    if n:
                        per = " / jour" if e.get("daily") else ""
                        res = {"n": n, "unit": "spectateurs" + per, "basis": f"fréquentation édition {e.get('edition', 'précédente')}" + (f" (total {e['attendance']:,})".replace(",", " ") if e.get("daily") and e.get("attendance") else ""), "src": e.get("source"), "approx": e.get("approx", False)}
                        break
        # 3. matchs : affluence moyenne du club qui reçoit
        if not res and cat == "Match pro":
            home = re.split(r"\s+[–—-]\s+|\s+vs\.?\s+", title)[0]
            best = None
            for name, c in self.clubs.items():
                m = c.get("match") or name
                if _has(home, m) and (best is None or len(m) > len(best[0])):
                    best = (m, name, c)
            if best:
                _, name, c = best
                n = c.get("avg_attendance")
                if c.get("sold_out_usual") and cap:
                    n = cap
                if n:
                    if cap and n > cap:
                        n = cap
                    res = {"n": n, "unit": "spectateurs", "basis": f"affluence moyenne {name} {c.get('season', '')}".strip() + (" · guichets fermés habituels" if c.get("sold_out_usual") else ""), "src": c.get("source"), "approx": c.get("approx", False)}
        if not res and not cap:
            return None
        out = {"cap": cap, "venue_src": (vinfo or {}).get("source")}
        if res:
            out.update(res)
            if cap and res["unit"].startswith("spectateurs") and "/ jour" not in res["unit"]:
                out["fill"] = round(min(1, res["n"] / cap), 2)
        out["level"] = level(out.get("n") or 0)
        return out
