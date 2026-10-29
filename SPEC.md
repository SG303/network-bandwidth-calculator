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
- No simulation of client positions or SNR distributions: one design signal
  level per radio, one client capability per client row. Simple, transparent,
  editable model.

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
- `test/app.test.js` — calculation tests, run with `node --test` (Node's
  built-in runner, no dependencies); not loaded by the page
- `assets/icon.svg` — already exists; use it as favicon via
  `<link rel="icon" href="assets/icon.svg">`

Load JS with a classic script tag: `<script src="app.js" defer></script>`.
(ES modules are blocked over `file://` — do not use them.)

## Client type presets

Shared by both tabs. Each row in the mix: type (dropdown), count, editable
`Mbit/s` per client. Selecting a type fills its default value. In the WLAN tab
it also fills the typical client capability (Wi-Fi standard and spatial
streams), editable per row; the wired tab ignores it.

| id            | Label (exact)                                 | Default Mbit/s | WLAN client     |
|---------------|-----------------------------------------------|----------------|-----------------|
| office-light  | Office – light (web, email, SaaS)             | 2              | Wi-Fi 6, 2×2    |
| office-heavy  | Office – heavy (cloud workloads, downloads)   | 10             | Wi-Fi 6, 2×2    |
| vdi-light     | VDI – light (task worker, Office, ERP)        | 0.5            | Wi-Fi 6, 2×2    |
| vdi-standard  | VDI – standard (browser, Office, Teams)      | 3              | Wi-Fi 6, 2×2    |
| vdi-heavy     | VDI – heavy (video, multi-monitor, graphics)  | 10             | Wi-Fi 6, 2×2    |
| video-conf    | Video conference (Teams/Zoom, HD)             | 4              | Wi-Fi 6, 2×2    |
| stream-hd     | Video streaming (HD)                          | 8              | Wi-Fi 6, 2×2    |
| stream-4k     | Video streaming (4K)                          | 25             | Wi-Fi 6, 2×2    |
| voip          | VoIP telephony                                | 0.1            | Wi-Fi 5, 1×1    |
| file-transfer | File transfer / CAD / backup                  | 50             | Wi-Fi 6, 2×2    |
| iot           | Printers / scanners / IoT                     | 0.5            | Wi-Fi 4, 1×1    |
| pos           | Point of sale / POS                           | 1              | Wi-Fi 5, 2×2    |
| custom        | Custom client type                            | 10             | Wi-Fi 6, 2×2    |

The VDI values are the active-session demand of one remote-display client
(RDP, HDX, Blast), not an average. Basis: Microsoft's RDP measurements for
1080p single monitor (Word/Excel 0.1–0.5 Mbit/s, web browsing 1–6.5, video
playback 2.5–9.5 depending on graphics mode) and Citrix/Horizon planning
figures (about 0.15–0.8 Mbit/s for office work, 1.5–2.3 for video without
redirection). Higher resolution, more monitors, 3D/CAD or 4K raise the demand
well above "heavy" (Microsoft cites 15 Mbit/s at 4K): enter it per row. VDI is
more sensitive to latency and jitter than to bandwidth (aim for under 50 ms
round trip).

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
  (with 20% reserve)". If `N × 1.2 > 52`: several 48-port switches,
  `count = ceil(N × 1.2 / 48)`, text "e.g. 3 × 48-port switch (with 20%
  reserve)". The 52-port class is not stacked: its four extra ports are
  usually uplink/stacking ports, which every switch of a stack needs.

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
  stream-4k**, both rows on the first radio. Under the client-type select each
  row has a compact "Client" line with the Wi-Fi standard (Wi-Fi 4 / 5 / 6 /
  6E / 7) and the client's spatial streams (1×1 / 2×2 / 4×4), filled from the
  type preset, and a compact "Radio" line that assigns the clients to one of
  the AP's radios; the radio line is hidden while the AP has only one radio.
