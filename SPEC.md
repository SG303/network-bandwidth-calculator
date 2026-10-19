# Network Bandwidth Calculator — Specification

A small, dependency-free static web tool for network engineers. It estimates the
bandwidth needed on switch access ports / uplinks and on WLAN APs from a typical
client mix. Purpose: quick, defensible numbers for customer consulting.

**Language: English** — UI, code identifiers, comments and README.

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

## Backlog

Agreed with the user, not implemented yet:

- **Export / report** — hand the current inputs and results to the customer.
  Preferred shape: a print/PDF report (a "Report" button plus a `@media print`
  stylesheet and `window.print()` — no dependency, works offline), both tabs in
  one document, optionally with customer / project / prepared-by fields and the
  assumptions text. A CSV export of the entered values and results is a possible
  companion. A generated `.pdf` via a vendored library was considered and
  deprioritized (payload weight, weaker layout than the browser's own PDF
  output).

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

| id            | Label (exact)                                 | Default Mbit/s |
|---------------|-----------------------------------------------|----------------|
| office-light  | Office – light (web, email, SaaS)             | 2              |
| office-heavy  | Office – heavy (cloud workloads, downloads)   | 10             |
| video-conf    | Video conference (Teams/Zoom, HD)             | 4              |
| stream-hd     | Video streaming (HD)                          | 8              |
| stream-4k     | Video streaming (4K)                          | 25             |
| voip          | VoIP telephony                                | 0.1            |
| file-transfer | File transfer / CAD / backup                  | 50             |
| iot           | Printers / scanners / IoT                     | 0.5            |
| pos           | Point of sale / POS                           | 1              |
| custom        | Custom client type                            | 10             |

## Switch (wired) tab

### Inputs

- Client mix (shared component). **Default mix: 10 × office-light, 5 × stream-4k.**
- Slider "Concurrency (statistical)" 10–100%, step 5, **default 25%**.
  Helper text: "Not all clients are active at the same time. Typical for
  office networks: 20–30%."

### Formulas

- Peak demand `S = Σ count_i × mbps_i` (Mbit/s)
- Effective uplink load `E = S × concurrency`
- Access port speed class: 1 Gbit/s baseline. If max single-client demand
  > 900 → 2.5 Gbit/s; > 2200 → 5 Gbit/s; > 4500 → 10 Gbit/s;
  > 9500 → "10 Gbit/s+ (special case)".
- Uplink: smallest of 1 / 10 / 25 / 40 / 100 Gbit/s with `uplink ≥ E`.
  Utilization `= E / uplink`. If `E > 100 Gbit/s`: no recommendation, show red
  warning "Demand exceeds 100 Gbit/s – split the network into segments."
  If utilization of the recommended class > 85%: hint "Low headroom –
  consider the next uplink class."
- Port count `N = Σ count_i`. Switch size: smallest of 8 / 12 / 24 / 28 / 48 / 52
  ports with `ports ≥ N × 1.2` (20% reserve). Text: "e.g. 24-port switch
  (with 20% reserve)".

### Outputs (result cards + breakdown table)

- "Peak demand (all at once)" = S
- "Effective uplink load (at X% concurrency)" = E
- "Recommended uplink" = class, with utilization badge "Utilization X%"
- "Access port speed" = class + note "1 Gbit/s is enough for standard
  clients" (above 1 Gbit/s: "Highest single-client demand: …")
- "Required ports" = N + switch size hint
- Utilization comparison bars for 1 Gbit/s / 10 Gbit/s / 25 Gbit/s (E / class)
- "Breakdown by client type" table: count, Mbit/s, subtotal, total row

### Acceptance example (must match exactly)

Default mix (10 × 2 + 5 × 25), concurrency 25%:
- S = 145 Mbit/s, E = 36.25 Mbit/s
- Uplink: 1 Gbit/s (utilization 3.6%)
- Access port: 1 Gbit/s
- N = 15 → 24-port switch

## WLAN tab

### Inputs

- Client mix (shared component). **Default mix: 20 × office-light, 5 ×
  stream-4k**, both rows on the first radio. Each row has a "Radio" select
  assigning the clients to one of the AP's radios; the column is hidden while
  the AP has only one radio.
