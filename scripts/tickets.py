"""Statut de billetterie / inscriptions, recalculé à chaque build (chaque jour via GitHub Actions).

Sources, par ordre de priorité :
1. API Ticketmaster Discovery (si la variable d'environnement TICKETMASTER_API_KEY est définie) :
   statut officiel onsale / offsale + date d'ouverture de la vente publique.
2. data/tickets.json : infos recherchées (URL billetterie, date d'ouverture, complet, règles des clubs).
3. Règles simples : événement gratuit, date non fixée → billetterie pas encore ouverte.
Aucun appel à un modèle d'IA : zéro token.
"""
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "tickets.json"

LABELS = {
    "open": "Billetterie ouverte", "soon": "Bientôt en vente", "sold_out": "Complet",
    "closed": "Vente fermée", "free": "Accès gratuit", "not_open": "Pas encore en vente", "unknown": None,
}
RACE_LABELS = {"open": "Inscriptions ouvertes", "soon": "Inscriptions bientôt", "sold_out": "Dossards épuisés",
               "closed": "Inscriptions closes", "not_open": "Inscriptions pas ouvertes"}


def _k(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _rx(p, t):
    try:
        return re.search(p, t, re.I)
    except re.error:
        return re.search(re.escape(p), t, re.I)


def _d(s):
    try:
        return date.fromisoformat(str(s)[:10]) if s else None
    except ValueError:
        return None


class Tickets:
    def __init__(self, today=None):
        self.today = today or date.today()
        d = json.loads(SRC.read_text()) if SRC.exists() else {}
        self.clubs, self.events, self.races = d.get("clubs", {}), d.get("events", {}), d.get("races", {})
        self.tm = self._ticketmaster()

    # ---------- Ticketmaster (optionnel) ----------
    def _ticketmaster(self):
        key = os.environ.get("TICKETMASTER_API_KEY")
        if not key:
            return []
        out, page = [], 0
        while page < 5:
            q = urllib.parse.urlencode({"apikey": key, "countryCode": "FR", "latlong": "48.8566,2.3522", "radius": 30, "unit": "km",
                                        "classificationName": "sports", "size": 200, "page": page, "sort": "date,asc"})
            try:
                with urllib.request.urlopen("https://app.ticketmaster.com/discovery/v2/events.json?" + q, timeout=30) as r:
                    data = json.load(r)
            except Exception as e:
                print("! Ticketmaster :", e)
                break
            for ev in (data.get("_embedded") or {}).get("events", []):
                st = ((ev.get("dates") or {}).get("status") or {}).get("code")
                pub = (ev.get("sales") or {}).get("public") or {}
                out.append({"name": ev.get("name", ""), "date": ((ev.get("dates") or {}).get("start") or {}).get("localDate"),
                            "venue": (((ev.get("_embedded") or {}).get("venues") or [{}])[0]).get("name", ""),
                            "status": st, "sale_start": pub.get("startDateTime"), "url": ev.get("url")})
            pg = data.get("page") or {}
            page += 1
            if page >= pg.get("totalPages", 0):
                break
        print(f"Ticketmaster : {len(out)} événements sportifs autour de Paris")
        return out

    def _tm_match(self, ev):
        d = ev["start"][:10]
        tk = set(_k(ev["title"]).split()) - {"de", "du", "la", "le", "paris", "vs"}
        best = None
        for t in self.tm:
            if t["date"] != d:
                continue
            ov = len(tk & set(_k(t["name"]).split()))
            if ov >= 2 or (ov >= 1 and _k(ev.get("venue") or "")[:8] in _k(t["venue"])):
                if not best or ov > best[0]:
                    best = (ov, t)
        return best[1] if best else None

    # ---------- calcul ----------
    def _from_entry(self, e, is_race):
        status = e.get("status") or "unknown"
        opens, closes = _d(e.get("opens")), _d(e.get("closes"))
        if status != "sold_out":
            if opens and self.today < opens:
                status = "soon"
            elif opens and status in ("not_open", "unknown"):
                status = "open"  # la date d'ouverture est passée
            if closes and self.today > closes:
                status = "closed"
        return {"status": status, "opens": e.get("opens"), "url": e.get("url"), "note": e.get("note"), "src": e.get("source"), "how": "recherche"}

    def compute(self, ev):
        start = _d(ev["start"])
        if not start or (_d(ev.get("end")) or start) < self.today or ev.get("recurring"):
            return None
        title, cat = ev["title"], ev["category"]
        is_race = cat.startswith("Course")
        res = None
        tm = self._tm_match(ev) if self.tm else None
        if tm:
            code = tm["status"]
            ss = _d(tm.get("sale_start"))
            st = {"onsale": "open", "offsale": "sold_out", "cancelled": "closed", "canceled": "closed"}.get(code, "unknown")
            if ss and self.today < ss:
                st = "soon"
            res = {"status": st, "opens": tm.get("sale_start", "")[:10] or None, "url": tm.get("url"), "note": "Statut officiel Ticketmaster", "src": tm.get("url"), "how": "ticketmaster"}
        if not res:
            pool = self.races if is_race else self.events
            best = None
            for name, e in pool.items():
                m = _rx(e.get("match") or name, title)
                if m and (not best or len(m.group(0)) > best[0]):
                    best = (len(m.group(0)), e)
            if best:
                res = self._from_entry(best[1], is_race)
        if not res and cat == "Match pro":
            for name, c in self.clubs.items():
                m = _rx(c.get("match") or name, title)
                if not m or m.start() != 0:
                    continue
                if ev.get("tentative"):
                    res = {"status": "not_open", "note": "Date et horaire pas encore fixés par la ligue : la vente ouvrira une fois le match programmé.", "url": c.get("url"), "src": c.get("source"), "how": "règle"}
                elif c.get("rule") == "weeks_before" and c.get("weeks_before"):
                    opens = start - timedelta(weeks=int(c["weeks_before"]))
                    st = "soon" if self.today < opens else "open"
                    res = {"status": st, "opens": opens.isoformat() if st == "soon" else None, "url": c.get("url"), "src": c.get("source"), "how": "règle",
                           "note": f"Vente généralement ouverte {c['weeks_before']} semaines avant le match (estimation)." + (" " + c["presale_note"] if c.get("presale_note") else "")}
                else:
                    res = {"status": "open", "url": c.get("url"), "src": c.get("source"), "how": "règle", "note": c.get("presale_note")}
                if c.get("usually_sold_out") and res["status"] == "open":
                    res["hot"] = True
                    res["note"] = ((res.get("note") or "") + " Matchs très demandés : priorité abonnés/membres, places rares en vente libre.").strip()
                break
        if not res and ev.get("price") == "Gratuit":
            res = {"status": "free", "how": "règle"}
        if not res or res["status"] == "unknown":
            return None
        labels = RACE_LABELS if is_race else LABELS
        res["label"] = labels.get(res["status"]) or LABELS.get(res["status"])
        if res["status"] == "soon" and res.get("opens"):
            res["label"] = ("Inscriptions le " if is_race else "Ouverture le ") + datetime.fromisoformat(res["opens"][:10]).strftime("%d/%m")
        res["checked"] = self.today.isoformat()
        return {k: v for k, v in res.items() if v not in (None, "")}