- Radio list "AP radios": 1–4 radios (**default: one**, see below). Every radio
  has:
  - Dropdown "Radio" (band + standard combined):
    - `2g`: "2.4 GHz (Wi-Fi 4/6)" — widths 20/40, rates as 802.11ax
    - `5g-ac`: "5 GHz – Wi-Fi 5 (802.11ac)" — widths 20/40/80
    - `5g-ax`: "5 GHz – Wi-Fi 6 (802.11ax)" — widths 20/40/80/160 — **default**
    - `6g-6e`: "6 GHz – Wi-Fi 6E" — widths 20/40/80/160, rates as 802.11ax
    - `6g-be`: "6 GHz – Wi-Fi 7 (802.11be)" — widths 20/40/80/160/320
  - Dropdown "Channel width" (MHz), filtered by profile, **default 80**.
  - Dropdown "Spatial streams": "2×2" (**default**) or "4×4", for every
    profile.
  - Number field "Capacity (Mbit/s)" — empty (placeholder "auto") means the
    capacity is derived from the signal, a value > 0 overrides it (e.g. a
    measured value). Profile, width and streams changes clear the override.
  - Two-position switch "Signal": "SNR" (**default**) or "RSSI", then a
    number field "SNR (dB)" or "RSSI (dBm)". In RSSI mode a third field
    "Noise floor (dBm)" appears: empty means auto (placeholder "auto −89"),
    a value overrides it. Switching the mode converts the value so the planned
    SNR stays the same (RSSI = SNR + noise floor). A band change resets signal
    and noise floor to the band defaults; a width change clears an entered
    noise floor. In SNR mode a width change also moves the entered SNR by
    −3 dB per doubling of the width (+3 dB per halving), clamped to 0–60 dB,
    because a wider channel collects more noise at the same received signal;
    in RSSI mode the noise floor does that. An empty or invalid SNR is left
    alone.
  - A link readout under the fields, in three steps: "SNR 25 dB" (source:
    "signal to noise", "−64 dBm over −89 dBm noise", "+3 dB for 4×4") →
    "MCS 7" ("64-QAM 5/6") → "432.4 Mbit/s" ("60% of 720.6 PHY, 2×2
    client"; with an override: the override and "manual capacity"). It
    describes a 2×2 client of the radio's own standard.
  - Remove button "✕" (accessible name "Remove radio"), hidden while only one
    radio exists. Button "+ Add radio", hidden at four radios. Removing a radio
    moves its clients to the first radio. New radios start from the default
    radio; ids stay stable so rows keep their assignment.
  Shared helper text: "The SNR sets the MCS; 60% of its PHY rate is usable
  capacity. Leave capacity empty for auto, or enter a measured value."
  It shows the first error instead (field gets `aria-invalid`):
  - "<radio label>: enter a capacity greater than 0, or clear the field for
    auto. Using … until then."
  - "<radio label>: enter an SNR from 0 to 60 dB. Using 25 dB until then." /
    "<radio label>: enter an RSSI from −100 to −20 dBm. Using an SNR of 25 dB
    until then." (band default SNR)
  - "<radio label>: enter a noise floor from −110 to −60 dBm, or clear the
    field for auto (−89 dBm)."
- Slider "Concurrency (statistical)" 10–100%, step 5, **default 25%** — same
  control and helper text as the wired tab.

### Link model (capacity per client)

The capacity is derived per client row from the link between the radio and
that kind of client:

1. **SNR** of the radio: entered directly, or `RSSI − noise floor`. Noise
   floor (auto) = band value at 20 MHz + 3 dB per doubling of the width
   (`N20 + 3·log2(width/20)`). Defaults per band:

   | Band    | Default SNR | Noise floor @ 20 MHz | e.g. @ 80 MHz |
   |---------|-------------|----------------------|---------------|
   | 2.4 GHz | 15 dB       | −90 dBm              | —             |
   | 5 GHz   | 25 dB       | −95 dBm              | −89 dBm       |
   | 6 GHz   | 25 dB       | −95 dBm              | −89 dBm       |

   2.4 GHz plans with a lower SNR because interference (neighbouring networks,
   Bluetooth, microwaves) and legacy clients cost it more than its noise floor
   shows. 25 dB is the common design target for voice and video.
2. **Common PHY** of radio and client: generation = min(radio, client)
   (Wi-Fi 4 = 802.11n, 5 = 802.11ac, 6/6E = 802.11ax, 7 = 802.11be); 802.11ac
   exists on 5 GHz only, so Wi-Fi 5 clients use 802.11n on 2.4 GHz. Width =
   the widest width of that generation ≤ the radio's width (802.11n ≤ 40,
   802.11ac/ax ≤ 160, 802.11be ≤ 320 MHz). Streams = min(radio, client).
   **6 GHz radios only take Wi-Fi 6E and 7 clients**; other clients cannot
   connect (see edge cases).
