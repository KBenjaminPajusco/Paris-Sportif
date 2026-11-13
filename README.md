# 🏅 Paris Sportif

Le calendrier de **tous les événements sportifs à Paris et dans le Grand Paris** : matchs des clubs pro, courses à pied, vélo, triathlon, grands événements internationaux, sport entreprise, sport universitaire, tournois amateurs, activités gratuites de la Ville…

👉 **Site : https://benjamin.pajusco.fr/Paris-Sportif/**

## Fonctionnalités

- **Carte de Paris plein écran** au centre, épinglée par stade ; programme façon « tableau de paris » (domicile / extérieur), bandeau défilant, « À la une » avec compte à rebours
- Mode **À voir** (matchs pro, grands événements, spectacles) ou **Tout le sport** ; onglets par sport, filtre par jour / mois, recherche, tri
- Tri : date, sport, nom, type
- Fiche détaillée avec lien officiel, ajout Google Agenda, export `.ics` (un événement ou toute la sélection), itinéraire
- Filtres partageables via l'URL, thème clair/sombre, responsive mobile

## Sources des données

| Source | Contenu | Mise à jour |
|---|---|---|
| [Que faire à Paris – open data Ville de Paris](https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/) | Événements tagués « Sport » + événements sportifs repérés par mots-clés (courses, tournois, initiations, Paris Sport Proximité…) | Automatique, chaque jour (GitHub Actions) |
| `data/curated/*.json` | Événements recherchés sur le web : calendriers des clubs (PSG, Paris FC, Stade Français, Racing 92, Paris Basketball, PSG Handball…), courses (marathon, semi, 10 km, 20 km…), grands événements (Roland-Garros, Paris Grand Slam judo, Arc de Triomphe…), sport entreprise et universitaire | Manuelle |

Les dates marquées **« à confirmer »** suivent le calendrier habituel de l'événement mais n'étaient pas encore officiellement publiées.

## Structure

```
scripts/fetch_opendata.py   # scraper open data → data/opendata.json
scripts/build.py            # fusion + dédoublonnage + géolocalisation → docs/events.json
data/curated/*.json         # événements recherchés manuellement
data/venues.json            # coordonnées des principaux lieux (carte)
docs/                       # site statique (GitHub Pages)
```

## Ajouter un événement

Ajouter un objet dans un fichier de `data/curated/` :

```json
{
  "title": "Nom de l'événement",
  "sport": "Course à pied",
  "category": "Course / épreuve participative",
  "competition": "10 km",
  "federation": "FFA",
  "date_start": "2027-03-14T09:30",
  "date_end": null,
  "venue": "Bois de Vincennes",
  "address": "…",
  "city": "Paris",
  "url": "https://…",
  "price": "Payant",
  "tentative": false,
  "description": "Courte description",
  "tags": ["10 km"]
}
```

Catégories : `Match pro`, `Grand événement`, `Course / épreuve participative`, `Sport entreprise`, `Sport universitaire`, `Tournoi amateur`, `Événement communautaire`, `Spectacle sportif`, `Salon`, `Activité / initiation`.

En local :

```bash
python3 scripts/fetch_opendata.py && python3 scripts/build.py
cd docs && python3 -m http.server 8000
```

## Indicateur d'affluence

Chaque événement porte une estimation du public attendu (jauge 1 à 5 barres, chiffre, taux de remplissage) calculée par `scripts/affluence.py` à partir de `data/attendance.json` :

- **Matchs** : affluence moyenne 2025-26 du club qui reçoit (PSG, Paris FC, Stade Français, Racing 92, Paris Basketball…), plafonnée à la capacité du stade ; « guichets fermés » quand le club joue habituellement à guichets fermés (PSG, XV de France).
- **Grands événements** : fréquentation de la dernière édition (par jour si l'événement dure plusieurs jours).
- **Courses** : nombre de participants de la dernière édition.
- Sinon : capacité du lieu seule (« max »).

Badges : *Complet probable* (≥ 95 %), *Places rares* (≥ 80 %), *Places dispo*. Le **nombre exact de places restantes n'est pas publié** par les billetteries (aucune source publique sans clé d'API / accord partenaire) : c'est une estimation, chaque chiffre renvoie à sa source.
