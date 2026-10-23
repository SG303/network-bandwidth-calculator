<img src="assets/icon.svg" width="64" height="64" alt="">

# Network Bandwidth Calculator

**Live:** <https://sg303.github.io/network-bandwidth-calculator/>

Created in [T3 Code](https://t3.codes).

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
  width, spatial streams, capacity) and every client row is assigned to one of
  them.
  Effective load per radio = peak demand × concurrency (same slider and
  default 25% as the wired tab), compared with the capacity of this
  radio: the usable aggregate throughput it really carries for all
  clients of that radio, in practice roughly a third to half of the PHY data
  rate and not the datasheet value, taken from a matrix per band/standard and
  channel width and editable as an override. The matrix is for 2×2 radios; a
  4×4 radio is planned with +15%, because against 2×2 clients it gains about
  3 dB of link margin (roughly one MCS step away from the AP) but no extra
  streams, and MU-MIMO is not counted.
- **Verdict thresholds**: utilization ≤ 60% is OK, 60–85% borderline,
  above 85% overloaded, judged on the utilization as displayed (rounded to
  0.1%). Recommended APs per radio = ⌈utilization / 60%⌉, i.e. ⌈effective
  demand / (60% × capacity)⌉. Because one AP carries all of its radios, the AP count is
  the **highest** single-radio requirement (never the sum), at least 1.

## Disclaimer

All values are planning estimates based on simple, transparent assumptions.
They do not replace a site survey or a measurement.

## License

MIT, see [LICENSE](LICENSE).
