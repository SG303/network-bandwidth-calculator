# Network Bandwidth Calculator — Specification

A small, dependency-free static web tool for network engineers. It estimates the
bandwidth needed on switch access ports / uplinks and on WLAN APs from a typical
client mix. Purpose: quick, defensible numbers for customer consulting.

**UI language: German.** Code (identifiers, comments, README): English.

## Goals

1. **Switch (wired) tab**: enter a client mix → get per-port speed class,
   uplink recommendation, required port count / switch size.
2. **WLAN tab**: enter the client mix per AP plus AP radio profile → get
   utilization, verdict, recommended number of APs.

## Non-goals (v1)

- No frameworks, no build step, no npm, no CDN assets, no ES modules, no fetch.
  The page must work offline via `file://` as well as any static host.
- No i18n framework, no charts library (CSS bars are enough).
- No persistence server; only `localStorage` for the last inputs.
- No per-client PHY/airtime simulation. Simple, transparent, editable model.

## Files

- `index.html` — structure (both tabs, shared client-mix component)
- `style.css` — styling
- `app.js` — constants, pure calculation functions, UI wiring, localStorage
- `README.md` — update existing file (keep the icon header), add short usage
  and model description
- `assets/icon.svg` — already exists; use it as favicon via
  `<link rel="icon" href="assets/icon.svg">`

Load JS with a classic script tag: `<script src="app.js" defer></script>`.
(ES modules are blocked over `file://` — do not use them.)

## Client type presets

Shared by both tabs. Each row in the mix: type (dropdown), count, editable
`Mbit/s` per client. Selecting a type fills its default value.

| id          | Label (German, exact)                                  | Default Mbit/s |
|-------------|--------------------------------------------------------|---------------|
| office-light | Büro – leicht (Web, E-Mail, SaaS)                    | 2             |
| office-heavy | Büro – schwer (Cloud-Workloads, Downloads)           | 10            |
| video-conf   | Videokonferenz (Teams/Zoom, HD)                      | 4             |
| stream-hd    | Video-Streaming (HD)                                 | 8             |
| stream-4k    | Video-Streaming (4K)                                 | 25            |
| voip         | VoIP-Telefonie                                       | 0.1           |
| file-transfer| Datei-Transfer / CAD / Backup                        | 50            |
| iot          | Drucker / Scanner / IoT                              | 0.5           |
| pos          | Kasse / POS                                          | 1             |
| custom       | Eigener Client-Typ                                   | 10            |

## Switch (wired) tab

### Inputs

- Client mix (shared component). **Default mix: 10 × office-light, 5 × stream-4k.**
- Slider „Gleichzeitigkeit (statistisch)" 10–100 %, step 5, **default 25 %**.
  Helper text: „Nicht alle Clients sind gleichzeitig aktiv. Typisch für
  Büronetze: 20–30 %."

### Formulas

- Peak demand `S = Σ count_i × mbps_i` (Mbit/s)
- Effective uplink load `E = S × concurrency`
- Access port speed class: 1 Gbit/s baseline. If max single-client demand
  > 900 → 2.5 Gbit/s; > 2200 → 5 Gbit/s; > 4500 → 10 Gbit/s;
  > 9500 → „10 Gbit/s+ (Sonderfall)".
- Uplink: smallest of 1 / 10 / 25 / 40 / 100 Gbit/s with `uplink ≥ E`.
  Utilization `= E / uplink`. If `E > 100 Gbit/s`: no recommendation, show red
  warning „Bedarf übersteigt 100 Gbit/s – Segmentierung erforderlich".
  If utilization of the recommended class > 85 %: hint „Geringe Reserve –
  ggf. nächste Portklasse wählen."
- Port count `N = Σ count_i`. Switch size: smallest of 8 / 12 / 24 / 28 / 48 / 52
  ports with `ports ≥ N × 1.2` (20 % reserve). Text: „z. B. 24-Port-Switch
  (mit 20 % Reserve)".

