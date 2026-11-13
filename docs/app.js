/* Paris Sportif – le programme sur la carte */
(() => {
  "use strict";

  const SPECT_CATS = new Set(["Match pro", "Grand événement", "Spectacle sportif"]);
  const BIG_RACES = /marathon de paris|semi de paris|semi-marathon de paris|20 ?km de paris|paris-versailles|tour de france|ekiden de paris|10 ?km paris centre/i;
  const isSpect = e => SPECT_CATS.has(e.category) || (e.category === "Course / épreuve participative" && BIG_RACES.test(e.title));

  const ICONS = [
    [/course à pied|marathon|trail|marche/i, "🏃"], [/futsal|football/i, "⚽"], [/rugby/i, "🏉"], [/basket/i, "🏀"],
    [/hand/i, "🤾"], [/volley/i, "🏐"], [/hockey/i, "🏒"], [/tennis de table/i, "🏓"], [/padel|tennis/i, "🎾"],
    [/badminton/i, "🏸"], [/natation|triathlon/i, "🏊"], [/cycl|vélo/i, "🚴"], [/aviron|nautis/i, "🚣"],
    [/roller|skate/i, "🛼"], [/escalade/i, "🧗"], [/judo|karat|arts martiaux/i, "🥋"], [/boxe|mma|combat|catch/i, "🥊"],
    [/escrime/i, "🤺"], [/golf/i, "⛳"], [/équitation|hippisme/i, "🏇"], [/athl/i, "🏅"], [/gym/i, "🤸"],
    [/fitness|hyrox/i, "💪"], [/patin|glace/i, "⛸️"], [/esport/i, "🎮"], [/mécaniques|moto|kart/i, "🏁"], [/danse/i, "💃"], [/échecs/i, "♟️"],
  ];
  const icon = s => (ICONS.find(([re]) => re.test(s || "")) || [0, "🏅"])[1];

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [d, t] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = (t || "0:0").split(":").map(Number); return new Date(y, m - 1, dd, h, mi); };
  const hasTime = s => !!s && s.includes("T");
  const hhmm = s => hasTime(s) ? s.slice(11, 16).replace(":", "h") : "";
  const addDays = (s, n) => { const d = parse(s.slice(0, 10)); d.setDate(d.getDate() + n); return ymd(d); };
  const TODAY = ymd(new Date());
  const TOMORROW = addDays(TODAY, 1);
  const endDay = e => (e.end || e.start).slice(0, 10);
  const dayLabel = d => d === TODAY ? "Aujourd'hui" : d === TOMORROW ? "Demain" : parse(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const shortDay = d => parse(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");

  const state = { mode: "spect", sport: "", period: "all", q: "", venue: "", sort: "date", limit: 60 };
  let ALL = [], current = [], map, markers = {}, VENUES = {};

  // ---------- état <-> URL ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.mode = p.get("mode") === "all" ? "all" : "spect";
    state.sport = p.get("sport") || ""; state.period = p.get("p") || "all";
    state.q = p.get("q") || ""; state.venue = p.get("lieu") || ""; state.sort = p.get("tri") || "date";
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.mode !== "spect") p.set("mode", state.mode);
    if (state.sport) p.set("sport", state.sport);
    if (state.period !== "all") p.set("p", state.period);
    if (state.q) p.set("q", state.q);
    if (state.venue) p.set("lieu", state.venue);
    if (state.sort !== "date") p.set("tri", state.sort);
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname);
  }

  // ---------- filtres ----------
  function range() {
    switch (state.period) {
      case "today": return [TODAY, TODAY];
      case "tomorrow": return [TOMORROW, TOMORROW];
      case "weekend": { const dow = parse(TODAY).getDay(); if (dow === 0) return [TODAY, TODAY]; const sat = addDays(TODAY, 6 - dow); return [dow === 5 ? TODAY : sat, addDays(sat, 1)]; }
      case "7": return [TODAY, addDays(TODAY, 6)];
      case "30": return [TODAY, addDays(TODAY, 29)];
      default:
        if (/^\d{4}-\d{2}$/.test(state.period)) return [state.period + "-01", state.period + "-31"];
        return [TODAY, "9999-12-31"];
    }
  }
  function base(e, skipSport) {
    if (e.recurring) return false;
    if (state.mode === "spect" && !e._spect) return false;
    const [a, b] = range();
    if (endDay(e) < a || e.start.slice(0, 10) > b) return false;
    if (!skipSport && state.sport && e.sport !== state.sport) return false;
    if (state.q) { const w = norm(state.q).split(/\s+/).filter(Boolean); if (!w.every(x => e._search.includes(x))) return false; }
    return true;
  }

  // ---------- rail ----------
  function renderRail() {
    $$(".mode").forEach(m => m.classList.toggle("active", m.dataset.mode === state.mode));
    const pool = ALL.filter(e => base(e, true));
    const counts = {};
    pool.forEach(e => counts[e.sport] = (counts[e.sport] || 0) + 1);
    const sports = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (state.sport && !counts[state.sport]) sports.unshift(state.sport);
    $("#sports").innerHTML = `<button class="sport ${!state.sport ? "active" : ""}" data-sport="">Tous <span class="n">${pool.length}</span></button>` +
      sports.map(s => `<button class="sport ${state.sport === s ? "active" : ""}" data-sport="${esc(s)}"><span>${icon(s)}</span>${esc(s)} <span class="n">${counts[s] || 0}</span></button>`).join("");
    $$("#sports .sport").forEach(b => b.onclick = () => { state.sport = b.dataset.sport; state.limit = 60; update(); });

    const months = [];
    for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
    const opts = [["all", "Tout", "à venir"], ["today", "Aujourd'hui", shortDay(TODAY)], ["tomorrow", "Demain", shortDay(TOMORROW)], ["weekend", "Ce week-end", ""], ["7", "7 jours", ""], ["30", "30 jours", ""],
      ...months.map(m => [m, parse(m + "-01").toLocaleDateString("fr-FR", { month: "long" }), m.slice(0, 4)])];
    $("#days").innerHTML = opts.map(([k, l, s]) => `<button class="day ${state.period === k ? "active" : ""}" data-p="${k}">${esc(l)}${s ? `<small>${esc(s)}</small>` : ""}</button>`).join("");
    $$("#days .day").forEach(b => b.onclick = () => { state.period = b.dataset.p; state.limit = 60; update(); });
    if ($("#q").value !== state.q) $("#q").value = state.q;
    $("#sort").value = state.sort;
  }

  // ---------- affluence ----------
  const fmtN = n => n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "").replace(".", ",") + "k" : String(n);
  const fullN = n => Math.round(n).toLocaleString("fr-FR");
  function gauge(a, big) {
    if (!a || !a.level) return "";
    const bars = [1, 2, 3, 4, 5].map(i => `<i class="${i <= a.level ? "on l" + a.level : ""}"></i>`).join("");
    return `<span class="gauge ${big ? "big" : ""}" title="Affluence attendue : ${a.n ? "≈ " + fullN(a.n) + " " + a.unit : "—"}${a.cap ? " · capacité " + fullN(a.cap) : ""}"><span class="bars">${bars}</span>${a.n ? `<b>${fmtN(a.n)}</b>` : ""}</span>`;
  }
  function availability(a) {
    if (!a || !a.fill) return "";
    if (a.fill >= .95) return `<span class="tag full">Complet probable</span>`;
    if (a.fill >= .8) return `<span class="tag hot">Places rares</span>`;
    return `<span class="tag ok">Places dispo</span>`;
  }

  // ---------- ligne de programme ----------
  function split(e) {
    if (e.category !== "Match pro") return null;
    const parts = e.title.split(/\s+[–—-]\s+|\s+vs\.?\s+/i);
    return parts.length === 2 ? parts.map(t => t.replace(/\s*\([^)]*\)\s*$/, "")) : null;
  }
  function rowHTML(e) {
    const teams = split(e);
    const cls = e.category === "Match pro" ? "cat-pro" : e.category === "Grand événement" ? "cat-big" : "";
    const multi = e.end && e.end.slice(0, 10) !== e.start.slice(0, 10);
    const when = hasTime(e.start) ? `${hhmm(e.start)}<small>${multi ? "→ " + shortDay(e.end) : ""}</small>` : `<small>${multi ? "jusqu'au" : "journée"}</small>${multi ? `<span style="font-size:14px">${shortDay(e.end)}</span>` : ""}`;
    const tags = [
      e.tentative ? `<span class="tag tbc">À confirmer</span>` : "",
      (e.tags || []).some(t => /europe/i.test(t)) || /champions|euroleague|ehf|cup/i.test(e.competition || "") ? `<span class="tag eu">Europe</span>` : "",
      e.price === "Gratuit" ? `<span class="tag free">Gratuit</span>` : "",
    ].join("");
    return `<button class="row ${cls}" data-id="${esc(e.id)}" data-v="${esc(e._vkey || "")}">
      <span class="when">${when}</span>
      <span class="mid">
        <span class="comp"><span class="s">${icon(e.sport)} ${esc(e.sport)}</span>${e.competition ? `· ${esc(e.competition)}` : ""} ${tags}</span>
        <span class="teams">${teams ? `<span class="h">${esc(teams[0])}</span><span class="a">${esc(teams[1])}</span>` : `<span class="solo">${esc(e.title)}</span>`}</span>
        <span class="place"><span class="pl">📍 ${esc(e.venue || e.city || "Paris")}${e.city && e.city !== "Paris" && !(e.venue || "").includes(e.city) ? " · " + esc(e.city) : ""}</span>${gauge(e.aff)}${availability(e.aff)}</span>
      </span>
      <span class="go">›</span>
    </button>`;
  }

  function renderList(list) {
    const el = $("#list");
    const shown = state.venue ? list.filter(e => e._vkey === state.venue) : list;
    $("#boardTitle").innerHTML = `${state.mode === "spect" ? "À l'affiche" : "Programme"} <span>${shown.length}</span>`;
    $("#venueFilter").innerHTML = state.venue && VENUES[state.venue] ? `<div class="vf">📍 ${esc(VENUES[state.venue].name)} <button id="clearVenue">✕ Tous les lieux</button></div>` : "";
    const cv = $("#clearVenue"); if (cv) cv.onclick = () => selectVenue("");
    if (!shown.length) { el.innerHTML = `<div class="empty">Rien au programme<br><small>Élargissez la période ou passez en « Tout le sport »</small></div>`; return; }
    let html = "";
    const sl = shown.slice(0, state.limit);
    if (state.sort === "date") {
      let cur = "";
      sl.forEach(e => {
        const d = e._day;
        if (d !== cur) { cur = d; const n = shown.filter(x => x._day === d).length; html += `<div class="dayhead ${d === TODAY ? "today" : ""}">${esc(dayLabel(d))}<span>${n} évt${n > 1 ? "s" : ""}</span></div>`; }
        html += rowHTML(e);
      });
    } else {
      const key = state.sort === "sport" ? (e => e.sport) : state.sort === "aff" ? (e => ["", "Moins de 1 000", "1 000 – 5 000", "5 000 – 15 000", "15 000 – 40 000", "Plus de 40 000"][e.aff?.level || 0] || "Affluence inconnue") : (e => e.venue || e.city);
      let cur = null;
      sl.forEach(e => { const k = key(e); if (k !== cur) { cur = k; html += `<div class="dayhead">${state.sort === "sport" ? icon(k) + " " : state.sort === "aff" ? "👥 " : "📍 "}${esc(k)}</div>`; } html += rowHTML(e); });
    }
    if (shown.length > state.limit) html += `<button class="more" id="more">Voir ${Math.min(60, shown.length - state.limit)} de plus · ${shown.length - state.limit} restants</button>`;
    el.innerHTML = html;
    const m = $("#more"); if (m) m.onclick = () => { state.limit += 60; renderList(current); };
  }

  // ---------- à la une ----------
  function renderFeature(list) {
    const STAR = /\bPSG\b(?! (handball|f[ée]minines))|paris saint-germain|^france –|roland-garros|marathon de paris|tour de france|arc de triomphe|prix d'am[ée]rique|\bNBA\b|grand slam|diamond league|meeting de paris|six nations|finale|euroleague/i;
    const soon = list.filter(e => !e.tentative && e._day <= addDays(TODAY, 45));
    const pick = soon.find(e => STAR.test(e.title) || STAR.test(e.competition || "")) || list.find(e => e.category === "Grand événement" && !e.tentative) || list[0];
    if (!pick) { $("#feature").innerHTML = ""; return; }
    const days = Math.round((parse(pick.start.slice(0, 10)) - parse(TODAY)) / 864e5);
    const cd = days <= 0 ? `LIVE<small>${days === 0 ? "aujourd'hui" : "en cours"}</small>` : `J-${days}<small>${days === 1 ? "demain" : "jours"}</small>`;
    $("#feature").innerHTML = `<button class="feat" data-id="${esc(pick.id)}" data-v="${esc(pick._vkey || "")}">
      <span class="k">★ À la une</span><span class="cd">${cd}</span>
      <span class="t">${esc(pick.title)}</span>
      <span class="m">${esc(dayLabel(pick._day))}${hasTime(pick.start) ? " · " + hhmm(pick.start) : ""} · ${esc(pick.venue || pick.city)}${pick.aff?.n ? ` · ≈ ${fullN(pick.aff.n)} ${esc(pick.aff.unit)}` : ""}</span>
    </button>`;
  }

  // ---------- carte ----------
  function initMap() {
    if (!window.L) return;
    map = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 9 }).setView([48.862, 2.33], 12);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on("click", () => { if (state.venue) selectVenue(""); });
  }
  function renderMap(list) {
    if (!map) return;
    Object.values(markers).forEach(m => m.remove());
    markers = {};
    const groups = {};
    list.forEach(e => { if (e._vkey) (groups[e._vkey] = groups[e._vkey] || []).push(e); });
    const max = Math.max(1, ...Object.values(groups).map(g => g.length));
    Object.entries(groups).forEach(([k, evs]) => {
      const v = VENUES[k];
      const pro = evs.some(e => e.category === "Match pro"), big = evs.some(e => e.category === "Grand événement");
      const color = pro ? "red" : big ? "green" : "white";
      const hot = evs.some(e => e._day <= TOMORROW);
      const sports = [...new Set(evs.map(e => e.sport))];
      const cls = `pin ${color} ${hot ? "hot" : ""} ${evs.length >= Math.max(4, max * .25) ? "big" : ""} ${state.venue === k ? "sel" : ""}`;
      const html = `<div class="${cls}" data-v="${esc(k)}"><span class="em">${sports.slice(0, 2).map(icon).join("")}</span>${evs.length}<span class="lbl">${esc(v.name)}</span></div>`;
      const mk = L.marker([v.lat, v.lon], { icon: L.divIcon({ className: "pin-wrap", html, iconSize: null }), riseOnHover: true, zIndexOffset: evs.length * 10 + (hot ? 500 : 0) });
      mk.on("click", ev => { L.DomEvent.stopPropagation(ev); selectVenue(state.venue === k ? "" : k); });
      mk.on("mouseover", () => hoverVenue(k, true)); mk.on("mouseout", () => hoverVenue(k, false));
      mk.addTo(map);
      markers[k] = mk;
    });
  }
  function hoverVenue(k, on) {
    $$(`.row[data-v="${CSS.escape(k)}"]`).forEach(r => r.classList.toggle("hover", on));
    const el = markers[k]?.getElement()?.querySelector(".pin"); if (el) el.classList.toggle("hover", on);
  }
  function selectVenue(k, fly = true) {
    state.venue = k; state.limit = 60;
    const card = $("#venueCard");
    if (k && VENUES[k]) {
      const v = VENUES[k];
      const evs = current.filter(e => e._vkey === k);
      card.innerHTML = `<div class="vc-head"><div><h3>${esc(v.name)}</h3><p>${esc(v.city)} · ${evs.length} événement${evs.length > 1 ? "s" : ""} · ${[...new Set(evs.map(e => icon(e.sport)))].join(" ")}</p></div><button class="x" data-close-venue aria-label="Fermer">✕</button></div>
        ${evs.slice(0, 6).map(rowHTML).join("")}${evs.length > 6 ? `<div class="empty" style="padding:10px;font-size:14px">+ ${evs.length - 6} dans le programme →</div>` : ""}`;
      card.hidden = false;
      card.querySelector("[data-close-venue]").onclick = () => selectVenue("");
      if (map && fly) map.flyTo([v.lat, v.lon], Math.max(map.getZoom(), 14), { duration: .6 });
    } else card.hidden = true;
    Object.entries(markers).forEach(([kk, m]) => m.getElement()?.querySelector(".pin")?.classList.toggle("sel", kk === k));
    renderList(current); writeHash();
    if (fly && window.innerWidth <= 820 && k) $("#board").scrollIntoView({ behavior: "smooth" });
  }

  // ---------- ticker ----------
  function renderTicker(list) {
    const items = list.filter(e => e._day >= TODAY).slice(0, 18);
    const html = items.map(e => `<button data-id="${esc(e.id)}"><b>${esc(e._day === TODAY ? "Auj." : shortDay(e._day))}${hasTime(e.start) ? " " + hhmm(e.start) : ""}</b>${icon(e.sport)} ${esc(e.title)}</button>`).join("");
    $("#ticker").innerHTML = html + html;
  }

  // ---------- détail ----------
  function gcal(e) {
    const f = s => hasTime(s) ? s.replace(/[-:]/g, "") + "00" : s.replace(/-/g, "");
    let end;
    if (hasTime(e.start)) { const d = parse(e.start); d.setHours(d.getHours() + 2); end = e.end && hasTime(e.end) ? f(e.end) : f(ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())); }
    else end = f(addDays(endDay(e), 1));
    return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${f(e.start)}/${end}`, details: [e.competition, e.url].filter(Boolean).join("\n"), location: [e.venue, e.address || e.city].filter(Boolean).join(", "), ctz: "Europe/Paris" });
  }
  function ics(list) {
    const x = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);
    const f = s => s.replace(/[-:]/g, "") + (hasTime(s) ? "00" : "");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const L2 = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Paris Sportif//FR", "X-WR-CALNAME:Paris Sportif"];
    list.forEach(e => {
      L2.push("BEGIN:VEVENT", `UID:${e.id}@paris-sportif`, `DTSTAMP:${stamp}`);
      if (hasTime(e.start)) { const d = parse(e.start); d.setHours(d.getHours() + 2); const en = e.end && hasTime(e.end) ? e.end : ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); L2.push(`DTSTART;TZID=Europe/Paris:${f(e.start)}`, `DTEND;TZID=Europe/Paris:${f(en)}`); }
      else L2.push(`DTSTART;VALUE=DATE:${f(e.start.slice(0, 10))}`, `DTEND;VALUE=DATE:${f(addDays(endDay(e), 1))}`);
      L2.push(`SUMMARY:${x((e.tentative ? "[à confirmer] " : "") + e.title)}`, `LOCATION:${x([e.venue, e.address || e.city].filter(Boolean).join(", "))}`, `DESCRIPTION:${x([e.sport, e.competition, e.url].filter(Boolean).join("\n"))}`);
      if (e.url) L2.push(`URL:${e.url}`);
      L2.push("END:VEVENT");
    });
    L2.push("END:VCALENDAR");
    return L2.join("\r\n");
  }
  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function show(id) {
    const e = ALL.find(x => x.id === id); if (!e) return;
    const teams = split(e);
    const multi = e.end && e.end.slice(0, 10) !== e.start.slice(0, 10);
    $("#modalBody").innerHTML = `
      <div class="m-top">
        <button class="x" data-close aria-label="Fermer">✕</button>
        <span class="comp">${icon(e.sport)} ${esc(e.sport)}${e.competition ? " · " + esc(e.competition) : ""}</span>
        ${teams ? `<div class="m-vs"><span>${esc(teams[0])}</span><span class="vs">VS</span><span class="a">${esc(teams[1])}</span></div>` : `<h2>${esc(e.title)}</h2>`}
      </div>
      ${e.aff ? `<div class="m-aff">
        <div class="k">Affluence attendue</div>
        <div class="row-aff">${gauge(e.aff, true)}<div><div class="v">${e.aff.n ? `≈ ${fullN(e.aff.n)} <small>${esc(e.aff.unit)}</small>` : "—"}</div>
        ${e.aff.cap ? `<div class="capbar"><span style="width:${Math.round((e.aff.fill || 0) * 100)}%"></span></div><div class="cap">Capacité ${fullN(e.aff.cap)} places${e.aff.fill ? ` · remplissage estimé ${Math.round(e.aff.fill * 100)} %` : ""} ${availability(e.aff)}</div>` : ""}</div></div>
        <div class="basis">${e.aff.basis ? "Base : " + esc(e.aff.basis) + (e.aff.approx ? " (approx.)" : "") : "Capacité du lieu uniquement"}${e.aff.src ? ` · <a href="${esc(e.aff.src)}" target="_blank" rel="noopener">source</a>` : ""}. Estimation : le nombre exact de places restantes n'est pas publié, vérifiez sur la billetterie.</div>
      </div>` : ""}
      <div class="m-grid">
        <div class="m-cell"><div class="k">Date</div><div class="v">${esc(dayLabel(e.start.slice(0, 10)))}${multi ? `<small>jusqu'au ${esc(dayLabel(e.end.slice(0, 10)))}</small>` : ""}</div></div>
        <div class="m-cell"><div class="k">Heure</div><div class="v">${hasTime(e.start) ? hhmm(e.start) : "—"}${e.tentative ? `<small><span class="tag tbc">Date à confirmer</span></small>` : ""}</div></div>
        <div class="m-cell"><div class="k">Lieu</div><div class="v">${esc(e.venue || e.city)}${e.address ? `<small>${esc(e.address)}</small>` : ""}</div></div>
        <div class="m-cell"><div class="k">Organisation</div><div class="v">${esc(e.federation || e.category)}${e.price ? `<small>${esc(e.price)}</small>` : ""}</div></div>
      </div>
      ${e.description ? `<p class="m-desc">${esc(e.description)}</p>` : ""}
      <div class="m-act">
        ${e.url ? `<a class="btn go" href="${esc(e.url)}" target="_blank" rel="noopener">Billets / infos ↗</a>` : ""}
        <a class="btn" href="${esc(gcal(e))}" target="_blank" rel="noopener">+ Agenda</a>
        <button class="btn" id="icsOne">ICS ⤓</button>
        ${e._vkey ? `<button class="btn" id="onMap">Sur la carte</button>` : ""}
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([e.venue, e.address || e.city].filter(Boolean).join(", "))}">Itinéraire</a>
      </div>
      <p class="m-src">Source : ${esc(e.source || "—")}</p>`;
    const dlg = $("#modal"); if (!dlg.open) dlg.showModal();
    dlg.querySelector("[data-close]").onclick = () => dlg.close();
    $("#icsOne").onclick = () => download(norm(e.title).replace(/[^a-z0-9]+/g, "-").slice(0, 50) + ".ics", ics([e]));
    const om = $("#onMap"); if (om) om.onclick = () => { dlg.close(); selectVenue(e._vkey); if (window.innerWidth <= 820) $(".mapzone").scrollIntoView({ behavior: "smooth" }); };
  }

  // ---------- boucle ----------
  const SORTS = {
    date: (a, b) => a._sortKey.localeCompare(b._sortKey),
    sport: (a, b) => a.sport.localeCompare(b.sport, "fr") || a._sortKey.localeCompare(b._sortKey),
    venue: (a, b) => (a.venue || a.city).localeCompare(b.venue || b.city, "fr") || a._sortKey.localeCompare(b._sortKey),
    aff: (a, b) => ((b.aff?.n || 0) - (a.aff?.n || 0)) || a._sortKey.localeCompare(b._sortKey),
  };
  function render() {
    current = ALL.filter(e => base(e)).sort(SORTS[state.sort] || SORTS.date);
    if (state.venue && !current.some(e => e._vkey === state.venue)) { state.venue = ""; $("#venueCard").hidden = true; }
    const today = current.filter(e => e._day === TODAY).length;
    $("#liveCount").innerHTML = `<span class="dot"></span><b>${today}</b> aujourd'hui`;
    renderFeature(current.slice().sort(SORTS.date));
    renderList(current);
    renderMap(current);
    renderTicker(current.slice().sort(SORTS.date));
    if (state.venue) selectVenue(state.venue, false);
  }
  function update() { renderRail(); render(); writeHash(); }

  function bind() {
    $$(".mode").forEach(m => m.onclick = () => { state.mode = m.dataset.mode; state.sport = ""; state.limit = 60; update(); });
    let t; $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); state.limit = 60; update(); }, 160); });
    $("#sort").onchange = e => { state.sort = e.target.value; update(); };
    $("#icsAll").onclick = () => download("paris-sportif.ics", ics(state.venue ? current.filter(e => e._vkey === state.venue) : current));
    $("#boardToggle").onclick = () => $("#board").scrollIntoView({ behavior: "smooth" });
    document.addEventListener("click", ev => { const r = ev.target.closest("[data-id]"); if (r) { ev.preventDefault(); show(r.dataset.id); } });
    document.addEventListener("mouseover", ev => { const r = ev.target.closest(".row[data-v], .feat[data-v]"); if (r && r.dataset.v) hoverVenue(r.dataset.v, true); });
    document.addEventListener("mouseout", ev => { const r = ev.target.closest(".row[data-v], .feat[data-v]"); if (r && r.dataset.v) hoverVenue(r.dataset.v, false); });
    $("#modal").addEventListener("click", ev => { if (ev.target === $("#modal")) $("#modal").close(); });
    $(".logo").onclick = ev => { ev.preventDefault(); Object.assign(state, { mode: "spect", sport: "", period: "all", q: "", venue: "", sort: "date", limit: 60 }); update(); map && map.flyTo([48.862, 2.33], 12); };
  }

  async function init() {
    readHash(); bind(); initMap();
    let data;
    try { data = await (await fetch("events.json", { cache: "no-cache" })).json(); }
    catch (_) { $("#list").innerHTML = `<div class="empty">Impossible de charger le programme</div>`; return; }
    ALL = data.events || [];
    ALL.forEach(e => {
      e._spect = isSpect(e);
      e._search = norm([e.title, e.sport, e.category, e.competition, e.federation, e.venue, e.city, (e.tags || []).join(" ")].join(" "));
      e._day = e.start.slice(0, 10) < TODAY && endDay(e) >= TODAY ? TODAY : e.start.slice(0, 10);
      e._sortKey = e._day + (hasTime(e.start) ? e.start.slice(10) : "T99");
      if (e.lat != null && e.lon != null && !/pr[ée]ciser/i.test(e.venue || "")) {
        const k = e.lat.toFixed(3) + "," + e.lon.toFixed(3);
        e._vkey = k;
        if (!VENUES[k]) VENUES[k] = { name: e.venue || e.city, city: e.city || "Paris", lat: e.lat, lon: e.lon, n: 0 };
        VENUES[k].n++;
        if (e.venue && e.venue.length < VENUES[k].name.length) VENUES[k].name = e.venue; // nom le plus court = le plus lisible
      }
    });
    update();
    window.addEventListener("hashchange", () => { readHash(); renderRail(); render(); });
  }
  init();
})();
