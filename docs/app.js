/* Paris Sportif – calendrier des événements sportifs à Paris */
(() => {
  "use strict";

  const CATEGORIES = {
    "Match pro": { color: "--c-pro", order: 1 },
    "Grand événement": { color: "--c-big", order: 2 },
    "Course / épreuve participative": { color: "--c-race", order: 3 },
    "Sport entreprise": { color: "--c-corp", order: 4 },
    "Sport universitaire": { color: "--c-uni", order: 5 },
    "Tournoi amateur": { color: "--c-amateur", order: 6 },
    "Événement communautaire": { color: "--c-community", order: 7 },
    "Spectacle sportif": { color: "--c-show", order: 8 },
    "Salon": { color: "--c-salon", order: 9 },
    "Activité / initiation": { color: "--c-activity", order: 10 },
  };
  const SPORT_ICONS = [
    [/course à pied|running|marathon/i, "🏃"], [/trail/i, "⛰️"], [/marche/i, "🚶"], [/futsal|football/i, "⚽"],
    [/rugby/i, "🏉"], [/basket/i, "🏀"], [/hand/i, "🤾"], [/volley/i, "🏐"], [/hockey/i, "🏒"],
    [/tennis de table|ping/i, "🏓"], [/padel|squash/i, "🎾"], [/tennis/i, "🎾"], [/badminton/i, "🏸"],
    [/triathlon/i, "🏊"], [/natation|water|plong/i, "🏊"], [/cycl|vélo|bmx/i, "🚴"], [/aviron|nautis|voile|kayak|canoë|rame/i, "🚣"],
    [/roller|skate/i, "🛼"], [/escalade/i, "🧗"], [/judo|karat|arts martiaux|taekwondo|capoeira/i, "🥋"],
    [/boxe|mma|combat|catch|lutte/i, "🥊"], [/escrime/i, "🤺"], [/golf/i, "⛳"], [/équitation|hippisme|hippique|cheval/i, "🏇"],
    [/athl/i, "🏅"], [/gym/i, "🤸"], [/yoga|bien-être|pilates/i, "🧘"], [/fitness|hyrox|crossfit|obstacle/i, "💪"],
    [/patin|glace/i, "⛸️"], [/ski|snow/i, "🏂"], [/pétanque|boule/i, "🎯"], [/esport/i, "🎮"], [/mécaniques|moto|auto|kart/i, "🏁"],
    [/danse|breaking/i, "💃"], [/échecs/i, "♟️"], [/parkour/i, "🤸"], [/tir/i, "🎯"], [/ultimate|frisbee/i, "🥏"],
  ];
  const sportIcon = s => (SPORT_ICONS.find(([re]) => re.test(s || "")) || [0, "🏅"])[1];
  const catColor = c => `var(${(CATEGORIES[c] || { color: "--c-community" }).color})`;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Dates « naïves » heure de Paris
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { if (!s) return null; const [d, t] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = (t || "0:0").split(":").map(Number); return new Date(y, m - 1, dd, h, mi); };
  const hasTime = s => !!s && s.includes("T");
  const fmtTime = s => hasTime(s) ? s.slice(11, 16).replace(":", "h") : "";
  const DOW = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const fmtLong = s => parse(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtShort = s => parse(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const TODAY = ymd(new Date());
  const addDays = (s, n) => { const d = parse(s.slice(0, 10)); d.setDate(d.getDate() + n); return ymd(d); };

  const state = {
    q: "", period: "all", from: "", to: "", categories: new Set(), sports: new Set(), cities: new Set(),
    free: false, recurring: false, hideTentative: false, sort: "date", view: "list", calMonth: TODAY.slice(0, 7), limit: 150,
  };
  let ALL = [], META = {}, map, mapLayer;

  // ---------- URL <-> état ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.q = p.get("q") || "";
    state.period = p.get("p") || (p.get("from") || p.get("to") ? "custom" : "all");
    state.from = p.get("from") || ""; state.to = p.get("to") || "";
    state.categories = new Set((p.get("cat") || "").split("|").filter(Boolean));
    state.sports = new Set((p.get("sport") || "").split("|").filter(Boolean));
    state.cities = new Set((p.get("city") || "").split("|").filter(Boolean));
    state.free = p.get("free") === "1"; state.recurring = p.get("rec") === "1"; state.hideTentative = p.get("conf") === "1";
    state.sort = p.get("sort") || "date"; state.view = p.get("view") || "list";
    if (p.get("m")) state.calMonth = p.get("m");
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.period !== "all" && state.period !== "custom") p.set("p", state.period);
    if (state.period === "custom") { if (state.from) p.set("from", state.from); if (state.to) p.set("to", state.to); }
    if (state.categories.size) p.set("cat", [...state.categories].join("|"));
    if (state.sports.size) p.set("sport", [...state.sports].join("|"));
    if (state.cities.size) p.set("city", [...state.cities].join("|"));
    if (state.free) p.set("free", "1"); if (state.recurring) p.set("rec", "1"); if (state.hideTentative) p.set("conf", "1");
    if (state.sort !== "date") p.set("sort", state.sort);
    if (state.view !== "list") p.set("view", state.view);
    if (state.view === "calendar" && state.calMonth !== TODAY.slice(0, 7)) p.set("m", state.calMonth);
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  // ---------- Filtrage ----------
  function periodRange() {
    const t = TODAY;
    switch (state.period) {
      case "today": return [t, t];
      case "weekend": {
        const d = parse(t); const dow = d.getDay();
        if (dow === 0) return [t, t];
        const sat = addDays(t, (6 - dow + 7) % 7);
        return [dow === 5 ? t : sat, addDays(sat, 1)];
      }
      case "7": return [t, addDays(t, 6)];
      case "30": return [t, addDays(t, 29)];
      case "90": return [t, addDays(t, 89)];
      case "custom": return [state.from || t, state.to || "9999-12-31"];
      default: return [t, "9999-12-31"];
    }
  }
  const endDay = e => (e.end || e.start).slice(0, 10);

  function matches(e, skip) {
    const [from, to] = periodRange();
    if (e.recurring) {
      if (!state.recurring) return false;
      if (e.occurrences && e.occurrences.length) {
        if (!e.occurrences.some(([s, en]) => (en || s).slice(0, 10) >= from && s.slice(0, 10) <= to)) return false;
      } else if (endDay(e) < from || e.start.slice(0, 10) > to) return false;
    } else if (endDay(e) < from || e.start.slice(0, 10) > to) return false;
    if (skip !== "category" && state.categories.size && !state.categories.has(e.category)) return false;
    if (skip !== "sport" && state.sports.size && !state.sports.has(e.sport)) return false;
    if (skip !== "city" && state.cities.size && !state.cities.has(e.city)) return false;
    if (state.free && e.price !== "Gratuit") return false;
    if (state.hideTentative && e.tentative) return false;
    if (state.q) {
      const words = norm(state.q).split(/\s+/).filter(Boolean);
      if (!words.every(w => e._search.includes(w))) return false;
    }
    return true;
  }

  const sorters = {
    date: (a, b) => a._sortStart.localeCompare(b._sortStart) || a.title.localeCompare(b.title, "fr"),
    "date-desc": (a, b) => b._sortStart.localeCompare(a._sortStart) || a.title.localeCompare(b.title, "fr"),
    sport: (a, b) => a.sport.localeCompare(b.sport, "fr") || a._sortStart.localeCompare(b._sortStart),
    title: (a, b) => a.title.localeCompare(b.title, "fr"),
    category: (a, b) => ((CATEGORIES[a.category]?.order ?? 99) - (CATEGORIES[b.category]?.order ?? 99)) || a._sortStart.localeCompare(b._sortStart),
  };

  // ---------- Rendu des filtres ----------
  function renderFacet(container, key, field, values, withDot) {
    const base = ALL.filter(e => matches(e, key));
    const counts = {};
    base.forEach(e => { counts[e[field]] = (counts[e[field]] || 0) + 1; });
    const set = state[key === "category" ? "categories" : key === "sport" ? "sports" : "cities"];
    const filter = key === "sport" ? norm($("#sportSearch").value) : "";
    container.innerHTML = values
      .filter(v => !filter || norm(v).includes(filter))
      .map(v => {
        const n = counts[v] || 0;
        return `<label class="check ${n ? "" : "zero"}"><input type="checkbox" value="${esc(v)}" ${set.has(v) ? "checked" : ""}>
          ${withDot ? `<span class="dot" style="background:${catColor(v)}"></span>` : `<span>${sportIconFor(key, v)}</span>`}
          <span>${esc(v)}</span><span class="n">${n}</span></label>`;
      }).join("");
    container.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
      inp.checked ? set.add(inp.value) : set.delete(inp.value);
      state.limit = 150; update();
    }));
  }
  const sportIconFor = (key, v) => key === "sport" ? sportIcon(v) : "📍";

  function renderFilters() {
    const cats = Object.keys(CATEGORIES).filter(c => ALL.some(e => e.category === c));
    ALL.forEach(e => { if (!cats.includes(e.category)) cats.push(e.category); });
    renderFacet($("#categoryList"), "category", "category", cats, true);
    const sports = [...new Set(ALL.map(e => e.sport))].sort((a, b) => a.localeCompare(b, "fr"));
    renderFacet($("#sportList"), "sport", "sport", sports, false);
    const cityCount = {};
    ALL.forEach(e => cityCount[e.city] = (cityCount[e.city] || 0) + 1);
    const cities = Object.keys(cityCount).sort((a, b) => (a === "Paris" ? -1 : b === "Paris" ? 1 : a.localeCompare(b, "fr")));
    renderFacet($("#cityList"), "city", "city", cities, false);

    $$("#periodChips .chip").forEach(c => c.classList.toggle("active", c.dataset.period === state.period));
    const [from, to] = periodRange();
    $("#from").value = state.period === "custom" ? state.from : (state.period === "all" ? "" : from);
    $("#to").value = state.period === "custom" ? state.to : (state.period === "all" ? "" : to);
    $("#q").value !== state.q && ($("#q").value = state.q);
    $("#freeOnly").checked = state.free; $("#showRecurring").checked = state.recurring; $("#hideTentative").checked = state.hideTentative;
    $("#sort").value = state.sort;
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === state.view));
    const active = state.categories.size + state.sports.size + state.cities.size + (state.q ? 1 : 0) + (state.period !== "all" ? 1 : 0) + state.free + state.hideTentative;
    $("#activeFilters").textContent = active || "";
  }

  // ---------- Vues ----------
  function cardHTML(e, showDate) {
    const time = e.recurring ? "" : fmtTime(e.start);
    const range = e.end && e.end.slice(0, 10) !== e.start.slice(0, 10) ? `jusqu'au ${fmtShort(e.end)}` : "";
    return `<button class="card" data-id="${esc(e.id)}" style="--cat:${catColor(e.category)}">
      <span class="ico" aria-hidden="true">${sportIcon(e.sport)}</span>
      <span>
        <h3>${esc(e.title)}</h3>
        <span class="meta">
          <span>${esc(e.sport)}${e.competition ? " · " + esc(e.competition) : ""}</span>
          ${e.venue ? `<span>📍 ${esc(e.venue)}${e.city && e.city !== "Paris" ? ", " + esc(e.city) : ""}</span>` : ""}
          ${showDate ? `<span>🗓 ${esc(fmtShort(e.start))}</span>` : ""}
          ${range ? `<span>${esc(range)}</span>` : ""}
          ${e.recurring && e.schedule ? `<span>${esc(e.schedule.slice(0, 110))}</span>` : ""}
        </span>
      </span>
      <span class="right">
        ${time ? `<span class="time">${time}</span>` : ""}
        <span class="badge cat">${esc(e.category)}</span>
        ${e.price === "Gratuit" ? `<span class="badge free">Gratuit</span>` : ""}
        ${e.tentative ? `<span class="badge tentative">à confirmer</span>` : ""}
      </span>
    </button>`;
  }

  function renderList(list) {
    const el = $("#listView");
    const dated = list.filter(e => !e.recurring);
    const rec = list.filter(e => e.recurring);
    if (!list.length) { el.innerHTML = `<div class="empty">Aucun événement ne correspond à ces filtres.<br><br><button class="btn ghost" id="emptyReset">Réinitialiser</button></div>`; $("#emptyReset").onclick = reset; return; }
    let html = "";
    const shown = dated.slice(0, state.limit);
    if (state.sort.startsWith("date")) {
      let curMonth = "", curDay = "", open = false;
      shown.forEach(e => {
        const d = e._sortStart.slice(0, 10), m = d.slice(0, 7);
        if (m !== curMonth) {
          if (open) { html += "</div></div>"; open = false; }
          curMonth = m; curDay = "";
          html += `<h2 class="month-title">${parse(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>`;
        }
        if (d !== curDay) {
          if (open) html += "</div></div>";
          curDay = d; open = true;
          const dt = parse(d);
          html += `<div class="day"><div class="daybox ${d === TODAY ? "today" : ""}"><div class="dow">${DOW[dt.getDay()]}</div><div class="num">${dt.getDate()}</div><div class="mon">${dt.toLocaleDateString("fr-FR", { month: "short" })}</div></div><div class="events">`;
        }
        html += cardHTML(e, false);
      });
      if (open) html += "</div></div>";
    } else {
      html += `<div class="events">${shown.map(e => cardHTML(e, true)).join("")}</div>`;
    }
    if (dated.length > state.limit) html += `<button class="btn ghost more" id="moreBtn">Afficher plus (${dated.length - state.limit} restants)</button>`;
    if (rec.length) {
      html += `<div class="recurring-block"><h2>Activités régulières (${rec.length})</h2><p>Cours, initiations et créneaux hebdomadaires, souvent gratuits, proposés par la Ville de Paris et les associations.</p><div class="events">${rec.slice().sort(sorters.sport).map(e => cardHTML(e, false)).join("")}</div></div>`;
    }
    if (!dated.length && !rec.length) html = `<div class="empty">Aucun événement.</div>`;
    el.innerHTML = html;
    const more = $("#moreBtn"); if (more) more.onclick = () => { state.limit += 200; render(); };
  }

  function eventsByDay(list, from, to) {
    const map = {};
    const push = (d, e, time) => { (map[d] = map[d] || []).push({ e, time }); };
    list.forEach(e => {
      if (e.recurring && e.occurrences?.length) {
        e.occurrences.forEach(([s]) => { const d = s.slice(0, 10); if (d >= from && d <= to) push(d, e, fmtTime(s)); });
        return;
      }
      if (e.recurring) return; // pas de créneaux connus → pas sur la grille
      let d = e.start.slice(0, 10); const end = endDay(e);
      let guard = 0;
      while (d <= end && guard++ < 62) { if (d >= from && d <= to) push(d, e, d === e.start.slice(0, 10) ? fmtTime(e.start) : ""); d = addDays(d, 1); }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.e.recurring - b.e.recurring) || (a.time || "99").localeCompare(b.time || "99")));
    return map;
  }

  function renderCalendar(list) {
    const [y, m] = state.calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(y, m - 1, 1 - startOffset);
    const days = [];
    for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); days.push(ymd(d)); }
    if (days[35].slice(0, 7) !== state.calMonth) days.length = 35;
    const byDay = eventsByDay(list, days[0], days[days.length - 1]);
    const maxPer = window.innerWidth < 900 ? 4 : 3;
    let html = `<div class="cal-head"><h2>${first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
      <div class="cal-nav"><button class="btn ghost" data-cal="-1" aria-label="Mois précédent">‹</button><button class="btn ghost" data-cal="0">Aujourd'hui</button><button class="btn ghost" data-cal="1" aria-label="Mois suivant">›</button></div></div>
      <div class="cal">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map(d => `<div class="dow">${d}</div>`).join("")}`;
    days.forEach(d => {
      const evs = byDay[d] || [];
      html += `<div class="cell ${d.slice(0, 7) !== state.calMonth ? "out" : ""} ${d === TODAY ? "today" : ""}"><span class="dnum">${Number(d.slice(8))}</span>
        ${evs.slice(0, maxPer).map(({ e, time }) => `<button class="ev" data-id="${esc(e.id)}" style="--cat:${catColor(e.category)}" title="${esc((time ? time + " " : "") + e.title)}">${sportIcon(e.sport)} ${time ? time + " " : ""}${esc(e.title)}</button>`).join("")}
        ${evs.length > maxPer ? `<button class="ev more-ev" data-day="${d}">+${evs.length - maxPer} autres</button>` : ""}</div>`;
    });
    html += "</div>";
    $("#calendarView").innerHTML = html;
    $$("[data-cal]").forEach(b => b.onclick = () => {
      const k = Number(b.dataset.cal);
      if (k === 0) state.calMonth = TODAY.slice(0, 7);
      else { const d = new Date(y, m - 1 + k, 1); state.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
      writeHash(); render();
    });
    $$(".more-ev").forEach(b => b.onclick = ev => { ev.stopPropagation(); showDay(b.dataset.day, byDay[b.dataset.day]); });
  }

  function showDay(d, items) {
    const seen = new Set();
    const html = `<div class="m-hero" style="--cat:var(--accent)"><button class="icon-btn close" data-close>✕</button><span class="badge">${items.length} événements</span><h2 style="text-transform:capitalize">${fmtLong(d)}</h2></div>
      <div class="m-body"><div class="events">${items.filter(({ e }) => !seen.has(e.id) && seen.add(e.id)).map(({ e }) => cardHTML(e, false)).join("")}</div></div>`;
    openModal(html);
  }

  function renderMap(list) {
    if (!window.L) { $("#mapNote").textContent = "La carte n'a pas pu être chargée."; return; }
    if (!map) {
      map = L.map("map", { scrollWheelZoom: true }).setView([48.8566, 2.3422], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      mapLayer = L.layerGroup().addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 50);
    mapLayer.clearLayers();
    const groups = {};
    let missing = 0;
    list.forEach(e => {
      if (e.lat == null || e.lon == null) { missing++; return; }
      const k = e.lat.toFixed(4) + "," + e.lon.toFixed(4);
      (groups[k] = groups[k] || []).push(e);
    });
    const bounds = [];
    Object.values(groups).forEach(evs => {
      const e0 = evs[0];
      const icon = L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="map-pin" style="--cat:${catColor(e0.category)}">${sportIcon(e0.sport)}${evs.length > 1 ? `<span class="map-count">${evs.length}</span>` : ""}</div>` });
      const popup = `<b>${esc(e0.venue || "")}</b><br>${evs.slice(0, 8).map(e => `<a href="#" data-id="${esc(e.id)}">${e.recurring ? "" : esc(fmtShort(e._sortStart)) + " – "}${esc(e.title)}</a>`).join("<br>")}${evs.length > 8 ? `<br>… et ${evs.length - 8} autres` : ""}`;
      L.marker([e0.lat, e0.lon], { icon }).bindPopup(popup, { maxWidth: 300 }).addTo(mapLayer);
      bounds.push([e0.lat, e0.lon]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    $("#mapNote").textContent = `${list.length - missing} événements localisés${missing ? ` · ${missing} sans coordonnées (non affichés)` : ""}.`;
  }

  // ---------- Détail / export ----------
  function gcalLink(e) {
    const f = s => hasTime(s) ? s.replace(/[-:]/g, "") + "00" : s.replace(/-/g, "");
    let start = f(e.start), end;
    if (hasTime(e.start)) end = e.end && hasTime(e.end) ? f(e.end) : f(ymd(parse(e.start)) + "T" + pad(Math.min(23, parse(e.start).getHours() + 2)) + ":" + pad(parse(e.start).getMinutes()));
    else end = f(addDays(endDay(e), 1));
    const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${start}/${end}`, details: (e.description || "") + (e.url ? "\n" + e.url : ""), location: [e.venue, e.address || e.city].filter(Boolean).join(", "), ctz: "Europe/Paris" });
    return "https://calendar.google.com/calendar/render?" + p;
  }
  function icsFor(list) {
    const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
    const f = s => s.replace(/[-:]/g, "") + (hasTime(s) ? "00" : "");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Paris Sportif//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Paris Sportif"];
    list.filter(e => !e.recurring).forEach(e => {
      lines.push("BEGIN:VEVENT", `UID:${e.id}@paris-sportif`, `DTSTAMP:${stamp}`);
      if (hasTime(e.start)) {
        lines.push(`DTSTART;TZID=Europe/Paris:${f(e.start)}`);
        const end = e.end && hasTime(e.end) ? e.end : (() => { const d = parse(e.start); d.setHours(d.getHours() + 2); return ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); })();
        lines.push(`DTEND;TZID=Europe/Paris:${f(end)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${f(e.start.slice(0, 10))}`, `DTEND;VALUE=DATE:${f(addDays(endDay(e), 1))}`);
      }
      lines.push(`SUMMARY:${icsEsc((e.tentative ? "[à confirmer] " : "") + e.title)}`, `LOCATION:${icsEsc([e.venue, e.address || e.city].filter(Boolean).join(", "))}`,
        `DESCRIPTION:${icsEsc([e.sport, e.competition, e.description, e.url].filter(Boolean).join("\n"))}`, `CATEGORIES:${icsEsc(e.sport)}`);
      if (e.url) lines.push(`URL:${e.url}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function openModal(html) {
    $("#modalBody").innerHTML = html;
    const dlg = $("#modal");
    if (!dlg.open) dlg.showModal();
    dlg.querySelectorAll("[data-close]").forEach(b => b.onclick = () => dlg.close());
  }
  function showEvent(id) {
    const e = ALL.find(x => x.id === id); if (!e) return;
    const when = e.recurring ? (e.schedule || "Activité régulière")
      : `${fmtLong(e.start)}${hasTime(e.start) ? " à " + fmtTime(e.start) : ""}${e.end && e.end.slice(0, 10) !== e.start.slice(0, 10) ? ` → ${fmtLong(e.end)}` : ""}`;
    const nextOcc = e.recurring && e.occurrences?.length ? e.occurrences.filter(([s]) => s.slice(0, 10) >= TODAY).slice(0, 6) : [];
    openModal(`
      ${e.image ? `<img class="m-img" src="${esc(e.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <div class="m-hero" style="--cat:${catColor(e.category)}">
        <button class="icon-btn close" data-close aria-label="Fermer">✕</button>
        <span class="badge cat" style="--cat:${catColor(e.category)}">${esc(e.category)}</span>
        ${e.tentative ? `<span class="badge tentative">date à confirmer</span>` : ""}
        ${e.price === "Gratuit" ? `<span class="badge free">Gratuit</span>` : ""}
        <h2>${sportIcon(e.sport)} ${esc(e.title)}</h2>
      </div>
      <div class="m-body">
        <div class="m-row"><span>🗓</span><span style="text-transform:none">${esc(when)}</span></div>
        ${nextOcc.length ? `<div class="m-row"><span>⏱</span><span>Prochains créneaux : ${nextOcc.map(([s]) => esc(fmtShort(s) + (hasTime(s) ? " " + fmtTime(s) : ""))).join(", ")}</span></div>` : ""}
        <div class="m-row"><span>🏷</span><span>${esc(e.sport)}${e.competition ? " · " + esc(e.competition) : ""}${e.federation ? " · " + esc(e.federation) : ""}</span></div>
        ${e.venue || e.address ? `<div class="m-row"><span>📍</span><span>${esc(e.venue || "")}${e.address ? `<br><small>${esc(e.address)}</small>` : e.city ? `<br><small>${esc(e.city)}</small>` : ""}</span></div>` : ""}
        ${e.price && e.price !== "Gratuit" ? `<div class="m-row"><span>🎟</span><span>${esc(e.price)}</span></div>` : ""}
        ${e.tags?.length ? `<div class="m-row"><span>#</span><span>${e.tags.map(t => `<span class="badge">${esc(t)}</span>`).join(" ")}</span></div>` : ""}
        ${e.description ? `<p class="m-desc">${esc(e.description)}</p>` : ""}
        <div class="m-actions">
          ${e.url ? `<a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">Site officiel ↗</a>` : ""}
          ${!e.recurring ? `<a class="btn ghost" href="${esc(gcalLink(e))}" target="_blank" rel="noopener">+ Google Agenda</a><button class="btn ghost" id="icsOne">⤓ .ics</button>` : ""}
          ${e.venue || e.address ? `<a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.address || e.city].filter(Boolean).join(", "))}">Itinéraire</a>` : ""}
        </div>
        <p class="note">Source : ${esc(e.source || "—")}</p>
      </div>`);
    const b = $("#icsOne"); if (b) b.onclick = () => download(`${norm(e.title).replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.ics`, icsFor([e]));
  }

  // ---------- Stats ----------
  function renderStats(list) {
    const dated = list.filter(e => !e.recurring);
    const wkEnd = addDays(TODAY, 6);
    const week = dated.filter(e => e.start.slice(0, 10) <= wkEnd && endDay(e) >= TODAY).length;
    const sports = new Set(list.map(e => e.sport)).size;
    const free = list.filter(e => e.price === "Gratuit").length;
    $("#stats").innerHTML = [
      [dated.length, "événements datés"], [week, "dans les 7 prochains jours"], [sports, "sports différents"], [free, "gratuits"],
    ].map(([n, l]) => `<div class="stat"><b>${n.toLocaleString("fr-FR")}</b><span>${l}</span></div>`).join("");
  }

  // ---------- Boucle principale ----------
  let current = [];
  function render() {
    const list = ALL.filter(e => matches(e)).sort(sorters[state.sort] || sorters.date);
    current = list;
    const nDated = list.filter(e => !e.recurring).length, nRec = list.length - nDated;
    $("#resultCount").textContent = `${nDated} événement${nDated > 1 ? "s" : ""}${nRec ? ` + ${nRec} activités régulières` : ""}`;
    renderStats(list);
    $("#listView").hidden = state.view !== "list";
    $("#calendarView").hidden = state.view !== "calendar";
    $("#mapView").hidden = state.view !== "map";
    if (state.view === "list") renderList(list);
    else if (state.view === "calendar") renderCalendar(list);
    else renderMap(list);
  }
  function update() { renderFilters(); render(); writeHash(); }
  function reset() {
    Object.assign(state, { q: "", period: "all", from: "", to: "", categories: new Set(), sports: new Set(), cities: new Set(), free: false, recurring: false, hideTentative: false, limit: 150 });
    $("#sportSearch").value = ""; update();
  }

  function bind() {
    let qTimer;
    $("#q").addEventListener("input", e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.limit = 150; update(); }, 150); });
    $$("#periodChips .chip").forEach(c => c.onclick = () => { state.period = c.dataset.period; state.from = state.to = ""; update(); });
    ["from", "to"].forEach(id => $("#" + id).addEventListener("change", () => { state.period = "custom"; state.from = $("#from").value; state.to = $("#to").value; update(); }));
    $("#freeOnly").onchange = e => { state.free = e.target.checked; update(); };
    $("#showRecurring").onchange = e => { state.recurring = e.target.checked; update(); };
    $("#hideTentative").onchange = e => { state.hideTentative = e.target.checked; update(); };
    $("#sort").onchange = e => { state.sort = e.target.value; update(); };
    $("#sportSearch").addEventListener("input", renderFilters);
    $$("[data-clear]").forEach(b => b.onclick = () => { const k = b.dataset.clear; state[k === "category" ? "categories" : k === "sport" ? "sports" : "cities"].clear(); update(); });
    $$(".tab").forEach(t => t.onclick = () => { state.view = t.dataset.view; update(); });
    $("#resetBtn").onclick = reset;
    $("#icsAll").onclick = () => download("paris-sportif.ics", icsFor(current));
    $("#filtersBtn").onclick = () => $("#filters").classList.add("open");
    $("#closeFilters").onclick = () => $("#filters").classList.remove("open");
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-id]");
      if (t) { e.preventDefault(); showEvent(t.dataset.id); }
    });
    $("#modal").addEventListener("click", e => { if (e.target === $("#modal")) $("#modal").close(); });
    $("#themeBtn").onclick = () => {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (_) {}
    };
    window.addEventListener("hashchange", () => { readHash(); renderFilters(); render(); });
  }

  async function init() {
    try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
    readHash(); bind();
    try {
      const res = await fetch("events.json", { cache: "no-cache" });
      const data = await res.json();
      META = data.meta || {}; ALL = data.events || [];
    } catch (err) {
      $("#listView").innerHTML = `<div class="empty">Impossible de charger les événements.</div>`; return;
    }
    ALL.forEach(e => {
      e._search = norm([e.title, e.sport, e.category, e.competition, e.federation, e.venue, e.city, e.address, (e.tags || []).join(" "), e.description].join(" "));
      // pour un événement en cours (commencé avant aujourd'hui), on le range à aujourd'hui
      let s = e.start;
      if (e.recurring && e.occurrences?.length) { const nx = e.occurrences.find(([a, b]) => (b || a).slice(0, 10) >= TODAY); if (nx) s = nx[0]; }
      e._sortStart = s.slice(0, 10) < TODAY && endDay(e) >= TODAY ? TODAY + (hasTime(s) ? s.slice(10) : "") : s;
    });
    if (META.generated_at) $("#updated").textContent = `Données mises à jour le ${new Date(META.generated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · ${ALL.length} entrées`;
    update();
  }
  init();
})();
