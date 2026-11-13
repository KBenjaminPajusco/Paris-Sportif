#!/usr/bin/env python3
"""Récupère les événements sportifs de l'open data de la Ville de Paris
(jeu de données « Que faire à Paris ? ») et les normalise.

Sortie : data/opendata.json
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "opendata.json"
API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/exports/json"

FIELDS = [
    "id", "url", "title", "lead_text", "date_start", "date_end", "occurrences",
    "date_description", "address_name", "address_street", "address_zipcode",
    "address_city", "lat_lon", "price_type", "price_detail", "qfap_tags",
    "access_link", "cover_url", "audience",
]

# Mots-clés forts pour repêcher des événements sportifs non tagués « Sport »
EXTRA_KEYWORDS = r"\b(marathon|semi-marathon|trail|triathlon|tournoi|match|course à pied|running|10 ?km|5 ?km|cyclisme|vélo|rugby|football|basket|handball|volley|natation|escalade|skate|roller|jeux olympiques|paralympique|judo|boxe|escrime|tennis|badminton|pétanque|yoga|fitness|zumba|pilates|randonnée|marche nordique)\b"

# (regex, sport) – l'ordre compte : le premier qui matche gagne
SPORT_RULES = [
    (r"marathon|semi-marathon|course à pied|running|\brun\b|jogging|10 ?km|5 ?km|corrida|foulées", "Course à pied"),
    (r"trail", "Trail"),
    (r"triathlon|duathlon|swimrun", "Triathlon"),
    (r"marche nordique|marche sportive|randonnée|\bmarche\b", "Marche"),
    (r"futsal", "Futsal"),
    (r"foot|five ", "Football"),
    (r"rugby", "Rugby"),
    (r"basket", "Basketball"),
    (r"handball|hand-ball", "Handball"),
    (r"volley", "Volley-ball"),
    (r"badminton|\bbad\b", "Badminton"),
    (r"tennis de table|ping", "Tennis de table"),
    (r"padel", "Padel"),
    (r"tennis", "Tennis"),
    (r"natation|piscine|aquagym|nage|aqua", "Natation"),
    (r"vélo|cyclisme|cyclo|bmx", "Cyclisme"),
    (r"roller|skate|glisse", "Roller / Skate"),
    (r"escalade|grimpe|bloc", "Escalade"),
    (r"judo|karaté|karate|kung fu|wing-tsun|wing tsun|taekwondo|aïkido|aikido|jiu|self[- ]d[ée]fense|arts? martia", "Arts martiaux"),
    (r"boxe|mma|mixed martial|lutte|cardio boxing", "Boxe / Sports de combat"),
    (r"escrime|sabre|fleuret", "Escrime"),
    (r"capoeira", "Capoeira"),
    (r"yoga|pilates|stretching|gym douce|qi ?gong|tai[- ]chi", "Yoga / Bien-être"),
    (r"zumba|fitness|cross ?training|remise en forme|cardio|musculation|renforcement|ppg|préparation physique|abdos|street workout|hiit", "Fitness"),
    (r"gym|motricité|éveil|baby", "Gymnastique / Motricité"),
    (r"pétanque|boule", "Pétanque"),
    (r"parkour", "Parkour"),
    (r"danse|dancehall|hip-hop", "Danse"),
    (r"échecs", "Échecs"),
    (r"golf", "Golf"),
    (r"aviron|kayak|canoë|paddle|voile", "Nautisme"),
    (r"équitation|cheval|hippi", "Équitation"),
    (r"multisport|multi-sport|initiation sportive|sport famille", "Multisports"),
]


def fetch(where: str) -> list:
    params = {"where": where, "select": ",".join(FIELDS), "limit": -1}
    url = API + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "paris-sportif-calendar/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # réseau capricieux : on réessaie
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Échec du téléchargement : {last}")


def guess_sport(text: str) -> str:
    t = text.lower()
    for rx, sport in SPORT_RULES:
        if re.search(rx, t):
            return sport
    return "Multisports"


def guess_category(title: str, tags: str, recurring: bool) -> str:
    t = title.lower()
    if re.search(r"calendrier|matchs? du|match ", t):
        return "Match pro"
    if re.search(r"marathon|course|courir|run\b|trail|triathlon|foulées|corrida|\d+ ?km", t) and not recurring:
        return "Course / épreuve participative"
    if re.search(r"tournoi|championnat|games|coupe|challenge|compétition", t):
        return "Tournoi amateur"
    if recurring or re.search(r"cours|stage|atelier|séance|initiation|paris sport", t):
        return "Activité / initiation"
    if "festival" in (tags or "").lower():
        return "Événement communautaire"
    return "Événement communautaire"


def parse_occurrences(occ: str | None, now: datetime) -> list:
    if not occ:
        return []
    out = []
    for chunk in occ.split(";"):
        try:
            start, end = chunk.split("_")
            s = datetime.fromisoformat(start)
            e = datetime.fromisoformat(end)
        except ValueError:
            continue
        if e >= now:
            fmt = lambda d: d.strftime("%Y-%m-%d") if (d.hour, d.minute) == (0, 0) else d.strftime("%Y-%m-%dT%H:%M")
            out.append([fmt(s), fmt(e)])
    return out


def to_local(iso: str | None) -> str | None:
    if not iso:
        return None
    d = datetime.fromisoformat(iso)
    try:
        from zoneinfo import ZoneInfo
        d = d.astimezone(ZoneInfo("Europe/Paris"))
    except Exception:
        pass
    if d.hour == 0 and d.minute == 0 or (d.hour == 23 and d.minute == 59) or (d.hour in (1, 2) and d.minute == 0 and d.second == 0):
        return d.strftime("%Y-%m-%d")
    return d.strftime("%Y-%m-%dT%H:%M")


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def main() -> int:
    now = datetime.now(timezone.utc)
    rows = fetch('qfap_tags like "*Sport*" and date_end >= now()')
    ids = {r["id"] for r in rows}
    try:
        extra = fetch('not qfap_tags like "*Sport*" and date_end >= now()')
        for r in extra:
            if r["id"] not in ids and re.search(EXTRA_KEYWORDS, (r.get("title") or "").lower()):
                # éviter le bruit : on exclut les expos/conférences/ateliers d'écriture
                if re.search(r"expo|conférence|lecture|concert|cinéma|film|théâtre|projection", (r.get("qfap_tags") or "").lower()):
                    continue
                r["_extra"] = True
                rows.append(r)
                ids.add(r["id"])
    except RuntimeError as e:
        print("avertissement :", e, file=sys.stderr)

    noise = re.compile(r"puzzle|couture|plantation|revue|soirée dansante|haircare|bourse aux vélos|répare|réparation|méditation|méditative", re.I)
    events = []
    for r in rows:
        if noise.search(r.get("title") or ""):
            continue
        occ = parse_occurrences(r.get("occurrences"), now)
        recurring = len(occ) > 2 or (not occ and r.get("date_start") and r.get("date_end") and
                                     (datetime.fromisoformat(r["date_end"]) - datetime.fromisoformat(r["date_start"])).days > 3)
        title = (r.get("title") or "").replace(" ", " ").strip()
        lead = strip_html(r.get("lead_text"))
        loc = r.get("lat_lon") or {}
        lat, lon = loc.get("lat"), loc.get("lon")
        if not lat or not lon:
            lat = lon = None
        zipc = r.get("address_zipcode") or ""
        price = {"gratuit": "Gratuit", "payant": "Payant"}.get((r.get("price_type") or "").lower())
        if price is None and "gratuit" in (r.get("price_type") or "").lower():
            price = "Gratuit"
        ev = {
            "id": f"qfap-{r['id']}",
            "title": title,
            "sport": guess_sport(title + " " + lead),
            "category": guess_category(title, r.get("qfap_tags") or "", bool(recurring)),
            "competition": None,
            "federation": "Ville de Paris" if re.search(r"paris sport|sport seniors|paris sportives|piscines parisiennes", title.lower()) else None,
            "date_start": to_local(occ[0][0] + ":00+01:00") if occ else to_local(r.get("date_start")),
            "date_end": to_local(r.get("date_end")),
            "recurring": bool(recurring),
            "occurrences": occ[:80] if recurring else occ,
            "schedule": strip_html(r.get("date_description")),
            "venue": r.get("address_name"),
            "address": ", ".join(x for x in [r.get("address_street"), zipc, r.get("address_city")] if x),
            "city": r.get("address_city") or "Paris",
            "zipcode": zipc,
            "lat": lat, "lon": lon,
            "url": r.get("url") or r.get("access_link"),
            "price": price,
            "tentative": False,
            "description": lead,
            "tags": [t for t in (r.get("qfap_tags") or "").split(";") if t and t != "Sport"],
            "image": r.get("cover_url"),
            "source": "Que faire à Paris (open data Ville de Paris)",
        }
        if occ:
            ev["date_start"] = occ[0][0]
            if not recurring:
                last = occ[-1][1]
                ev["date_end"] = last if last[:10] != occ[0][0][:10] else None
        events.append(ev)

    events.sort(key=lambda e: e["date_start"] or "")
    OUT.write_text(json.dumps(events, ensure_ascii=False, indent=1))
    print(f"{len(events)} événements open data écrits dans {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