### Outputs (result cards + breakdown table)

- „Spitzenlast (alle gleichzeitig)" = S
- „Effektive Uplink-Last (bei X % Gleichzeitigkeit)" = E
- „Empfohlener Uplink" = class, with utilization badge
- „Access-Port-Geschwindigkeit" = class + note „1 Gbit/s genügt für
  Standard-Clients"
- „Benötigte Anschlüsse" = N + switch size hint
- Utilization comparison bars for 1 Gbit/s / 10 Gbit/s / 25 Gbit/s (E / class)
- Breakdown table per client type: count, Mbit/s, subtotal

### Acceptance example (must match exactly)

Default mix (10 × 2 + 5 × 25), concurrency 25 %:
- S = 145 Mbit/s, E = 36,25 Mbit/s
- Uplink: 1 Gbit/s (Auslastung 3,6 %)
- Access-Port: 1 Gbit/s
- N = 15 → 24-Port-Switch

## WLAN tab

### Inputs

- Client mix (shared component). **Default mix: 20 × office-light, 5 × stream-4k.**
- Dropdown „AP-Profil" (band + standard combined):
  - `2g`: „2,4 GHz (Wi-Fi 4/6)" — widths 20/40
  - `5g-ac`: „5 GHz – Wi-Fi 5 (802.11ac)" — widths 20/40/80
  - `5g-ax`: „5 GHz – Wi-Fi 6 (802.11ax)" — widths 20/40/80/160 — **default**
  - `6g-6e`: „6 GHz – Wi-Fi 6E" — widths 20/40/80/160
  - `6g-be`: „6 GHz – Wi-Fi 7 (802.11be)" — widths 20/40/80/160/320
- Dropdown „Kanalbreite" (MHz), filtered by profile, **default 80**.
- Number field „Kapazität pro AP-Radio (Mbit/s)" — auto-filled from the matrix
  below when profile/width changes, but editable (override). Default width 80.

### Capacity matrix (planning goodput per AP radio, conservative ~40–45 % of PHY)

| Profile | 20 MHz | 40 MHz | 80 MHz | 160 MHz | 320 MHz |
|---------|--------|--------|--------|---------|---------|
| 2g      | 50     | 100    | —      | —       | —       |
| 5g-ac   | 80     | 170    | 350    | —       | —       |
| 5g-ax   | 110    | 220    | 450    | 900     | —       |
| 6g-6e   | 110    | 220    | 450    | 900     | —       |
| 6g-be   | 120    | 240    | 500    | 1000    | 1900    |

### Formulas

- Demand `D = Σ count_i × mbps_i` (Mbit/s), client count `N = Σ count_i`
- Capacity `C` = matrix value or user override
- Utilization `U = D / C`
- Verdict: `U ≤ 0.60` → „OK – Reserven vorhanden" (green);
  `0.60 < U ≤ 0.85` → „Grenzwertig – wird bei Lastspitzen eng" (amber);
  `U > 0.85` → „Überlastet – APs hinzufügen, Kanalbreite erhöhen oder
  Profil wechseln" (red)
- Recommended APs `= max(1, ceil(D / (0.6 × C)))` — „Empfohlene APs für
  diesen Mix (max. 60 % Auslastung pro AP)"
- Average per client `= C / N` (Mbit/s) — „Ø Bandbreite pro Client"

### Outputs (result cards + breakdown table)

- „Gesamtbedarf" = D
- „AP-Kapazität (Planungswert)" = C
- „Auslastung" with colored CSS bar and % (cap bar fill at 100 % width,
  keep the real number as text, e.g. „1500 %")
- Verdict badge
- „Ø Bandbreite pro Client", „Empfohlene APs"
- Note: „Kapazität gilt pro Radio. Ein Dual-Band-AP (2,4 + 5/6 GHz) bietet
  zusätzlich die Kapazität des zweiten Radios."

### Acceptance examples (must match exactly)

