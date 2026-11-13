#!/usr/bin/env python3
"""Fusionne les sources (open data + données recherchées à la main)
et produit docs/events.json pour l'application web."""
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "data" / "curated"
OPENDATA = ROOT / "data" / "opendata.json"
VENUES = ROOT / "data" / "venues.json"
OUT = ROOT / "docs" / "events.json"

# Harmonisation des libellés de sports
SPORT_ALIASES = {
    "athletisme": "Athlétisme", "course a pied": "Course à pied", "running": "Course à pied",
    "velo": "Cyclisme", "cyclisme sur piste": "Cyclisme", "bmx": "Cyclisme", "vtt": "Cyclisme",
    "volley": "Volley-ball", "volleyball": "Volley-ball", "volley-ball": "Volley-ball", "beach-volley": "Volley-ball", "beach volley": "Volley-ball",
    "basket": "Basketball", "basket-ball": "Basketball", "basket 3x3": "Basketball", "basketball 3x3": "Basketball",
    "hockey": "Hockey sur glace", "equitation": "Équitation", "hippisme": "Hippisme",
    "sports de combat": "Boxe / Sports de combat", "boxe": "Boxe / Sports de combat", "mma": "Boxe / Sports de combat",
    "kickboxing": "Boxe / Sports de combat", "boxe / mma": "Boxe / Sports de combat",
    "karate": "Arts martiaux", "karaté": "Arts martiaux", "taekwondo": "Arts martiaux", "judo": "Judo",
    "esport": "Esport", "e-sport": "Esport", "esports": "Esport",
    "multisport": "Multisports", "multi-sports": "Multisports", "roller": "Roller / Skate", "karting": "Sports mécaniques",
    "breaking": "Danse", "cross country": "Course à pied", "randonnee": "Marche",
}


def norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_sport(s: str | None) -> str:
    if not s:
        return "Autre"
    s = s.strip()
    return SPORT_ALIASES.get(norm_key(s), SPORT_ALIASES.get(s.lower(), s[0].upper() + s[1:]))


CATEGORY_ALIASES = {
    "competition spectateurs": "Grand événement", "competition": "Grand événement",
    "course epreuve participative": "Course / épreuve participative", "course": "Course / épreuve participative",
    "match": "Match pro", "match pro": "Match pro", "salon": "Salon", "spectacle": "Spectacle sportif",
}
VALID_CATEGORIES = ["Match pro", "Grand événement", "Course / épreuve participative", "Sport entreprise",
                    "Sport universitaire", "Tournoi amateur", "Événement communautaire", "Spectacle sportif",
                    "Salon", "Activité / initiation"]
STOP = set("de du des la le les l d et a au aux en paris the 2026 2027 edition".split())


def norm_category(c):
    if c in VALID_CATEGORIES:
        return c
    k = norm_key(c or "")
    for v in VALID_CATEGORIES:
        if norm_key(v) == k:
            return v
    return CATEGORY_ALIASES.get(k, "Événement communautaire")


def tokens(title):
    return {w for w in norm_key(title).split() if w not in STOP and len(w) > 1}


def norm_date(s):
    if not s:
        return None
    s = str(s).strip()
    m = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?", s)
    if not m:
        return None
    d, t = m.group(1), m.group(2)
    if not t or t in ("00:00", "23:59") or t.endswith(":59"):
        return d
    return f"{d}T{t}"


def load_json(p: Path):
    try:
        data = json.loads(p.read_text())
    except Exception as e:
        print(f"! {p.name} illisible : {e}")
        return []
    if isinstance(data, dict):
        data = data.get("events", [])
    return data


