import { mapListToDOMElements, createDOMElem } from "./domInteractions.js";
import {
  getShowsByKey,
  getShowFullById,
  getTopRatedShows,
  getScheduleForDate,
} from "./request.js";

const PAGE_SIZE = 10;
const TEASER_STEP = 10;
const SUGG_LIMIT = 7;
const FAV_KEY = "cineview_favs_v1";
const PREF_KEY = "cineview_schedule_prefs_v1";
const SCHEDULE_COUNTRIES = [
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "SE",
  "DK",
  "NO",
  "PL",
  "JP",
  "KR",
  "BR",
  "MX",
];

const q = (sel, ctx = document) => ctx.querySelector(sel);
const qa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const decodeEntities = (s = "") =>
  String(s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const cleanText = (html = "") =>
  decodeEntities(
    String(html)
      .replace(/<[^>]*>/g, " ")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*([,.;:!?])\s*/g, "$1 ")
      .replace(/\(\s*\)/g, "")
      .trim()
  );

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

class TvApp {
  state = {
    query: "",
    results: [],
    page: 1,
    totalPages: 1,
    top: [],
    teaserLimit: 10,
    mode: "home",
    scheduleMeta: null,
    lastQuery: "",
    lastQueryAt: 0,
    searchToken: 0,
    scheduleFirstEntry: false,
    suggIndex: -1,
  };

  els = {};
  resizeHandler = null;
  lastActiveEl = null;

  constructor() {
    this.init();
  }

  init() {
    this.connect();
    this.bind();
    window.addEventListener(
      "resize",
      () => {
        if (this.els.pagination && this.state.totalPages > 1)
          this.renderPagination();
      },
      { passive: true }
    );
    this.initPrefs();
    this.fetchTop();
    this.updateFavToggleUI();
    this.updateScheduleButtonUI();
    this.hideScheduleBar();
    this.showHome();
  }

  connect() {
    const ids = qa("[id]").map((el) => el.id);
    this.els = mapListToDOMElements(ids, "id");

    this.els.searchInput = q("#searchInput");
    this.els.searchBtn = q("#searchBtn");
    this.els.suggestions = q("#suggestions");

    this.els.overlay = q("#overlay");
    this.els.preview = q("#showPreview");
    this.els.body = document.body;

    this.els.home = q("#home");
    this.els.logo = q("#logo");
    this.els.exploreBtn = q("#exploreBtn");
    this.els.teasers = q("#teasers");
    this.els.teasersControls = q("#teasersControls");

    this.els.showsWrapper = q("#showsWrapper");
    this.els.pagination = null;

    this.els.scheduleBtn = q("#scheduleBtn");
    this.els.favBtn = q('[data-role="fav-toggle"]');
    this.els.scheduleBar = q("#scheduleBar");
    this.els.scheduleInfo = q("#scheduleInfo");
    this.els.editScheduleBtn = q("#editScheduleBtn");

    this.els.sheet = q("#scheduleSheet");
    this.els.sheetBackdrop = q("#sheetBackdrop");
    this.els.sheetClose = q("#sheetClose");
    this.els.sheetCancel = q("#sheetCancel");
    this.els.sheetApply = q("#sheetApply");
    this.els.dateInput = q("#dateInput");

    this.els.header = q(".header");
    this.els.main = q("main");
  }