3. **4×4 gain**: a 4×4 radio adds 3 dB (10·log10(4/2)) to the SNR of clients
   with fewer than four streams — receive combining on the uplink, transmit
   beamforming on the downlink; the downlink part can be capped by the EIRP
   limit and beacons are not beamformed. It adds no streams for those clients;
   MU-MIMO is not counted. The signal inputs describe a 2×2 radio (survey
   values come from beacons).
4. **MCS** = the highest MCS whose SNR threshold ≤ link SNR, capped at the
   generation's top MCS (802.11n 7, 802.11ac 9, 802.11ax 11, 802.11be 13) and
   skipping MCS the standard does not define (802.11ac MCS 9 at 20 MHz with 1,
   2 or 4 streams). Below 5 dB the link is planned at MCS 0 and flagged.

   | MCS | Modulation | Coding | SNR (dB) |
   |-----|------------|--------|----------|
   | 0   | BPSK       | 1/2    | 5        |
   | 1   | QPSK       | 1/2    | 8        |
   | 2   | QPSK       | 3/4    | 11       |
   | 3   | 16-QAM     | 1/2    | 14       |
   | 4   | 16-QAM     | 3/4    | 17       |
   | 5   | 64-QAM     | 2/3    | 20       |
   | 6   | 64-QAM     | 3/4    | 22       |
   | 7   | 64-QAM     | 5/6    | 25       |
   | 8   | 256-QAM    | 3/4    | 28       |
   | 9   | 256-QAM    | 5/6    | 30       |
   | 10  | 1024-QAM   | 3/4    | 33       |
   | 11  | 1024-QAM   | 5/6    | 35       |
   | 12  | 4096-QAM   | 3/4    | 38       |
   | 13  | 4096-QAM   | 5/6    | 40       |

   Typical planning values; receivers differ by a few dB.
5. **PHY rate** = data subcarriers × bits × coding × streams / symbol time,
   with a 0.8 µs guard interval: data subcarriers 52/108 (802.11n/ac at
   20/40 MHz), 234/468 (802.11ac at 80/160 MHz), 234/468/980/1960/3920
   (802.11ax/be at 20…320 MHz); symbol time 4.0 µs (802.11n/ac) or 13.6 µs
   (802.11ax/be). E.g. 802.11ax 80 MHz MCS 7 2×2 = 720.6 Mbit/s.
6. **Usable rate** `R = round(PHY × 60%, 0.1)` — what remains after
   contention, protocol overhead, retries and management traffic.

At the default SNR this reproduces the earlier capacity matrix for 5/6 GHz
within ±15% (5 GHz Wi-Fi 6 @ 80 MHz: 432.4 instead of 450 Mbit/s; 4×4: 518.8
instead of 520) and keeps 2.4 GHz conservative (41.3 instead of 50 Mbit/s at
20 MHz).

### Formulas

Per radio `r`, counting only the client rows `i` assigned to it that can
connect:

- Peak demand `D_r = Σ count_i × mbps_i` (Mbit/s), clients `N_r = Σ count_i`
- Effective load `E_i = count_i × mbps_i × concurrency`, `E_r = Σ E_i`
- Rate per row `R_i` = usable rate of its link, or the capacity override
- Airtime per row `A_i = E_i / R_i`; utilization `U_r = Σ A_i` — slow clients
  need more airtime for the same data. With one rate for all rows this is
  `E_r / C_r`.
