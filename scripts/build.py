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
    "multisport": "Multisports", "multi-sports": "Multisports",
}


def norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_sport(s: str | None) -> str:
    if not s:
        return "Autre"
    s = s.strip()
    return SPORT_ALIASES.get(norm_key(s), SPORT_ALIASES.get(s.lower(), s[0].upper() + s[1:]))


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
    out, seen = [], {}
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
            "category": e.get("category") or "Événement communautaire",
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
        if not ev["id"]:
            ev["id"] = "ev-" + hashlib.sha1(f"{title}|{start}|{ev['venue']}".encode()).hexdigest()[:10]
        # Dédoublonnage : même jour + titre proche
        key = (start[:10], norm_key(title))
        if key in seen:
            prev = seen[key]
            for k, v in ev.items():  # complète les champs manquants
                if not prev.get(k) and v:
                    prev[k] = v
            continue
        seen[key] = ev
        out.append(ev)

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