1. Default mix (20 × 2 + 5 × 25) on 5g-ax @ 80 MHz:
   D = 165 Mbit/s, C = 450, U = 36,7 % → OK; APs = 1; Ø pro Client = 18 Mbit/s.
2. 30 × stream-4k on 2g @ 20 MHz:
   D = 750, C = 50, U = 1500 % → Überlastet; APs = 25.

## UI / UX

- Header: „Netzwerk-Bandbreitenrechner", subtitle „Bandbreitenbedarf für
  Switch-Ports, Uplinks und WLAN abschätzen".
- Tab bar (pills): „Switch / Kabel" | „WLAN". Only one tab visible at a time.
- Layout: two-column grid (inputs left, results right) ≥ 960 px, stacked below.
- Client-mix component: table-like rows: type select, count (number, min 0,
  step 1), Mbit/s per client (number, min 0, step 0.1), remove button „✕".
  Button „+ Client-Typ hinzufügen". Same type may appear in multiple rows.
- Everything recalculates live on every input change (no calculate button).
- Reset button per tab („Zurücksetzen") → restores the tab defaults and clears
  its localStorage entry.
- `<details>` „Annahmen & Hinweise" per tab: 2–3 sentences explaining the
  model, stating that all default values are editable and are conservative
  planning values.
- Footer hint: „Alle Werte sind Schätzwerte für die Planung und ersetzen keine
  Messung."

### Styling / visual identity

The visual identity is owned by the frontend implementation lead working with
Anthropic's frontend-design skill guidance. Design for the real subject: a
professional daily tool for network engineers, often opened live in customer
conversations to justify sizing decisions — precise, calm, trustworthy, with
the key numbers as clear visual anchors.

Binding quality floor (everything else is the designer's intentional choice):

- No external requests of any kind (no webfonts, no CDN): deliberate system
  font stacks; `font-variant-numeric: tabular-nums` for aligned numeric output.
- Status semantics green (OK) / amber (borderline) / red (overloaded),
  harmonized with the chosen palette, never hue-alone (always combined with
  text labels).
- Utilization bars with the 60/85 % thresholds from the formulas.
- Responsive single column < 960 px; visible keyboard focus states;
  `prefers-reduced-motion` respected; body text contrast at least WCAG AA.
- Content column `max-width` ~1100 px centered, line lengths < 80 chars.
- Big result numbers as visual anchors (~1.8rem+ / 700 weight).
- Number formatting: German (`Intl.NumberFormat('de-DE')`), units „Mbit/s",
  „Gbit/s" (use Gbit/s when value ≥ 1000), percentages with one decimal and a
  space: „36,7 %".

## Edge cases (must be handled)

- Empty mix / all counts 0: show „—" and a neutral hint „Keine Clients
  konfiguriert". No NaN/Infinity anywhere; verdict hidden.
- Invalid/empty number fields: treat as 0 for calculation without crashing.
- Capacity override ≤ 0: fall back to matrix value and mark field.
- Corrupt or missing localStorage: fall back to defaults.
- Very large numbers: format as Gbit/s where sensible; no layout breakage.

## Acceptance criteria

- [ ] `index.html` opens via `file://` in a current Chrome/Firefox, zero
      console errors, no external network requests.
- [ ] Both acceptance examples above produce exactly the documented numbers.
- [ ] Live recalculation on every input; tab switching keeps both states.
- [ ] Inputs persist in localStorage (`nbc-wired-v1`, `nbc-wlan-v1`) across
      reloads; reset works.
- [ ] Responsive single-column layout below 960 px.
- [ ] German UI strings exactly as specified; code/comments in English.
- [ ] No overengineering: three files, no abstractions beyond what is useful.

## README (update existing)

Keep the icon header. Add: one-paragraph description, how to run (open
`index.html` or serve statically), short „Wie rechnet das Tool?" section
(client mix, concurrency, capacity matrix, verdict thresholds), and a
disclaimer that values are planning estimates, not measurements.