- Capacity `C_r` = override, or the demand-weighted harmonic mean of the row
  rates `D_r / Σ (D_i / R_i)` (by client count when all demand is 0; the 2×2
  reference client when the radio has no clients)
- `U_r` is rounded to 0.1% (the displayed precision) before the verdict and
  the AP count are derived from it, so the verdict always matches the shown
  number (60.04% → "60.0%" → OK). The same rounding applies to the uplink
  utilization and its low-headroom hint.
- Verdict per radio: `U_r ≤ 0.60` → "OK – headroom available" (green);
  `0.60 < U_r ≤ 0.85` → "Borderline – tight during load peaks" (amber);
  `U_r > 0.85` → "Overloaded – add APs, widen the channel or change the
  profile" (red). A radio without clients shows "idle".
- APs needed by this radio `= 0` without clients, otherwise
  `max(1, ceil(U_r / 0.6))`
- Average per client `= C_r / N_r` (Mbit/s)

For the AP (one device carries all of its radios):

- Recommended APs `= max(1, max_r APs_r)` — **the highest single-radio
  requirement, never the sum of the radios** ("Recommended APs for this mix
  (max. 60% utilization per AP)")
- Overall verdict = worst radio verdict; the utilization shown is the one of
  the limiting radio (highest `U_r`)
- Totals: `D` and `E` over all rows (including clients that cannot connect),
  `N = Σ N_r`

AP switch port (each AP gets its own port; `r` over the radios with
reachable clients, none → no recommendation):

- Port load `L = Σ_r min(E_r, C_r) / APs` (a radio never puts more on the
  wire than its capacity), ceiling `K = Σ_r C_r`
- Minimum port speed = smallest of 1 / 2.5 / 5 / 10 Gbit/s with
  `L / speed ≤ 0.85` (utilization rounded to 0.1% as above). `L` above what
  10 Gbit/s carries at 85%: no recommendation, red note.
- Recommended port speed (with room for peaks) = the larger of the minimum and
  the smallest speed with `speed ≥ K`, capped at 10 Gbit/s. Its utilization is
  `L / speed`. Capped hint when `K` still exceeds the recommended speed.
- Cabling for 100 m (at the recommended speed): 1 and 2.5 Gbit/s Cat5e or better, 5 Gbit/s Cat6 or
  better, 10 Gbit/s Cat6a (Cat6 up to 55 m).

### Outputs (result cards, per-radio table, airtime table, breakdown table)

- "Utilization" (hero) = `U` of the limiting radio, with colored CSS bar and %
  (cap bar fill at 100% width, keep the real number as text, e.g. "375%")
- Verdict badge (worst radio)
- "Recommended APs" with note "Recommended APs for this mix (max. 60%
  utilization per AP)"; with more than one radio: "Highest requirement of a
  single radio (max. 60% utilization per AP)"
- With more than one radio the status note reads "Limiting radio: …"
- Link note (second status note): clients that cannot connect (red) —
  "N clients cannot connect: 6 GHz needs Wi-Fi 6E or Wi-Fi 7. Assign them to
  another radio or change their Wi-Fi standard; their demand is not
  counted." — otherwise a radio below the MCS 0 threshold (amber) — "<radio
  label>: the SNR is below the 5 dB that MCS 0 needs. Planned at MCS 0, but
  expect dropped connections."
- "Peak demand (all at once)" = D
- "Effective demand (at X% concurrency)" = E
- "AP capacity (usable throughput)" = C of the limiting radio (label becomes
  "Capacity, limiting radio" with more than one radio)
- "Avg. bandwidth per client" of the limiting radio (label becomes
  "Avg. per client, limiting radio" with more than one radio)
- "Load by radio" table: radio (band + standard, then "@ 80 MHz, 2×2," and
  "SNR 25 dB" or "manual capacity"), effective load and capacity in Mbit/s
  (unit in the column header), utilization with verdict badge ("idle" without
  clients), APs ("—" without clients)
