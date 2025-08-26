# CineView

<p align="center">
  <a href="https://blaszczakdev.github.io/cine-view/">
    <img alt="Live demo" src="https://img.shields.io/badge/Live%20demo-Open-3D7BFD" />
  </a>
  &nbsp;&nbsp;
  <img alt="Vanilla JS" src="https://img.shields.io/badge/HTML%2FCSS%2FJS-Vanilla-informational" />
  &nbsp;
  <img alt="TVMaze API" src="https://img.shields.io/badge/API-TVMaze-blue" />
  &nbsp;
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green" />
</p>

A small, responsive TV show browser built with **vanilla HTML/CSS/JS** and the public **TVMaze** API.  
You can search shows, open a details modal, add/remove **favourites** (saved in `localStorage`), and view the broadcast **schedule** for a selected date across multiple countries.

This project is intentionally lightweight (no frameworks, no bundlers) to demonstrate core frontend skills: semantic HTML, mobile-first CSS, accessible UI, and clean JavaScript.

---

## Demo

**Live demo:** https://blaszczakdev.github.io/cine-view/

### Run locally

No build step required.

- **Option A (VS Code):** Right-click `index.html` → “Open with Live Server”.

- **Option B (Python):**

```bash
cd cine-view
python3 -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

- **Option C (Node, optional):**

```bash
npx serve .
```

The TVMaze API is public — no API key needed.

---

## Features

- **Search with suggestions** (top-rated list used for quick matches).
- **Details modal** with Overview / Episodes / Cast.
- **Favourites** (star button) — persisted in `localStorage`.
- **Schedule** by date, aggregated from several countries; quick date picker.
- **Pagination** with responsive controls
  - Mobile: **Prev / Next**
  - Tablet/Up: **First / Prev / Page N / Next / Last**
- **Skeleton loading** states and client-side caching (5-minute TTL).
- **Accessible interactions**
  - Focus trap and `Escape` to close the modal.
  - Page content set to `inert` when the modal is open (more robust than only `aria-hidden`).
  - `aria-label` + `aria-pressed` on the favourite toggle.
  - Alt text for images and a neutral placeholder when an image is missing.

---

## Tech stack & decisions

- **HTML/CSS/JS only** – to keep the footprint small and highlight fundamentals.
- **Mobile-first CSS** split by breakpoint (minimal overrides only):
  - `css/main.css` — base styles (mobile)
  - `css/tablet.css` — ≥600px
  - `css/laptop.css` — ≥1024px
  - `css/desktop.css` — ≥1440px
- **Fetch layer** (`src/request.js`)
  - Simple in-memory cache (TTL: 5 min).
  - Request timeout with `AbortController` (10s).
- **UI logic** (`src/app.js`)
  - State kept in a single `TvApp` class.
  - Favourite star synchronises across all cards.
  - Date preferences stored in `localStorage`.
  - Smooth scroll back to the grid top on page changes.
- **A11y**
  - Role/ARIA for the suggestions listbox.
  - Modal accessibility patterns (`inert`, focus trap, keyboard support).

---

## Project structure

```text
cine-view/
├─ css/
│  ├─ main.css
│  ├─ tablet.css
│  ├─ laptop.css
│  └─ desktop.css
├─ src/
│  ├─ app.js
│  ├─ domInteractions.js
│  └─ request.js
├─ readme-media/
│  ├─ home-top-rated-desktop.png
│  ├─ search-suggestions.png
│  ├─ details-modal-episodes.png
│  ├─ favourites-grid.png
│  ├─ schedule-bar.png
│  └─ mobile-grid.png
├─ .editorconfig
├─ .gitignore
├─ index.html
├─ LICENSE
└─ README.md
```

---

## Screenshots

<p align="center">
  <img src="readme-media/home-top-rated-desktop.png" alt="Home – Top rated" width="900">
</p>

<p align="center">
  <img src="readme-media/search-suggestions.png" alt="Search with suggestions" width="900">
</p>

<p align="center">
  <img src="readme-media/details-modal-episodes.png" alt="Details modal – Episodes tab" width="900">
</p>

<p align="center">
  <img src="readme-media/favourites-grid.png" alt="Favourites grid" width="900">
</p>

<p align="center">
  <img src="readme-media/schedule-bar.png" alt="Schedule bar with Change date" width="900">
</p>

<p align="center">
  <img src="readme-media/mobile-grid.png" alt="Mobile layout" width="350">
</p>

---

## Usage notes

- Schedule countries are predefined: US, GB, CA, AU, DE, FR, ES, IT, NL, SE, DK, NO, PL, JP, KR, BR, MX.
- The **Top rated** list is derived from the first two pages of TVMaze’s shows and sorted by rating.

---

## Limitations & future work

- No routing (URL doesn’t reflect state); could add History API for shareable links.
- No offline support / service worker; could add basic caching for assets and API responses.
- No automated tests; Playwright could cover critical flows.
- Schedule aggregation is simple; could group by timezone/channel and add filters.
- Extract small reusable components (card, pagination) or migrate to a lightweight component library (still vanilla or lit).

---

## Accessibility checklist (manual)

- Tab through the page: focus order is logical.
- Open modal: background is non-focusable and treated as hidden; `Escape` closes; Tab/Shift+Tab are trapped.
- Favourite toggle announces “Add/Remove from favourites”.
- All images have `alt`; a placeholder image is used if missing.
- Colour contrast is sufficient for dark UI.

---

## Performance notes

- Client cache (5 minutes) and request timeout (10s) to keep the UI responsive.
- Skeletons shown while fetching.
- No heavy dependencies.

---

## Credits & Licence

- Data: TVMaze API — https://www.tvmaze.com/api (public).
- Icons/symbols: Unicode characters.
- Licence: **MIT** (see `LICENSE`).

---

<details>
  <summary><strong>Review highlights</strong></summary>

- `src/app.js` — UI state and DOM updates without a framework (search, schedule, modal, favourites).
- `css/main.css` + breakpoint files — mobile-first with minimal overrides.
- Accessibility — `inert`, focus trap, ARIA on interactive elements, `alt` text and image placeholder.
- UX polish — skeletons, empty states, responsive pagination.

</details>
