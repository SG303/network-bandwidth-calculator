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
  ports with 20% reserve.
- **WLAN**: effective load = peak demand × concurrency (same slider and
  default 25% as the wired tab). That load is compared with the planning
  capacity of one AP radio, taken from a matrix per band/standard and channel
  width (conservative goodput, about 40–45% of the PHY rate) and editable as an
  override.
- **Verdict thresholds**: utilization ≤ 60% is OK, 60–85% borderline,
  above 85% overloaded. Recommended APs = ⌈effective demand /
  (60% × capacity)⌉, at least 1.

## Disclaimer

All values are planning estimates based on simple, transparent assumptions.
They do not replace a site survey or a measurement.

## License

MIT, see [LICENSE](LICENSE).