def main():
    venues = json.loads(VENUES.read_text()) if VENUES.exists() else {}
    cities = json.loads((ROOT / "data" / "cities.json").read_text())
    venue_index = {norm_key(k): v for k, v in venues.items()}

    events = []
    for p in sorted(CURATED.glob("*.json")):
        for e in load_json(p):
            e.setdefault("source", "Recherche web")
            e["_file"] = p.stem
            events.append(e)
    n_curated = len(events)
    if OPENDATA.exists():
        events += load_json(OPENDATA)

    today = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%d")
    out, seen, by_day = [], {}, {}
    for e in events:
        title = (e.get("title") or "").strip()
        start = norm_date(e.get("date_start"))
        if not title or not start:
            continue
        end = norm_date(e.get("date_end"))
        if end and end[:10] < start[:10]:
            end = None
        if (end or start)[:10] < today and not e.get("recurring"):
            continue  # événement passé
        ev = {
            "id": e.get("id"),
            "title": title,
            "sport": norm_sport(e.get("sport")),
            "category": norm_category(e.get("category")),
            "competition": e.get("competition"),
            "federation": e.get("federation"),
            "start": start,
            "end": end,
            "recurring": bool(e.get("recurring")),
            "occurrences": [[norm_date(a), norm_date(b)] for a, b in (e.get("occurrences") or [])][:80],
            "schedule": e.get("schedule"),
            "venue": e.get("venue"),
            "address": e.get("address"),
            "city": e.get("city") or "Paris",
            "lat": e.get("lat"),
            "lon": e.get("lon"),
            "url": e.get("url"),
            "price": e.get("price"),
            "tentative": bool(e.get("tentative")),
            "description": e.get("description"),
            "tags": [t for t in (e.get("tags") or []) if t],
            "image": e.get("image"),
            "source": e.get("source"),
        }
        if ev["sport"] in ("Athlétisme", "Cross-country", "Multisports") and re.search(r"\b(run|course|corrida|cross|km|marathon|foulees)\b", norm_key(title)):
            ev["sport"] = "Course à pied"
        if ev["lat"] is None and ev["venue"]:
            v = venue_index.get(norm_key(ev["venue"]))
            if not v:
                for k, val in venue_index.items():
                    if k and (k in norm_key(ev["venue"]) or norm_key(ev["venue"]) in k) and len(k) > 6:
                        v = val
                        break
            if v:
                ev["lat"], ev["lon"] = v["lat"], v["lon"]
                ev["city"] = ev["city"] or v.get("city")
        if ev["lat"] is None and ev["city"] in cities:
            ev["lat"], ev["lon"] = cities[ev["city"]]
        if not ev["id"]:
            ev["id"] = "ev-" + hashlib.sha1(f"{title}|{start}|{ev['venue']}".encode()).hexdigest()[:10]
        # Dédoublonnage : même jour + titre proche
        key = (start[:10], norm_key(title))
        prev = seen.get(key)
        if not prev and not ev["recurring"]:
            tk = tokens(title)
            d0 = datetime.strptime(start[:10], "%Y-%m-%d")
            near = [(d0 + timedelta(days=k)).strftime("%Y-%m-%d") for k in (0, -1, 1)]
            for other in [o for d in near for o in by_day.get(d, [])]:
                ot = tokens(other["title"])
                if tk and ot and not other["recurring"] and other.get("_origin") != e.get("_file", "opendata") and len(tk & ot) / min(len(tk), len(ot)) >= 0.6:
                    prev = other
                    break
        if prev:
            for k, v in ev.items():  # complète les champs manquants
                if not prev.get(k) and v:
                    prev[k] = v
            continue
        ev["_origin"] = e.get("_file", "opendata")
        seen[key] = ev
        by_day.setdefault(start[:10], []).append(ev)
        out.append(ev)

    for ev in out:
        ev.pop("_origin", None)
    try:
        from affluence import Affluence
        aff = Affluence()
        for ev in out:
            a = aff.compute(ev)
            if a:
                ev["aff"] = a
    except Exception as exc:  # l'indicateur ne doit jamais casser le build
        print("! affluence :", exc)
    try:
        from tickets import Tickets
        tix = Tickets()
        for ev in out:
            t = tix.compute(ev)
            if t:
                ev["ticket"] = t
    except Exception as exc:
        print("! billetterie :", exc)
    out.sort(key=lambda e: (e["start"], e["title"]))
    meta = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(out),
        "sources": {"curated": n_curated, "opendata": len(out) - sum(1 for e in out if not str(e["id"]).startswith("qfap-"))},
    }
    meta["sources"]["opendata"] = sum(1 for e in out if str(e["id"]).startswith("qfap-"))
    OUT.write_text(json.dumps({"meta": meta, "events": out}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out)} événements → {OUT.relative_to(ROOT)} ({meta['sources']})")


if __name__ == "__main__":
    main()
