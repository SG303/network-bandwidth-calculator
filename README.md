<img src="assets/icon.svg" width="64" height="64" alt="">

# Network Bandwidth Calculator

**Live:** <https://sg303.github.io/network-bandwidth-calculator/>

A small, dependency-free web tool for network engineers. Enter a typical client
mix and it estimates the bandwidth needed on switch access ports and uplinks,
the switch size, and the load on a WLAN access point, including a verdict and
the recommended number of APs. Every number updates live, so it can be used
directly in customer conversations to justify sizing decisions.

## Run

Open `index.html` in a current browser (works offline via `file://`), or serve
the folder with any static web server, e.g. `python3 -m http.server`.
There is no build step and no external request. The last inputs of each tab are
kept in `localStorage` (`nbc-wired-v1`, `nbc-wlan-v1`); "Reset" restores the
defaults.

## How it works

- **Client mix**: each row is a client type, a count and a per-client demand in
  Mbit/s (presets are editable). Peak demand = Σ count × Mbit/s.
- **Switch / wired**: effective uplink load = peak demand × concurrency
  (default 25%). The uplink is the smallest of 1 / 10 / 25 / 40 / 100 Gbit/s
  that carries this load; above 85% utilization the tool suggests the next
  class. The access port speed follows the largest single-client demand
  (1 Gbit/s baseline). Switch size = smallest of 8 / 12 / 24 / 28 / 48 / 52
  ports with 20% reserve; above 52 ports, several 48-port switches.
- **WLAN**: each AP is described by its radios (1–4: band/standard, channel
  width, spatial streams, signal) and every client row is assigned to one of
  them, with its own client capability (Wi-Fi 4/5/6/6E/7, 1×1/2×2/4×4,
  preset by the client type).
  The capacity follows from the signal: the SNR, entered directly or as
  RSSI minus the noise floor (−95 dBm at 20 MHz on 5/6 GHz, −90 dBm on
  2.4 GHz, +3 dB per doubling of the width), selects the highest MCS a
  typical receiver decodes (MCS 7 needs 25 dB). Radio and client use their
  common standard, width and streams; 60% of that PHY rate is usable after
  contention, overhead and retries. Defaults: 25 dB on 5/6 GHz, 15 dB on
  2.4 GHz, where interference costs more than the noise floor shows. A 4×4
  radio adds 3 dB for clients with fewer streams (about one MCS step);
  MU-MIMO is not counted. 6 GHz takes only Wi-Fi 6E/7 clients.
  Effective load = peak demand × concurrency (same slider and default 25% as
  the wired tab). Each client row needs airtime = its load / its rate, and
  the airtime of a radio's clients is its utilization, so slow clients weigh
  more than their data rate suggests. A measured capacity can replace the
  derived one per radio.
- **Verdict thresholds**: utilization ≤ 60% is OK, 60–85% borderline,
  above 85% overloaded, judged on the utilization as displayed (rounded to
  0.1%). Recommended APs per radio = ⌈utilization / 60%⌉, i.e. ⌈effective
  demand / (60% × capacity)⌉. Because one AP carries all of its radios, the AP count is
  the **highest** single-radio requirement (never the sum), at least 1.

## Tests

`node --test` runs the calculation tests in `test/` with Node's built-in test
runner (Node 18+, no dependencies): PHY rates against the 802.11 rate tables,
the acceptance examples from `SPEC.md`, invariants over every
radio/client/SNR combination and the migration of saved states.

## Disclaimer

All values are planning estimates based on simple, transparent assumptions.
They do not replace a site survey or a measurement.

## License

MIT, see [LICENSE](LICENSE).