- "Airtime by client type" table: client type with "20 × Wi-Fi 6, 2×2 at
  80 MHz" (plus "on <radio>" with several radios) on a second line, MCS ("—"
  with an override), rate (Mbit/s), airtime of its radio. Clients that cannot
  connect show "—" and a red "No link" badge. Note below: "Slower clients need
  more airtime for the same data. The airtime of all clients on a radio adds
  up to its utilization."
- "Switch port per AP": recommended speed (e.g. "1 Gbit/s") with badge
  "Utilization X%" (of the recommended speed, zone colors as for the radios),
  note "Effective load per AP: …" (prefixed "One port per AP, N in total. "
  with more than one AP), note "Minimum for the typical load: X (Y%
  utilization)", "Cabling for 100 m: …", and a hint: when the recommendation
  is above the minimum, "The radios can deliver up to X per AP. The minimum
  carries the typical load; Y also leaves room for single peaks."; when both
  are equal: "The radios can deliver up to X per AP, so Y also leaves room for
  single peaks."; amber when
  the radios could deliver more than even the recommendation carries — "The
  radios can deliver up to X per AP, more than this port carries. The typical
  load fits, but single peaks are capped at the port speed." Below: a
  utilization bar per speed (1 / 2.5 / 5 / 10 Gbit/s) with the recommended one
  highlighted and the minimum (if different) outlined. Red note without a
  possible speed: "The load per AP exceeds what a 10 Gbit/s port carries –
  check the capacity override."
- Note: "Capacity is per radio. A dual-band AP (2.4 + 5/6 GHz) adds the
  capacity of its second radio."
- Second note, only while at least one radio is 4×4: "4×4 with clients of
  fewer streams: 3 dB more link margin is added to their SNR, roughly one MCS
  step or 20% more range at the cell edge. Many 4×4 APs need PoE+ (802.3at)
  or 802.3bt to run all radios at full power — check the datasheet."
- "Breakdown by client type" table: count, Mbit/s, subtotal, total row

### Acceptance examples (must match exactly)

1. Default mix (20 × 2 + 5 × 25, Wi-Fi 6 2×2) on the default radio (5g-ax @
   80 MHz, SNR 25 dB), concurrency 25%:
   D = 165 Mbit/s, E = 41.25 Mbit/s, MCS 7, C = 432.4, U = 9.5% → OK;
   APs = 1; avg. per client = 17.3 Mbit/s.
2. 30 × stream-4k on 2g @ 20 MHz (SNR 15 dB), concurrency 25%:
   D = 750 Mbit/s, E = 187.5 Mbit/s, MCS 3, C = 41.3, U = 454% → Overloaded;
   APs = 8. (At concurrency 100% the same mix gives U = 1816% and APs = 31.)
3. Two radios (2g @ 20 MHz + 5g-ax @ 80 MHz): 10 × iot (Wi-Fi 4, 1×1) on the
   2.4 GHz radio, 20 × office-light + 5 × stream-4k on the 5 GHz radio,
   concurrency 25%:
   2.4 GHz: D = 5, E = 1.25, C = 15.6 (802.11n 1×1 MCS 3), U = 8.0% → OK,
   APs = 1; 5 GHz: D = 165, E = 41.25, C = 432.4, U = 9.5% → OK, APs = 1;
   totals D = 170, E = 42.5 → **APs = 1** (limiting radio: 5 GHz).
4. Same two radios, 30 × stream-4k on the 2.4 GHz radio, 5 GHz idle,
   concurrency 25%:
   2.4 GHz: U = 454% → APs = 8; 5 GHz: idle (APs 0) → **APs = 8**, not 9.
5. Default mix on 5g-ax @ 80 MHz, **4×4**, concurrency 25%:
   SNR 25 + 3 dB → MCS 8, C = 518.8, U = 8.0% → OK; APs = 1; avg. per client
   = 20.75 Mbit/s. Example 2 with a 4×4 radio (2g @ 20 MHz): MCS 4, C = 61.9,
   U = 303% → APs = 6.
