"""Indicateur d'affluence : estime le nombre de spectateurs (ou de participants)
attendus pour chaque événement à partir de data/attendance.json (chiffres sourcés)."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "attendance.json"
SPORT_EN = {"Volley-ball": "Volleyball", "Athlétisme": "Athletics", "Boxe / Sports de combat": "Boxing", "Hockey sur glace": "Ice hockey"}


def _k(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _rx(pattern, text):
    """Recherche regex insensible à la casse ; renvoie le match ou None."""
    try:
        return re.search(pattern, text, re.I)
    except re.error:
        return re.search(re.escape(pattern), text, re.I)


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
        pairs = []
        for name, info in self.venues.items():
            for a in [name] + (info.get("aliases") or []):
                pairs.append((_k(a), name))
        self.vpairs = sorted(pairs, key=lambda p: len(p[0]), reverse=True)

    def venue_cap(self, ev):
        v = " " + _k(ev.get("venue")) + " "
        hits = [(v.find(f" {a} "), -len(a), name) for a, name in self.vpairs if a and f" {a} " in v]
        if hits:
            name = min(hits)[2]  # l'alias cité en premier, puis le plus long
            if True:
                info = self.venues[name]
                bs = info.get("by_sport") or {}
                cap = bs.get(ev.get("sport")) or bs.get(SPORT_EN.get(ev.get("sport"), "")) or info.get("capacity")
                return cap, info
        return None, None

    def _club(self, ev):
        title, sport = ev.get("title", ""), ev.get("sport", "")
        cands = []
        for name, c in self.clubs.items():
            low = name.lower()
            if "rugby" in low and sport != "Rugby":
                continue
            if "football" in low and sport != "Football":
                continue
            m = _rx(c.get("match") or name, title)
            if m and m.start() == 0:  # l'équipe qui reçoit est citée en premier
                comp_bonus = 1 if any(w.lower() in (ev.get("competition") or "").lower() for w in re.findall(r"\((.*?)\)", name)) else 0
                cands.append((len(m.group(0)), comp_bonus, bool(c.get("avg_attendance")), name, c))
        if not cands:
            return None
        cands.sort(key=lambda x: x[:3], reverse=True)
        top = cands[0]
        if not top[4].get("avg_attendance"):
            # même équipe, autre compétition avec une moyenne connue → on l'utilise (approx.)
            same = [c for c in cands if c[0] == top[0] and c[4].get("avg_attendance")]
            if same:
                n, c = same[0][3], dict(same[0][4])
                c["approx"] = True
                return n, c
        return top[3], top[4]

    def compute(self, ev):
        title, cat = ev.get("title", ""), ev.get("category", "")
        cap, vinfo = self.venue_cap(ev)
        res = None
        best = None
        for name, r in self.races.items():
            m = r.get("participants") and _rx(r.get("match") or name, title)
            if m and (best is None or len(m.group(0)) > best[0]):
                best = (len(m.group(0)), name, r)
        if best:
            _, name, r = best
            if True:
                res = {"n": r["participants"], "unit": "participants", "basis": f"{r.get('unit') or 'participants'} {name} {r.get('edition') or ''}".strip(), "src": r.get("source"), "approx": bool(r.get("approx"))}
                cap = None
        if not res and cat in ("Grand événement", "Spectacle sportif", "Salon"):
            for name, e in self.events.items():
                n = e.get("daily") or e.get("attendance")
                if n and _rx(e.get("match") or name, title):
                    multi = e.get("daily") and e.get("attendance") and e["daily"] != e["attendance"]
                    basis = f"fréquentation {name} {e.get('edition') or ''}".strip()
                    if multi:
                        basis += f" ({e['attendance']:,} au total)".replace(",", " ")
                    approx = bool(e.get("approx"))
                    if cap and n > cap:  # chiffre cumulé sur plusieurs jours : on plafonne à la jauge
                        basis += f" ({n:,} au total ; plafonné à la capacité)".replace(",", " ")
                        n, approx = cap, True
                    res = {"n": n, "unit": "spectateurs / jour" if multi else "spectateurs", "basis": basis, "src": e.get("source"), "approx": approx}
                    break
        if not res and cat == "Match pro":
            found = self._club(ev)
            if found:
                name, c = found
                n = c.get("avg_attendance")
                if n and c.get("sold_out_usual") and cap:
                    n = cap
                if n:
                    n = min(n, cap) if cap else n
                    res = {"n": n, "unit": "spectateurs", "basis": f"affluence moyenne {name} {c.get('season') or ''}".strip() + (" · guichets fermés habituels" if c.get("sold_out_usual") else ""), "src": c.get("source"), "approx": bool(c.get("approx"))}
        if not res and not cap:
            return None
        out = {"cap": cap}
        if res:
            out.update(res)
            if cap and res["unit"] == "spectateurs":
                out["fill"] = round(min(1, res["n"] / cap), 2)
        elif vinfo:
            out["src"] = vinfo.get("source")
        out["level"] = level(out.get("n") or 0)
        return out