  bind() {
    this.els.searchBtn?.addEventListener("click", () => this.doSearch());
    let suggTimer;
    this.els.searchInput?.addEventListener("input", () => {
      clearTimeout(suggTimer);
      suggTimer = setTimeout(() => this.showSuggestions(), 300);
    });
    this.els.searchInput?.addEventListener("keydown", (e) => {
      const items = Array.from(
        this.els.suggestions?.querySelectorAll(".suggestion-item") || []
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!items.length) return;
        this.state.suggIndex = (this.state.suggIndex + 1) % items.length;
        this.updateActiveSuggestion(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        this.state.suggIndex =
          (this.state.suggIndex - 1 + items.length) % items.length;
        this.updateActiveSuggestion(items);
      } else if (e.key === "Enter") {
        const el = items[this.state.suggIndex];
        if (el) el.click();
        else this.doSearch();
      } else if (e.key === "Escape") {
        this.closeSuggestions();
      }
    });
    document.addEventListener("click", (e) => {
      if (
        !this.els.suggestions.contains(e.target) &&
        e.target !== this.els.searchInput
      )
        this.closeSuggestions();
    });

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-show-id]");
      if (!btn) return;
      const id = btn.getAttribute("data-show-id");
      if (id) this.openDetails(id, btn);
    });

    this.els.overlay?.addEventListener("click", () => this.closeDetails());

    this.els.logo?.addEventListener("click", () => {
      this.setMode("home");
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
      }
    });
    this.els.exploreBtn?.addEventListener("click", () => {
      this.els.teasers?.scrollIntoView({ behavior: "smooth", block: "start" });
      this.flashTeasers();
    });

    this.els.scheduleBtn?.addEventListener("click", () =>
      this.setMode("schedule")
    );
    this.els.editScheduleBtn?.addEventListener("click", () => this.openSheet());

    this.els.sheetClose?.addEventListener("click", () => this.closeSheet());
    this.els.sheetCancel?.addEventListener("click", () => this.closeSheet());
    this.els.sheetBackdrop?.addEventListener("click", () => this.closeSheet());
    this.els.sheetApply?.addEventListener("click", () => this.applySchedule());
    this.els.dateInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.applySchedule();
    });

    this.els.favBtn?.addEventListener("click", () =>
      this.setMode(this.state.mode === "favorites" ? "home" : "favorites")
    );
  }

  initPrefs() {
    const d = this.loadPrefs()?.date;
    this.els.dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(d || "")
      ? d
      : todayISO();
  }
  loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY)) || null;
    } catch {
      return null;
    }
  }
  savePrefs() {
    try {
      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({ date: this.els.dateInput.value || todayISO() })
      );
    } catch {}
  }

  readFavs() {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
    } catch {
      return [];
    }
  }
  writeFavs(arr) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(arr));
    } catch {}
  }
  isFav(id) {
    return this.readFavs().some((s) => String(s.id) === String(id));
  }
  toggleFav(show) {
    const favs = this.readFavs();
    const i = favs.findIndex((s) => String(s.id) === String(show.id));
    if (i >= 0) favs.splice(i, 1);
    else
      favs.push({
        id: show.id,
        name: show.name,
        image: show.image || null,
        summary: show.summary || "",
      });
    this.writeFavs(favs);
    if (this.state.mode === "favorites") {
      if (!this.readFavs().length) this.setMode("home");
      else this.renderSource();
    }
    this.syncFavIcons();
    this.updateFavToggleUI();
  }

  updateFavToggleUI() {
    if (!this.els.favBtn) return;
    const on = this.state.mode === "favorites";
    this.els.favBtn.textContent = on ? "All shows" : "Favourites";
    this.els.favBtn.classList.remove("active");
    this.els.favBtn.setAttribute("aria-pressed", String(on));
  }
  updateScheduleButtonUI() {
    const active = this.state.mode === "schedule";
    this.els.scheduleBtn?.classList.toggle("active", active);
    this.els.scheduleBtn?.setAttribute("aria-pressed", String(active));
  }

  clearSearchIfNotSearchMode() {
    if (this.state.mode !== "search" && this.els.searchInput)
      this.els.searchInput.value = "";
  }

  setMode(mode) {
    const prev = this.state.mode;
    if (mode === this.state.mode && mode !== "search") return;
    this.state.mode = mode;
    this.updateFavToggleUI();
    this.updateScheduleButtonUI();
    this.clearSearchIfNotSearchMode();

    if (mode === "home") {
      this.hideScheduleBar();
      this.showHome();
    } else if (mode === "favorites") {
      this.hideScheduleBar();
      this.showFavorites();
    } else if (mode === "search") {
      this.hideScheduleBar();
      this.fetchResults();
    } else if (mode === "schedule") {
      this.state.scheduleFirstEntry = prev !== "schedule";
      this.openScheduleForCurrentDate(this.state.scheduleFirstEntry);
    }
  }

  showFavorites() {
    this.hideHome();
    this.state.results = this.readFavs();
    this.state.page = 1;
    this.state.totalPages = Math.max(
      1,
      Math.ceil(this.state.results.length / PAGE_SIZE)
    );
    this.renderPage();
  }

  syncFavIcons() {
    qa("[data-fav-id]").forEach((btn) => {
      const id = btn.getAttribute("data-fav-id");
      const pressed = this.isFav(id);
      btn.textContent = pressed ? "★" : "☆";
      btn.setAttribute("aria-pressed", String(pressed));
      const label = pressed ? "Remove from favourites" : "Add to favourites";
      btn.setAttribute("aria-label", label);
    });
  }

  showHome() {
    this.hideScheduleBar();
    this.els.home.style.display = "block";
    this.els.showsWrapper.innerHTML = "";
    if (this.els.pagination) this.els.pagination.innerHTML = "";
  }
  hideHome() {
    this.els.home.style.display = "none";
  }

  fetchTop() {
    this.renderTeasersSkeletons(this.state.teaserLimit);
    getTopRatedShows()
      .then((shows) => {
        this.state.top = shows || [];
        this.renderTeasers();
      })
      .catch(() => this.renderTeasersError());
  }

  renderTeasersSkeletons(n = 10) {
    const box = this.els.teasers;
    if (!box) return;
    box.innerHTML = "";
    this.els.teasersControls.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const card = document.createElement("div");
      card.className = "skeleton-card";
      const thumb = document.createElement("div");
      thumb.className = "skel-thumb";
      const body = document.createElement("div");
      body.className = "skel-body";
      ["long", "mid", "short"].forEach((c) => {
        const l = document.createElement("div");
        l.className = `skel-line ${c}`;
        body.appendChild(l);
      });
      card.append(thumb, body);
      box.appendChild(card);
    }
  }
  renderTeasersError() {
    const box = this.els.teasers;
    if (!box) return;
    box.innerHTML = "";
    this.els.teasersControls.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const h = document.createElement("h3");
    h.textContent = "Top rated unavailable";
    const p = document.createElement("p");
    p.textContent =
      "Could not load the top list. Check your connection and retry.";
    const b = createDOMElem("button", "button secondary", "Retry");
    b.addEventListener("click", () => this.fetchTop());
    wrap.append(h, p, b);
    box.appendChild(wrap);
  }
  renderTeasers() {
    const total = this.state.top.length;
    const limit = Math.min(this.state.teaserLimit, total);
    const items = this.state.top.slice(0, limit);
    const box = this.els.teasers;
    if (!box) return;
    box.innerHTML = "";
    this.els.teasersControls.innerHTML = "";
    if (!items.length) return this.renderTeasersError();

    items.forEach((show) => box.appendChild(this.buildShowCard(show)));
    if (total > limit) {
      const more = createDOMElem("button", "button secondary", "Show more");
      more.addEventListener("click", () => {
        const y = window.scrollY;
        this.state.teaserLimit = Math.min(limit + TEASER_STEP, total);
        this.renderTeasers();
        try {
          window.scrollTo({ top: y });
        } catch {
          window.scrollTo(0, y);
        }
        more.blur?.();
      });
      this.els.teasersControls.appendChild(more);
    }
    this.syncFavIcons();
  }
  flashTeasers() {
    const t = this.els.teasers;
    if (!t) return;
    t.classList.add("teasers-highlight");
    setTimeout(() => t.classList.remove("teasers-highlight"), 1200);
  }

  showSuggestions() {
    const qv = (this.els.searchInput?.value || "").trim().toLowerCase();
    const box = this.els.suggestions;
    if (!box) return;
    box.innerHTML = "";
    if (qv.length < 2) {
      this.state.suggIndex = -1;
      return this.closeSuggestions();
    }

    if (!this.state.top.length) {
      const retry = createDOMElem(
        "div",
        "suggestion-item",
        "Top list not loaded – Retry"
      );
      retry.addEventListener("click", () => {
        this.fetchTop();
        this.closeSuggestions();
      });
      box.appendChild(retry);
      box.classList.add("open");
      this.els.searchInput.setAttribute("aria-expanded", "true");
      return;
    }

    const matches = this.state.top
      .filter((s) => s.name?.toLowerCase().includes(qv))
      .slice(0, SUGG_LIMIT);
    if (!matches.length) {
      const empty = createDOMElem("div", "suggestion-empty", "No suggestions…");
      box.appendChild(empty);
      box.classList.add("open");
      this.els.searchInput.setAttribute("aria-expanded", "true");
      return;
    }

    matches.forEach((show, idx) => {
      const item = createDOMElem("div", "suggestion-item", show.name);
      item.setAttribute("role", "option");
      item.id = `sugg-${idx}`;
      item.tabIndex = 0;
      item.addEventListener("click", () => {
        this.els.searchInput.value = show.name;
        this.state.query = show.name;
        this.setMode("search");
        this.closeSuggestions();
      });
      box.appendChild(item);
    });
    box.classList.add("open");
    this.els.searchInput.setAttribute("aria-expanded", "true");
    this.state.suggIndex = 0;
    this.updateActiveSuggestion(
      Array.from(box.querySelectorAll(".suggestion-item"))
    );
  }
  closeSuggestions() {
    this.els.suggestions.classList.remove("open");
    this.els.searchInput?.setAttribute("aria-expanded", "false");
    this.els.suggestions.innerHTML = "";
    this.els.searchInput?.removeAttribute("aria-activedescendant");
    this.state.suggIndex = -1;
  }
  updateActiveSuggestion(items) {
    items.forEach((el, i) =>
      el.classList.toggle("active", i === this.state.suggIndex)
    );
    const activeEl = items[this.state.suggIndex];
    if (activeEl) {
      this.els.searchInput?.setAttribute("aria-activedescendant", activeEl.id);
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }

  doSearch() {
    const qv = (this.els.searchInput?.value || "").trim();
    if (!qv) return;
    const now = Date.now();
    if (this.state.lastQuery === qv && now - this.state.lastQueryAt < 750)
      return;
    this.state.lastQuery = qv;
    this.state.lastQueryAt = now;

    this.state.query = qv;
    this.state.searchToken++;
    this.setMode("search");
  }

  showSkeletons(n = PAGE_SIZE) {
    const wrap = this.els.showsWrapper;
    wrap.innerHTML = "";
    if (this.els.pagination) this.els.pagination.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const card = document.createElement("div");
      card.className = "skeleton-card";
      const thumb = document.createElement("div");
      thumb.className = "skel-thumb";
      const body = document.createElement("div");
      body.className = "skel-body";
      ["long", "mid", "short"].forEach((c) => {
        const l = document.createElement("div");
        l.className = `skel-line ${c}`;
        body.appendChild(l);
      });
      card.append(thumb, body);
      wrap.appendChild(card);
    }
  }

  fetchResults() {
    this.hideHome();
    this.showSkeletons();
    const token = this.state.searchToken;
    getShowsByKey(this.state.query)
      .then((arr) => {
        if (token !== this.state.searchToken) return;
        this.state.results = (arr || []).map((r) => r.show).filter(Boolean);
        this.state.page = 1;
        this.state.totalPages = Math.max(
          1,
          Math.ceil(this.state.results.length / PAGE_SIZE)
        );
        this.renderSource();
      })
      .catch(() => {
        if (token !== this.state.searchToken) return;
        this.state.results = [];
        this.state.page = 1;
        this.state.totalPages = 1;
        this.renderSource("Something went wrong.");
      });
  }

  renderSource(error = "") {
    if (this.state.mode === "favorites") {
      this.state.results = this.readFavs();
      this.state.page = 1;
      this.state.totalPages = Math.max(
        1,
        Math.ceil(this.state.results.length / PAGE_SIZE)
      );
    }
    this.renderPage(error);
  }

  scrollToResultsTop() {
    const wrap = this.els.showsWrapper;
    if (!wrap) return;
    const headerH = this.els.header?.offsetHeight || 0;
    const y = Math.max(
      0,
      wrap.getBoundingClientRect().top + window.scrollY - headerH - 8
    );
    try {
      window.scrollTo({ top: y, behavior: "smooth" });
    } catch {
      window.scrollTo(0, y);
    }
  }

  renderPage(error = "") {
    const wrap = this.els.showsWrapper;

    if (!this.state.results.length) {
      wrap.innerHTML = "";
      if (this.els.pagination) this.els.pagination.innerHTML = "";
      const box = document.createElement("div");
      box.className = "empty-state";
      const h = document.createElement("h3");
      h.textContent =
        this.state.mode === "favorites"
          ? "No favourites yet"
          : this.state.mode === "schedule"
          ? "No shows on schedule"
          : "No results";
      const p = document.createElement("p");
      p.textContent =
        this.state.mode === "favorites"
          ? "Add shows to your favourites and they will appear here."
          : error ||
            (this.state.mode === "schedule"
              ? "Try a different date."
              : "Try a different query or pick one of the suggestions above.");
      const btn = createDOMElem(
        "button",
        "button secondary",
        this.state.mode === "favorites" ? "All shows" : "Home"
      );
      btn.addEventListener("click", () => this.setMode("home"));
      if (this.state.mode === "schedule") {
        const change = createDOMElem("button", "button", "Change date");
        change.addEventListener("click", () => this.openSheet());
        box.append(h, p, btn, change);
      } else {
        box.append(h, p, btn);
      }
      wrap.appendChild(box);
      return;
    }

    const start = (this.state.page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = this.state.results.slice(start, end);

    wrap.innerHTML = "";
    if (this.state.mode === "favorites") {
      const title = createDOMElem(
        "h3",
        "section-title section-title--grid",
        "My favourites"
      );
      wrap.appendChild(title);
    }

    if (this.state.mode === "schedule") {
      pageItems.forEach(({ episode }) =>
        wrap.appendChild(this.buildScheduleCard(episode))
      );
    } else {
      pageItems.forEach((show) => wrap.appendChild(this.buildShowCard(show)));
    }

    this.renderPagination();
    if (this.state.mode !== "schedule") this.syncFavIcons();
  }

  renderPagination() {
    if (!this.els.pagination) {
      this.els.pagination = document.createElement("div");
      this.els.pagination.className = "pagination";
      this.els.showsWrapper.parentNode.appendChild(this.els.pagination);
    }
    const p = this.els.pagination;
    p.innerHTML = "";
    if (this.state.totalPages <= 1) return;

    const controls = document.createElement("div");
    controls.className = "pagination-controls";

    const mk = (label, fn, disabled = false) => {
      const b = createDOMElem("button", "button secondary", label);
      b.disabled = disabled;
      b.addEventListener("click", (e) => {
        fn();
        e.currentTarget.blur?.();
        this.scrollToResultsTop();
      });
      return b;
    };

    const prev = mk(
      "Prev",
      () => {
        if (this.state.page > 1) {
          this.state.page--;
          this.renderPage();
        }
      },
      this.state.page === 1
    );

    const next = mk(
      "Next",
      () => {
        if (this.state.page < this.state.totalPages) {
          this.state.page++;
          this.renderPage();
        }
      },
      this.state.page >= this.state.totalPages
    );

    prev.setAttribute("aria-label", "Previous page");
    next.setAttribute("aria-label", "Next page");

    const label = `Page ${this.state.page} / ${this.state.totalPages}`;
    const indicator = createDOMElem("div", "page-indicator", label);

    const wide = window.matchMedia("(min-width: 600px)").matches;
    if (wide) {
      const first = mk(
        "First",
        () => {
          if (this.state.page > 1) {
            this.state.page = 1;
            this.renderPage();
          }
        },
        this.state.page === 1
      );
      const last = mk(
        "Last",
        () => {
          if (this.state.page < this.state.totalPages) {
            this.state.page = this.state.totalPages;
            this.renderPage();
          }
        },
        this.state.page >= this.state.totalPages
      );
      first.setAttribute("aria-label", "First page");
      last.setAttribute("aria-label", "Last page");
      controls.append(first, prev, indicator, next, last);
    } else {
      // MOBILE: też pokazujemy wskaźnik strony
      controls.append(prev, indicator, next);
    }
    p.append(controls);
  }

  showScheduleBar() {
    this.els.scheduleBar.hidden = false;
  }
  hideScheduleBar() {
    this.els.scheduleBar.hidden = true;
  }

  async openScheduleForCurrentDate(firstEntry = false) {
    this.hideHome();
    this.showSkeletons();
    try {
      const dateIso = this.els.dateInput?.value || todayISO();
      const list = await this.loadSchedule(dateIso);
      this.state.mode = "schedule";
      this.updateScheduleButtonUI();

      this.state.scheduleMeta = { date: dateIso, total: list.length };
      this.state.results = list.map((ep) => ({
        __schedule: true,
        episode: ep,
      }));
      this.state.page = 1;
      this.state.totalPages = Math.max(
        1,
        Math.ceil(this.state.results.length / PAGE_SIZE)
      );
      this.renderPage();

      this.els.scheduleInfo.textContent = `Schedule · ${dateIso} · ${list.length}`;
      this.showScheduleBar();
      if (firstEntry) {
        try {
          this.els.scheduleBar.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        } catch {}
      } else {
        this.scrollToResultsTop();
      }
    } catch {
      this.state.mode = "schedule";
      this.updateScheduleButtonUI();
      this.state.results = [];
      this.state.page = 1;
      this.state.totalPages = 1;
      const dateIso = this.els.dateInput?.value || todayISO();
      this.renderPage("Failed to load schedule. Try again.");
      this.els.scheduleInfo.textContent = `Schedule · ${dateIso} · 0`;
      this.showScheduleBar();
      if (!firstEntry) this.scrollToResultsTop();
    }
  }

  openSheet() {
    if (!this.els.dateInput.value) this.els.dateInput.value = todayISO();
    this.els.sheetBackdrop.classList.add("active");
    this.els.sheet.classList.add("open");
    this.els.sheet.setAttribute("aria-hidden", "false");
    this.els.body.classList.add("no-scroll");
  }
  closeSheet() {
    this.els.sheetBackdrop.classList.remove("active");
    this.els.sheet.classList.remove("open");
    this.els.sheet.setAttribute("aria-hidden", "true");
    this.els.body.classList.remove("no-scroll");
  }

  async applySchedule() {
    let dateIso = (this.els.dateInput.value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) dateIso = todayISO();
    this.savePrefs();

    this.hideHome();
    this.showSkeletons();

    try {
      const list = await this.loadSchedule(dateIso);
      this.state.mode = "schedule";
      this.updateScheduleButtonUI();

      this.state.scheduleMeta = { date: dateIso, total: list.length };
      this.state.results = list.map((ep) => ({
        __schedule: true,
        episode: ep,
      }));
      this.state.page = 1;
      this.state.totalPages = Math.max(
        1,
        Math.ceil(this.state.results.length / PAGE_SIZE)
      );
      this.renderPage();

      this.els.scheduleInfo.textContent = `Schedule · ${dateIso} · ${list.length}`;
      this.showScheduleBar();
      this.scrollToResultsTop();
    } catch {
      this.state.mode = "schedule";
      this.updateScheduleButtonUI();
      this.state.results = [];
      this.state.page = 1;
      this.state.totalPages = 1;
      this.renderPage("Failed to load schedule. Try again.");
      this.els.scheduleInfo.textContent = `Schedule · ${dateIso} · 0`;
      this.showScheduleBar();
      this.scrollToResultsTop();
    } finally {
      this.closeSheet();
    }
  }

  async loadSchedule(dateIso) {
    const batchSize = 4;
    const res = [];
    for (let i = 0; i < SCHEDULE_COUNTRIES.length; i += batchSize) {
      const chunk = SCHEDULE_COUNTRIES.slice(i, i + batchSize);
      const part = await Promise.all(
        chunk.map((c) =>
          getScheduleForDate(dateIso, c)
            .then((arr) => ({ c, arr }))
            .catch(() => ({ c, arr: [] }))
        )
      );
      res.push(...part);
    }
    const merged = [];
    for (const { c, arr } of res) {
      for (const ep of arr) {
        const code =
          ep?.show?.network?.country?.code ||
          ep?.show?.webChannel?.country?.code ||
          c;
        ep.__country = code;
        merged.push(ep);
      }
    }
    const ts = (e) =>
      e.airstamp
        ? Date.parse(e.airstamp)
        : e.airdate && e.airtime
        ? Date.parse(`${e.airdate}T${e.airtime}:00Z`) || 0
        : 0;
    merged.sort((a, b) => {
      const ta = ts(a),
        tb = ts(b);
      if (ta !== tb) return ta - tb;
      const ca = (a.__country || "").localeCompare(b.__country || "");
      if (ca !== 0) return ca;
      return (a?.show?.name || "").localeCompare(b?.show?.name || "");
    });
    return merged;
  }

  openDetails(showId, opener = null) {
    this.lastActiveEl = opener || document.activeElement || null;

    this.els.preview.innerHTML = "";
    this.els.preview.classList.add("open");
    this.els.overlay.classList.add("active");
    this.els.body.classList.add("no-scroll");
    this.els.preview.setAttribute("aria-hidden", "false");
    this.els.preview.setAttribute("tabindex", "-1");
    this.els.preview.focus({ preventScroll: true });

    this.els.header?.setAttribute("inert", "");
    this.els.scheduleBar?.setAttribute("inert", "");
    this.els.main?.setAttribute("inert", "");

    document.addEventListener("keydown", this.handleEsc);
    document.addEventListener("keydown", this.handleTrapTab, true);

    const spinner = document.createElement("div");
    spinner.className = "spinner";
    this.els.preview.appendChild(spinner);

    getShowFullById(showId)
      .then((show) => {
        const view = this.buildDetailsView(show);
        this.els.preview.innerHTML = "";
        this.els.preview.appendChild(view);
        this.applyPreviewLayout();
        this.attachResizeHandler();
        q(".close-btn", this.els.preview)?.focus?.();
      })
      .catch(() => {
        const body = createDOMElem("div", "preview-body");
        const p = createDOMElem(
          "p",
          "card-text-full",
          "Failed to load details. Please try again."
        );
        body.appendChild(p);
        this.els.preview.innerHTML = "";
        this.els.preview.appendChild(body);
        this.applyPreviewLayout();
        this.attachResizeHandler();
        q(".close-btn", this.els.preview)?.focus?.();
      });
  }

  closeDetails() {
    this.els.preview.classList.remove("open");
    this.els.overlay.classList.remove("active");
    this.els.body.classList.remove("no-scroll");
    this.els.preview.setAttribute("aria-hidden", "true");

    this.els.header?.removeAttribute("inert");
    this.els.scheduleBar?.removeAttribute("inert");
    this.els.main?.removeAttribute("inert");

    this.els.preview.innerHTML = "";
    document.removeEventListener("keydown", this.handleEsc);
    document.removeEventListener("keydown", this.handleTrapTab, true);
    this.detachResizeHandler();

    this.lastActiveEl?.focus?.();
    this.lastActiveEl = null;
  }
  handleEsc = (e) => {
    if (e.key === "Escape") this.closeDetails();
  };
  handleTrapTab = (e) => {
    if (
      e.key !== "Tab" ||
      this.els.preview.getAttribute("aria-hidden") === "true"
    )
      return;
    const focusables = this.els.preview.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  applyPreviewLayout() {
    const box = this.els.preview;
    const header = q(".preview-header", box);
    const hero = q(".card-preview-bg", box);
    const body = q(".preview-body", box);
    if (!header || !hero || !body) return;
    const h = box.clientHeight - header.offsetHeight - hero.offsetHeight;
    body.style.maxHeight = `${Math.max(200, h)}px`;
    body.style.overflowY = "auto";
  }
  attachResizeHandler() {
    this.detachResizeHandler();
    this.resizeHandler = () => this.applyPreviewLayout();
    window.addEventListener("resize", this.resizeHandler, { passive: true });
  }
  detachResizeHandler() {
    if (this.resizeHandler)
      window.removeEventListener("resize", this.resizeHandler);
    this.resizeHandler = null;
  }

  buildDetailsView(show) {
    const wrap = createDOMElem("div", "preview-content");

    const header = createDOMElem("div", "preview-header");
    const title = createDOMElem("h3", "card-title", show.name);
    const closeX = createDOMElem("button", "close-btn", "×");
    closeX.setAttribute("aria-label", "Close");
    closeX.addEventListener("click", () => this.closeDetails());
    header.append(title, closeX);

    const hero = createDOMElem("div", "card-preview-bg");
    if (show.image?.original || show.image?.medium) {
      hero.style.backgroundImage = `url('${
        show.image.original || show.image.medium
      }')`;
    }

    const body = createDOMElem("div", "preview-body");

    const tabs = createDOMElem("div", "tabbar");
    const panels = {
      overview: document.createElement("div"),
      episodes: document.createElement("div"),
      cast: document.createElement("div"),
    };

    const meta = this.buildMetaRow(show);
    const txt =
      cleanText(show.summary) || "There is no summary for that show yet";
    const p = createDOMElem("p", "card-text-full", txt);
    p.style.textAlign = "left";
    const favBtn = this.buildFavButton(show);
    const closeBtn = createDOMElem("button", "button", "Close details");
    closeBtn.addEventListener("click", () => this.closeDetails());
    const actions = createDOMElem("div", "preview-actions");
    actions.append(favBtn, closeBtn);
    panels.overview.append(meta, p, actions);

    const eps = show?._embedded?.episodes || [];
    if (eps.length) {
      const byS = new Map();
      for (const ep of eps) {
        const s = ep.season ?? 0;
        if (!byS.has(s)) byS.set(s, []);
        byS.get(s).push(ep);
      }
      const seasons = Array.from(byS.keys()).sort((a, b) => a - b);
      seasons.forEach((s) => {
        const group = document.createElement("div");

        const btn = document.createElement("button");
        btn.className = "season-toggle";
        btn.textContent = `Season ${s}`;
        btn.setAttribute("aria-expanded", "false");
        const panelId = `season-${s}`;
        btn.setAttribute("aria-controls", panelId);

        const panel = document.createElement("div");
        panel.className = "season-panel";
        panel.id = panelId;
        panel.setAttribute("role", "region");

        const ul = document.createElement("ul");
        byS
          .get(s)
          .sort((a, b) => a.number - b.number)
          .forEach((ep) => {
            const li = document.createElement("li");
            const at = ep.airdate
              ? `${ep.airdate}${ep.airtime ? " · " + ep.airtime : ""}`
              : "";
            li.textContent = `E${String(ep.number).padStart(2, "0")} — ${
              ep.name || "Untitled"
            }${at ? " — " + at : ""}`;
            ul.appendChild(li);
          });

        panel.appendChild(ul);
        btn.addEventListener("click", () => {
          const expanded = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!expanded));
          panel.classList.toggle("open", !expanded);
        });

        group.append(btn, panel);
        panels.episodes.appendChild(group);
      });
    } else {
      const no = document.createElement("p");
      no.className = "card-text-full";
      no.textContent = "No episodes available.";
      panels.episodes.appendChild(no);
    }

    const cast = show?._embedded?.cast || [];
    if (cast.length) {
      const ul = document.createElement("ul");
      ul.style.listStyle = "none";
      ul.style.padding = "0";
      ul.style.margin = "0";
      cast.forEach((c) => {
        const li = document.createElement("li");
        li.style.padding = "6px 0";
        const person = c.person?.name || "Unknown";
        const character = c.character?.name ? ` as ${c.character.name}` : "";
        li.textContent = `${person}${character}`;
        ul.appendChild(li);
      });
      panels.cast.appendChild(ul);
    } else {
      const no = document.createElement("p");
      no.className = "card-text-full";
      no.textContent = "No cast data.";
      panels.cast.appendChild(no);
    }

    const showPanel = (name) => {
      Object.values(panels).forEach((el) => (el.style.display = "none"));
      panels[name].style.display = "block";
      body.scrollTop = 0;
    };

    const mkTab = (label, key) => {
      const b = createDOMElem("button", "button secondary", label);
      b.style.padding = "8px 12px";
      b.style.fontSize = ".92rem";
      b.addEventListener("click", () => showPanel(key));
      return b;
    };

    tabs.append(
      mkTab("Overview", "overview"),
      mkTab("Episodes", "episodes"),
      mkTab("Cast", "cast")
    );
    body.append(tabs, panels.overview, panels.episodes, panels.cast);
    showPanel("overview");

    wrap.append(header, hero, body);
    return wrap;
  }

  buildFavButton(show) {
    const pressed = this.isFav(show.id);
    const b = createDOMElem(
      "button",
      "button tertiary",
      pressed ? "★ In favourites" : "☆ Add to favourites"
    );
    b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("click", () => {
      this.toggleFav(show);
      const p = this.isFav(show.id);
      b.textContent = p ? "★ In favourites" : "☆ Add to favourites";
      b.setAttribute("aria-pressed", String(p));
    });
    return b;
  }

  buildMetaRow(show) {
    const row = document.createElement("div");
    row.className = "meta-row";
    const chip = (t) => {
      const s = document.createElement("span");
      s.className = "meta-chip";
      s.textContent = t;
      return s;
    };
    if (typeof show?.rating?.average === "number")
      row.appendChild(chip(`★ ${show.rating.average.toFixed(1)}`));
    if (show.status) row.appendChild(chip(show.status));
    if (show.type) row.appendChild(chip(show.type));
    if (Array.isArray(show.genres) && show.genres.length)
      row.appendChild(chip(show.genres.slice(0, 2).join(" · ")));
    return row;
  }

  buildShowCard(show, detailed = false) {
    const card = createDOMElem("div", "show-card");
    const content = createDOMElem("div", "card-content");
    const title = createDOMElem("h5", "card-title", show.name);
    const meta = this.buildMetaRow(show);

    let heroDiv = null;
    if (detailed) {
      if (show.image?.original || show.image?.medium) {
        heroDiv = createDOMElem("div", "card-preview-bg");
        heroDiv.style.backgroundImage = `url('${
          show.image.original || show.image.medium
        }')`;
      }
    } else {
      const src =
        show.image?.medium ||
        show.image?.original ||
        "https://placehold.co/210x295?text=No+Image";
      const imgEl = createDOMElem("img", "", null, src);
      imgEl.alt = show.name || "Poster";
      card.appendChild(imgEl);
    }

    const text = cleanText(show.summary);
    const p = createDOMElem(
      "p",
      detailed ? "card-text-full" : "card-text",
      text
        ? detailed
          ? text
          : `${text.slice(0, 100)}...`
        : "There is no summary for that show yet"
    );
    p.style.textAlign = "left";

    const actions = createDOMElem("div", "card-actions");
    const btn = createDOMElem(
      "button",
      "button",
      detailed ? "Close details" : "Show details"
    );
    btn.dataset.showId = show.id;
    actions.appendChild(btn);

    const pressed = this.isFav(show.id);
    const fav = createDOMElem("button", "fav-btn", pressed ? "★" : "☆");
    fav.setAttribute("data-fav-id", show.id);
    fav.setAttribute("aria-pressed", String(pressed));
    fav.setAttribute(
      "aria-label",
      pressed ? "Remove from favourites" : "Add to favourites"
    );
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggleFav(show);
      const nowPressed = this.isFav(show.id);
      fav.textContent = nowPressed ? "★" : "☆";
      fav.setAttribute("aria-pressed", String(nowPressed));
      fav.setAttribute(
        "aria-label",
        nowPressed ? "Remove from favourites" : "Add to favourites"
      );
    });

    card.appendChild(content);
    content.append(title, meta);
    if (heroDiv) content.appendChild(heroDiv);
    content.append(p, actions);
    card.appendChild(fav);
    return card;
  }

  buildScheduleCard(ep) {
    const show = ep.show || {};
    const card = createDOMElem("div", "show-card");
    const content = createDOMElem("div", "card-content");

    const t = `${show.name || "Unknown"} — S${ep.season}E${ep.number}`;
    const title = createDOMElem("h5", "card-title", t);

    const row = document.createElement("div");
    row.className = "meta-row";
    const chip = (txt) => {
      const s = document.createElement("span");
      s.className = "meta-chip";
      s.textContent = txt;
      return s;
    };
    const country =
      ep.__country ||
      show?.network?.country?.code ||
      show?.webChannel?.country?.code ||
      "—";
    const network = show.network?.name || show.webChannel?.name || "—";
    const time = ep.airtime
      ? `${ep.airdate} · ${ep.airtime}`
      : ep.airstamp || "—";
    row.append(chip(country), chip(network), chip(time));

    const src =
      show.image?.medium ||
      show.image?.original ||
      "https://placehold.co/210x295?text=No+Image";
    const img = createDOMElem("img", "", null, src);
    img.alt = show.name || "Poster";

    const actions = createDOMElem("div", "card-actions");
    const btn = createDOMElem("button", "button", "Show details");
    if (show.id != null) btn.dataset.showId = show.id;
    actions.appendChild(btn);

    card.append(img, content);
    content.append(title, row, actions);
    return card;
  }
}

document.addEventListener("DOMContentLoaded", () => new TvApp());