6. RSSI −67 dBm on 5g-ax with auto noise floor, 2×2 client: 20 / 40 / 80 /
   160 MHz give SNR 28 / 25 / 22 / 19 dB → MCS 8 / 7 / 6 / 4 → 123.9 / 206.5
   / 389.1 / 518.8 Mbit/s.

## UI / UX

- Header: "Network Bandwidth Calculator", subtitle "Estimate the bandwidth
  needed for switch ports, uplinks and WLAN".
- Tab bar (pills): "Switch / wired" | "WLAN". Only one tab visible at a time.
- Layout: two-column grid (inputs left, results right) ≥ 960 px, stacked below.
- Client-mix component: table-like rows: type select, count (number, min 0,
  step 1), Mbit/s per client (number, min 0, step 0.1), remove button "✕"
  (accessible name "Remove row"). Button "+ Add client type". Same type may
  appear in multiple rows. WLAN rows add a "Client" line (standard and
  streams) below the type select, and a "Radio" select (labels like
  "5 GHz (Wi-Fi 6) @ 80 MHz, 2×2") when the AP has more than one radio. The
  radio list uses four lines per radio with visible labels at every width:
  the profile; channel width, spatial streams, capacity and remove; the
  SNR/RSSI switch, the signal value and (RSSI only) the noise floor; the
  link readout.
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

- Empty mix / all counts 0: show "—" on every result card (including the
  WLAN capacity card) and a neutral hint "No clients configured. Add a client
  type or enter a count above 0." No NaN/Infinity anywhere; verdict hidden.
- Invalid/empty number fields: treat as 0 for calculation without crashing.
- Capacity field empty: auto (derived). Override ≤ 0 or not a number: use
  the auto value and mark the field with the error above. Invalid or empty
  signal: use the band default SNR; invalid noise floor: use the auto value.
- Clients that cannot use their radio's band (Wi-Fi 4/5/6 on 6 GHz): not
  counted on the radio, red link note, "No link" in the airtime table and
  `aria-invalid` on the row's standard select. Their demand stays in the
  totals.
- SNR below the MCS 0 threshold: planned at MCS 0, amber link note, red MCS
  step in the readout.
- Corrupt or missing localStorage: fall back to defaults.
- Client rows whose radio no longer exist move to the first radio (same happens
  when a radio is removed). At least one radio always exists, at most four.
- States saved by older versions (one radio at the top level) migrate to a
  single-radio AP automatically. Radios saved without streams are 2×2.
  Radios saved before the signal model (no `signalMode`) carried the matrix
  capacity in their capacity field: a value equal to the earlier matrix
  (`2g` 50/100, `5g-ac` 80/170/350, `5g-ax` and `6g-6e` 110/220/450/900,
  `6g-be` 120/240/500/1000/1900; 4×4 = `round(C × 1.15 / 10) × 10`) becomes
  auto, any other value stays as an override. They get the band default SNR
  in SNR mode. Rows without a client capability take the preset of their
  type.
- Very large numbers: format as Gbit/s where sensible; no layout breakage.

## Acceptance criteria

- [ ] `index.html` opens via `file://` in a current Chrome/Firefox, zero
      console errors, no external network requests.
- [ ] All acceptance examples above produce exactly the documented numbers;
      `node --test` passes.
- [ ] Live recalculation on every input; tab switching keeps both states.
- [ ] Inputs persist in localStorage (`nbc-wired-v1`, `nbc-wlan-v1`) across
      reloads; reset works.
- [ ] Responsive single-column layout below 960 px.
- [ ] English UI strings exactly as specified; code/comments in English.
- [ ] No overengineering: three app files (plus the test file), no
      abstractions beyond what is useful.

## README (update existing)

Keep the icon header. Add: one-paragraph description, how to run (open
`index.html` or serve statically), short "How it works" section
(client mix, concurrency, link model, verdict thresholds), and a
disclaimer that values are planning estimates, not measurements.