- Radio list "AP radios": 1–4 radios (**default: one**, see below). Every radio
  has:
  - Dropdown "Radio" (band + standard combined):
    - `2g`: "2.4 GHz (Wi-Fi 4/6)" — widths 20/40
    - `5g-ac`: "5 GHz – Wi-Fi 5 (802.11ac)" — widths 20/40/80
    - `5g-ax`: "5 GHz – Wi-Fi 6 (802.11ax)" — widths 20/40/80/160 — **default**
    - `6g-6e`: "6 GHz – Wi-Fi 6E" — widths 20/40/80/160
    - `6g-be`: "6 GHz – Wi-Fi 7 (802.11be)" — widths 20/40/80/160/320
  - Dropdown "Channel width" (MHz), filtered by profile, **default 80**.
  - Number field "Goodput (Mbit/s)" — auto-filled from the matrix below when
    profile/width changes, but editable (override).
  - Remove button "✕" (accessible name "Remove radio"), hidden while only one
    radio exists. Button "+ Add radio", hidden at four radios. Removing a radio
    moves its clients to the first radio. New radios start from the default
    radio; ids stay stable so rows keep their assignment.
  Shared helper text: "Planning values per band, standard and width — usable
  throughput per radio, not the PHY data rate. Edit a value to override it."
  With an invalid value: "<radio label>: enter a value greater than 0. Using
  the planning value of … until then." (plus `aria-invalid` on that field).
- Slider "Concurrency (statistical)" 10–100%, step 5, **default 25%** — same
  control and helper text as the wired tab.

### Capacity matrix (planning goodput per AP radio)

The values are the throughput a radio actually carries for its clients (all
clients on it share this pool): usable aggregate goodput, deliberately
conservative, roughly a third to half of the PHY data rate of a typical 2×2
radio — **not** the data rate printed on the datasheet. 2.4 GHz is kept
especially conservative because of interference and legacy clients.

| Profile | 20 MHz | 40 MHz | 80 MHz | 160 MHz | 320 MHz |
|---------|--------|--------|--------|---------|---------|
| 2g      | 50     | 100    | —      | —       | —       |
| 5g-ac   | 80     | 170    | 350    | —       | —       |
| 5g-ax   | 110    | 220    | 450    | 900     | —       |
| 6g-6e   | 110    | 220    | 450    | 900     | —       |
| 6g-be   | 120    | 240    | 500    | 1000    | 1900    |

### Formulas

Per radio `r`, counting only the client rows assigned to it:

- Peak demand `D_r = Σ count_i × mbps_i` (Mbit/s), clients `N_r = Σ count_i`
- Effective load `E_r = D_r × concurrency` (Mbit/s)
- Capacity `C_r` = matrix value or user override (planning goodput, Mbit/s)
- Utilization `U_r = E_r / C_r`
- Verdict per radio: `U_r ≤ 0.60` → "OK – headroom available" (green);
  `0.60 < U_r ≤ 0.85` → "Borderline – tight during load peaks" (amber);
  `U_r > 0.85` → "Overloaded – add APs, widen the channel or change the
  profile" (red). A radio without clients shows "idle".
- APs needed by this radio `= 0` without clients, otherwise
  `max(1, ceil(E_r / (0.6 × C_r)))`
- Average per client `= C_r / N_r` (Mbit/s)

For the AP (one device carries all of its radios):

- Recommended APs `= max(1, max_r APs_r)` — **the highest single-radio
  requirement, never the sum of the radios** ("Recommended APs for this mix
  (max. 60% utilization per AP)")
- Overall verdict = worst radio verdict; the utilization shown is the one of
  the limiting radio (highest `U_r`)
- Totals: `D = Σ D_r`, `E = Σ E_r`, `N = Σ N_r`

### Outputs (result cards, per-radio table + breakdown table)

- "Utilization" (hero) = `U` of the limiting radio, with colored CSS bar and %
  (cap bar fill at 100% width, keep the real number as text, e.g. "375%")
- Verdict badge (worst radio)
- "Recommended APs" with note "Recommended APs for this mix (max. 60%
  utilization per AP)"; with more than one radio: "Highest requirement of a
  single radio (max. 60% utilization per AP)"
- With more than one radio the status note reads "Limiting radio: …"
- "Peak demand (all at once)" = D
- "Effective demand (at X% concurrency)" = E
- "AP capacity (planning goodput)" = C of the limiting radio (label becomes
  "Capacity, limiting radio" with more than one radio)
- "Avg. bandwidth per client" of the limiting radio (label becomes
  "Avg. per client, limiting radio" with more than one radio)
- "Load by radio" table: radio label ("5 GHz (Wi-Fi 6) @ 80 MHz"), effective
  load, capacity, utilization with verdict badge ("idle" without clients),
  APs ("—" without clients)
- Note: "Capacity is per radio. A dual-band AP (2.4 + 5/6 GHz) adds the
  capacity of its second radio."
- "Breakdown by client type" table: count, Mbit/s, subtotal, total row

### Acceptance examples (must match exactly)

