# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, served equally:

- **Students at ICAI (Universidad Pontificia Comillas)**, mostly Spanish-speaking, looking for course material (Microprocesadores PIC32MX, Sistemas Electrónicos, the microprocessors game, Bluetooth/IoT resources) and for TFG (final-degree project) topics and supervision.
- **Research peers**: researchers, reviewers and collaborators checking Francisco Martín Martínez's publications, projects, supervised theses and research profiles (ORCID, Google Scholar, Scopus, ResearchGate, etc.), often in English.

Evaluators and prospective PhD/TFG candidates also visit, but they are secondary audiences, not design drivers.

## Product Purpose

The personal academic homepage of Dr. Francisco Martín Martínez, a professor and researcher at the Institute for Research in Technology (IIT), Universidad Pontificia Comillas (ICAI). It is a professional hub with a balanced job: establish a credible research and teaching record, route students to the right material, and make contact easy. There is no single primary conversion.

## Positioning

A single person who works in two worlds, both from first-hand work: energy systems research (renewable integration, demand-side flexibility, optimisation) and hands-on electronics teaching (microprocessors, embedded systems). The page is the one place where both records are presented together.

## Operating Context

- Three tab-sections in one page: Research (`#research`), Teaching (`#teaching`), CV (`#cv`), linkable by URL hash.
- Linked teaching subsites live in the same repository: `/microprocesadores/`, `/sistemaselectronicos/`, `/game_micros/` (a PWA).
- Visitors arrive from search engines, AI assistants, university pages, course platforms and academic profile links.

## Capabilities and Constraints

- **Spanish-first bilingual:** Spanish is the default language, with a complete English toggle (choice stored locally). Publication, thesis and project titles stay in their original language.
- **Static, no build step:** plain HTML/CSS/JS served by GitHub Pages at `https://fr4nc15co.github.io/`; the homepage is a single self-contained `index.html`.
- **AI/SEO discoverability:** keep and update the schema.org structured data (Person, ScholarlyArticle, etc.), meta/OG tags, `sitemap.xml` and `robots.txt` so search engines and AI assistants can read and cite the record accurately. Visible content and structured data must stay in sync.
- Current implementation (not a stated design principle): Google Analytics under Consent Mode v2 via `cookies.js`, a privacy page (`privacidad.html`), and a click-to-load Google Map.
- Content is licensed CC BY-NC-SA 4.0 (`LICENSE.md`).

## Brand Commitments

- Name as displayed: "Francisco Martín Martínez" / "Dr. Francisco Martín Martínez"; affiliation IIT, Universidad Pontificia Comillas (ICAI).
- Real profile photo at `images/profile.jpg`.

## Evidence on Hand

- Journal articles with DOIs (17 in the structured data), conference papers and book chapters, research projects, supervised PhD students, TFG supervision, professional experience and certifications, all in `index.html`.
- Headline stats shown on the page ("16+ publications", "h-index 11"); keep them consistent with the listed record and the linked profiles.
- Research profile links: ORCID `0000-0003-2968-7144`, Google Scholar, and others in the header.
- No testimonials, student quotes, press coverage or endorsements exist; do not invent any.

## Product Principles

1. Serve students and peers equally: neither audience should have to dig past the other's content to find theirs.
2. The record is the proof: show real publications, DOIs, projects and material, never vague claims.
3. Spanish first, English complete: every visible string works in both languages.
4. Machine-readable as well as human-readable: every content change keeps the structured data accurate.
5. Stay static and simple: no build tooling or framework unless it is explicitly chosen later.