1. Default mix (20 × 2 + 5 × 25) on the default radio (5g-ax @ 80 MHz),
   concurrency 25%:
   D = 165 Mbit/s, E = 41.25 Mbit/s, C = 450, U = 9.2% → OK; APs = 1;
   avg. per client = 18 Mbit/s.
2. 30 × stream-4k on 2g @ 20 MHz, concurrency 25%:
   D = 750 Mbit/s, E = 187.5 Mbit/s, C = 50, U = 375% → Overloaded; APs = 7.
   (At concurrency 100% the same mix gives U = 1500% and APs = 25.)
3. Two radios (2g @ 20 MHz + 5g-ax @ 80 MHz): 10 × iot on the 2.4 GHz radio,
   20 × office-light + 5 × stream-4k on the 5 GHz radio, concurrency 25%:
   2.4 GHz: D = 5, E = 1.25, C = 50, U = 2.5% → OK, APs = 1;
   5 GHz: D = 165, E = 41.25, C = 450, U = 9.2% → OK, APs = 1;
   totals D = 170, E = 42.5 → **APs = 1** (limiting radio: 5 GHz).
4. Same two radios, 30 × stream-4k on the 2.4 GHz radio, 5 GHz idle,
   concurrency 25%:
   2.4 GHz: U = 375% → APs = 7; 5 GHz: idle (APs 0) → **APs = 7**, not 8.

## UI / UX

- Header: "Network Bandwidth Calculator", subtitle "Estimate the bandwidth
  needed for switch ports, uplinks and WLAN".
- Tab bar (pills): "Switch / wired" | "WLAN". Only one tab visible at a time.
- Layout: two-column grid (inputs left, results right) ≥ 960 px, stacked below.
- Client-mix component: table-like rows: type select, count (number, min 0,
  step 1), Mbit/s per client (number, min 0, step 0.1), remove button "✕"
  (accessible name "Remove row"). Button "+ Add client type". Same type may appear in multiple rows. WLAN rows add a "Radio" select (labels like
  "5 GHz (Wi-Fi 6) @ 80 MHz") when the AP has more than one radio; the column
  is hidden otherwise. The radio list itself uses the same row pattern.
- Everything recalculates live on every input change (no calculate button).
- Reset button per tab ("Reset") → restores the tab defaults and clears
  its localStorage entry.
- `<details>` "Assumptions & notes" per tab: 2–3 sentences explaining the
  model, stating that all default values are editable and are conservative
  planning values.
- Footer hint: "All values are planning estimates and do not replace a
  measurement."

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
- Utilization bars with the 60/85% thresholds from the formulas.
- Responsive single column < 960 px; visible keyboard focus states;
  `prefers-reduced-motion` respected; body text contrast at least WCAG AA.
- Content column `max-width` ~1100 px centered, line lengths < 80 chars.
- Big result numbers as visual anchors (~1.8rem+ / 700 weight).
- Number formatting: English (`Intl.NumberFormat('en-US')`), units "Mbit/s",
  "Gbit/s" (use Gbit/s when value ≥ 1000), percentages with one decimal below
  100% and no space: "36.7%"; whole numbers from 100% up: "1500%".

## Edge cases (must be handled)

- Empty mix / all counts 0: show "—" and a neutral hint "No clients
  configured. Add a client type or enter a count above 0." No NaN/Infinity
  anywhere; verdict hidden.
- Invalid/empty number fields: treat as 0 for calculation without crashing.
- Capacity override ≤ 0: fall back to matrix value and mark field, with the
  error "Enter a value greater than 0. Using the planning value of … until
  then."
- Corrupt or missing localStorage: fall back to defaults.
- Client rows whose radio no longer exist move to the first radio (same happens
  when a radio is removed). At least one radio always exists, at most four.
- States saved by older versions (one radio at the top level) migrate to a
  single-radio AP automatically.
- Very large numbers: format as Gbit/s where sensible; no layout breakage.

## Acceptance criteria

- [ ] `index.html` opens via `file://` in a current Chrome/Firefox, zero
      console errors, no external network requests.
- [ ] All acceptance examples above produce exactly the documented numbers.
- [ ] Live recalculation on every input; tab switching keeps both states.
- [ ] Inputs persist in localStorage (`nbc-wired-v1`, `nbc-wlan-v1`) across
      reloads; reset works.
- [ ] Responsive single-column layout below 960 px.
- [ ] English UI strings exactly as specified; code/comments in English.
- [ ] No overengineering: three files, no abstractions beyond what is useful.

## README (update existing)

Keep the icon header. Add: one-paragraph description, how to run (open
`index.html` or serve statically), short "How it works" section
(client mix, concurrency, capacity matrix, verdict thresholds), and a
disclaimer that values are planning estimates, not measurements.
