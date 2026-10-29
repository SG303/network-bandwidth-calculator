'use strict';

// Run with: node --test
// Pure calculation tests for app.js: reference PHY rates from the 802.11
// standards, the documented acceptance examples, plausibility checks against
// the earlier planning matrix, and invariants over every input combination.

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app.js');

const {
  AP_PROFILES, CLIENT_STANDARDS, CLIENT_STREAM_OPTIONS, STREAM_OPTIONS, MCS_TABLE, PHY, DEFAULTS,
} = app;

const clone = (value) => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
};

function radio(overrides) {
  return { ...app.DEFAULT_RADIO, ...overrides };
}

function row(type, count, mbps, extra = {}) {
  const preset = app.CLIENT_TYPES.find((t) => t.id === type);
  return { type, count, mbps, radio: 'r1', client: preset.client, clientStreams: preset.streams, ...extra };
}

function wlan(rows, radios, concurrency = 25) {
  return app.calcWlan({ rows, radios, concurrency });
}

const SNR_SWEEP = Array.from({ length: 51 }, (_, i) => i); // 0 … 50 dB

/* ------------------------------------------------------------------ *
 * PHY layer
 * ------------------------------------------------------------------ */

test('PHY rates match the 802.11 rate tables (0.8 µs guard interval)', () => {
  const cases = [
    // [gen, width, mcs, streams, Mbit/s from the standard's tables]
    [4, 20, 7, 1, 65], // HT MCS 7
    [4, 40, 7, 2, 270], // HT MCS 15
    [4, 20, 0, 1, 6.5],
    [5, 80, 9, 1, 390], // VHT 80 MHz, long GI
    [5, 80, 9, 2, 780],
    [5, 160, 9, 2, 1560],
    [5, 20, 8, 1, 78],
    [6, 20, 0, 1, 8.6],
    [6, 20, 11, 1, 143.4],
    [6, 80, 7, 1, 360.3],
    [6, 80, 11, 2, 1201],
    [6, 160, 11, 2, 2402],
    [6, 160, 11, 4, 4804],
    [7, 320, 13, 1, 2882.4],
    [7, 320, 13, 2, 5764.7],
  ];
  for (const [gen, width, mcs, streams, expected] of cases) {
    near(app.phyRate(gen, width, mcs, streams), expected, 0.1, `gen ${gen}, ${width} MHz, MCS ${mcs}, ${streams} SS`);
  }
});

test('PHY rejects MCS the standard does not define', () => {
  assert.equal(app.phyRate(5, 20, 9, 1), null, 'VHT 20 MHz MCS 9 with 1 stream');
  assert.equal(app.phyRate(5, 20, 9, 2), null, 'VHT 20 MHz MCS 9 with 2 streams');
  assert.equal(app.phyRate(5, 20, 9, 4), null, 'VHT 20 MHz MCS 9 with 4 streams');
  assert.notEqual(app.phyRate(5, 20, 9, 3), null, 'VHT 20 MHz MCS 9 with 3 streams exists');
  assert.equal(app.phyRate(4, 20, 8, 1), null, 'HT stops at MCS 7 per stream');
  assert.equal(app.phyRate(5, 20, 10, 1), null, 'VHT stops at MCS 9');
  assert.equal(app.phyRate(6, 20, 12, 1), null, 'HE stops at MCS 11');
  assert.equal(app.phyRate(4, 80, 0, 1), null, 'HT has no 80 MHz channel');
  assert.equal(app.phyRate(6, 320, 0, 1), null, 'HE has no 320 MHz channel');
});

test('MCS table: strictly rising SNR and data bits', () => {
  for (let m = 1; m < MCS_TABLE.length; m += 1) {
    assert.ok(MCS_TABLE[m].snr > MCS_TABLE[m - 1].snr, `SNR rises at MCS ${m}`);
    const bits = (e) => (e.bits * e.coding[0]) / e.coding[1];
    assert.ok(bits(MCS_TABLE[m]) > bits(MCS_TABLE[m - 1]), `bits per subcarrier rise at MCS ${m}`);
  }
  assert.equal(MCS_TABLE[7].snr, 25, 'MCS 7 at 25 dB, the common voice/video design target');
});

/* ------------------------------------------------------------------ *
 * Signal: SNR, RSSI, noise floor
 * ------------------------------------------------------------------ */

test('noise floor: −95 dBm at 20 MHz on 5/6 GHz, +3 dB per doubling; 2.4 GHz is noisier', () => {
  assert.equal(app.noiseFloorFor('5g-ax', 20), -95);
  assert.equal(app.noiseFloorFor('5g-ax', 40), -92);
  assert.equal(app.noiseFloorFor('5g-ax', 80), -89);
  assert.equal(app.noiseFloorFor('5g-ax', 160), -86);
  assert.equal(app.noiseFloorFor('6g-be', 320), -83);
  assert.equal(app.noiseFloorFor('2g', 20), -90);
  assert.equal(app.noiseFloorFor('2g', 40), -87);
});

test('default SNR: 25 dB on 5/6 GHz, lower on 2.4 GHz', () => {
  assert.equal(app.defaultSnr('5g-ax'), 25);
  assert.equal(app.defaultSnr('6g-be'), 25);
  assert.ok(app.defaultSnr('2g') < app.defaultSnr('5g-ax'));
  assert.equal(app.defaultSnr('2g'), 15);
});

test('RSSI mode: SNR = RSSI − noise floor, auto or entered', () => {
  const auto = app.resolveSignal(radio({ signalMode: 'rssi', signal: -64, width: 80 }));
  assert.equal(auto.snr, 25);
  assert.equal(auto.noise, -89);
  assert.equal(auto.noiseAuto, true);
  const manual = app.resolveSignal(radio({ signalMode: 'rssi', signal: -64, noise: -95 }));
  assert.equal(manual.snr, 31);
  assert.equal(manual.noiseAuto, false);
});

test('RSSI mode: the same RSSI gives 3 dB less SNR per doubling of the width', () => {
  const snrAt = (width) => app.resolveSignal(radio({ profile: '6g-be', signalMode: 'rssi', signal: -60, width })).snr;
  assert.deepEqual([20, 40, 80, 160, 320].map(snrAt), [35, 32, 29, 26, 23]);
});

test('SNR mode ignores the noise floor', () => {
  const s = app.resolveSignal(radio({ signalMode: 'snr', signal: 30, noise: -70 }));
  assert.equal(s.snr, 30);
  assert.equal(s.noiseError, false);
});

test('switching between SNR and RSSI keeps the planned SNR', () => {
  for (const profile of Object.keys(AP_PROFILES)) {
    for (const width of AP_PROFILES[profile].widths) {
      for (const snr of [5, 17.5, 25, 40]) {
        const asSnr = radio({ profile, width, signalMode: 'snr', signal: snr });
        const rssi = app.convertSignal(asSnr, 'rssi');
        const asRssi = { ...asSnr, signalMode: 'rssi', signal: rssi };
        assert.equal(app.resolveSignal(asRssi).snr, snr, `${profile} @ ${width}: ${snr} dB → ${rssi} dBm`);
        assert.equal(app.convertSignal(asRssi, 'snr'), snr);
        const before = wlan([row('office-light', 10, 20)], [asSnr]);
        const after = wlan([row('office-light', 10, 20)], [asRssi]);
        assert.equal(after.utilization, before.utilization);
        assert.equal(after.capacity, before.capacity);
      }
    }
  }
});

test('invalid signal inputs fall back to the band default and are flagged', () => {
  for (const [mode, value] of [['snr', null], ['snr', -1], ['snr', 61], ['snr', NaN], ['rssi', -101], ['rssi', -10], ['rssi', null]]) {
    const s = app.resolveSignal(radio({ signalMode: mode, signal: value }));
    assert.equal(s.signalError, true, `${mode} ${value}`);
    assert.equal(s.snr, 25, `${mode} ${value} falls back to 25 dB`);
  }
  const twoG = app.resolveSignal(radio({ profile: '2g', width: 20, signal: null }));
  assert.equal(twoG.snr, 15);
  const noise = app.resolveSignal(radio({ signalMode: 'rssi', signal: -64, noise: -50 }));
  assert.equal(noise.noiseError, true);
  assert.equal(noise.noise, -89, 'invalid noise floor uses the auto value');
  assert.equal(noise.snr, 25);
});

/* ------------------------------------------------------------------ *
 * Link: client capability × radio
 * ------------------------------------------------------------------ */

test('MCS selection at the SNR thresholds', () => {
  const ax80 = radio();
  const mcsAt = (snr) => app.linkFor(ax80, snr, 'wifi6', 2).mcs;
  assert.equal(mcsAt(24.9), 6);
  assert.equal(mcsAt(25), 7);
  assert.equal(mcsAt(27.9), 7);
  assert.equal(mcsAt(28), 8);
  assert.equal(mcsAt(35), 11);
  assert.equal(mcsAt(60), 11, 'Wi-Fi 6 tops out at MCS 11');
  assert.equal(mcsAt(5), 0);
});

test('below the MCS 0 threshold the link is planned at MCS 0 and flagged', () => {
  const link = app.linkFor(radio(), 3, 'wifi6', 2);
  assert.equal(link.mcs, 0);
  assert.equal(link.belowFloor, true);
  assert.ok(link.rate > 0);
  assert.equal(app.linkFor(radio(), 5, 'wifi6', 2).belowFloor, false);
});

test('the top MCS follows the common standard of AP and client', () => {
  const top = (profile, client) => app.linkFor(radio({ profile, width: 20 }), 60, client, 2).mcs;
  assert.equal(top('6g-be', 'wifi7'), 13);
  assert.equal(top('6g-be', 'wifi6e'), 11);
  assert.equal(top('5g-ax', 'wifi7'), 11, 'Wi-Fi 7 client on a Wi-Fi 6 AP speaks 802.11ax');
  assert.equal(top('5g-ax', 'wifi5'), 8, 'VHT at 20 MHz with 2 streams has no MCS 9');
  assert.equal(app.linkFor(radio({ profile: '5g-ac', width: 80 }), 60, 'wifi6', 2).mcs, 9);
  assert.equal(top('5g-ax', 'wifi4'), 7);
});

test('2.4 GHz: Wi-Fi 5 clients fall back to 802.11n', () => {
  const link = app.linkFor(radio({ profile: '2g', width: 20 }), 60, 'wifi5', 2);
  assert.equal(link.gen, 4);
  assert.equal(link.mcs, 7);
});

test('the channel width is capped by the common standard', () => {
  assert.equal(app.linkFor(radio({ width: 160 }), 25, 'wifi4', 1).width, 40, '802.11n tops out at 40 MHz');
  assert.equal(app.linkFor(radio({ profile: '6g-be', width: 320 }), 25, 'wifi6e', 2).width, 160, '802.11ax tops out at 160 MHz');
  assert.equal(app.linkFor(radio({ profile: '6g-be', width: 320 }), 25, 'wifi7', 2).width, 320);
});

test('6 GHz takes only Wi-Fi 6E and 7 clients', () => {
  for (const profile of ['6g-6e', '6g-be']) {
    for (const client of ['wifi4', 'wifi5', 'wifi6']) {
      assert.equal(app.linkFor(radio({ profile }), 25, client, 2), null, `${client} on ${profile}`);
    }
    for (const client of ['wifi6e', 'wifi7']) {
      assert.notEqual(app.linkFor(radio({ profile }), 25, client, 2), null, `${client} on ${profile}`);
    }
  }
  for (const client of Object.keys(CLIENT_STANDARDS)) {
    assert.notEqual(app.linkFor(radio({ profile: '2g', width: 20 }), 25, client, 2), null, `${client} on 2.4 GHz`);
    assert.notEqual(app.linkFor(radio({ profile: '5g-ax' }), 25, client, 2), null, `${client} on 5 GHz`);
  }
});

test('spatial streams: the smaller side wins; 4×4 adds 3 dB for clients with fewer streams', () => {
  const two = app.linkFor(radio({ streams: 2 }), 25, 'wifi6', 2);
  const fourForTwo = app.linkFor(radio({ streams: 4 }), 25, 'wifi6', 2);
  const fourForFour = app.linkFor(radio({ streams: 4 }), 25, 'wifi6', 4);
  const twoForFour = app.linkFor(radio({ streams: 2 }), 25, 'wifi6', 4);
  const twoForOne = app.linkFor(radio({ streams: 2 }), 25, 'wifi6', 1);
  assert.equal(two.streams, 2);
  assert.equal(fourForTwo.streams, 2);
  assert.equal(fourForTwo.gain, 3);
  assert.equal(fourForTwo.snr, 28);
  assert.equal(fourForTwo.mcs, 8, '3 dB is one MCS step here');
  assert.equal(fourForFour.streams, 4);
  assert.equal(fourForFour.gain, 0);
  assert.equal(twoForFour.streams, 2);
  assert.equal(twoForOne.streams, 1);
  near(twoForOne.rate, two.rate / 2, 0.1, 'one stream carries half');
});

test('usable rate is 60% of the PHY rate', () => {
  for (const snr of [5, 17, 25, 33, 40]) {
    const link = app.linkFor(radio({ profile: '6g-be', width: 160 }), snr, 'wifi7', 2);
    near(link.rate, link.phyRate * 0.6, 0.05, `SNR ${snr}`);
  }
});

/* ------------------------------------------------------------------ *
 * Invariants over every combination
 * ------------------------------------------------------------------ */

function* everyLink() {
  for (const profile of Object.keys(AP_PROFILES)) {
    for (const width of AP_PROFILES[profile].widths) {
      for (const streams of STREAM_OPTIONS) {
        for (const client of Object.keys(CLIENT_STANDARDS)) {
          for (const clientStreams of CLIENT_STREAM_OPTIONS) {
            yield { r: radio({ profile, width, streams }), client, clientStreams };
          }
        }
      }
    }
  }
}

test('every link is finite and positive, and never beats the PHY ceiling', () => {
  let checked = 0;
  for (const { r, client, clientStreams } of everyLink()) {
    for (const snr of SNR_SWEEP) {
      const link = app.linkFor(r, snr, client, clientStreams);
      if (link === null) continue;
      checked += 1;
      const where = `${r.profile} @ ${r.width} ${r.streams}×${r.streams}, ${client} ${clientStreams}×, ${snr} dB`;
      assert.ok(Number.isFinite(link.rate) && link.rate > 0, where);
      assert.ok(link.rate <= link.phyRate, where);
      assert.ok(link.width <= r.width, where);
      assert.ok(link.streams <= Math.min(r.streams, clientStreams), where);
      assert.ok(link.mcs <= PHY[link.gen].maxMcs, where);
      const ceiling = app.phyRate(link.gen, link.width, PHY[link.gen].maxMcs, link.streams)
        ?? app.phyRate(link.gen, link.width, PHY[link.gen].maxMcs - 1, link.streams);
      assert.ok(link.phyRate <= ceiling, where);
    }
  }
  assert.ok(checked > 10000, `checked ${checked} links`);
});

test('more SNR never lowers the rate', () => {
  for (const { r, client, clientStreams } of everyLink()) {
    let previous = 0;
    for (const snr of SNR_SWEEP) {
      const link = app.linkFor(r, snr, client, clientStreams);
      if (link === null) break;
      assert.ok(link.rate >= previous, `${r.profile} @ ${r.width}, ${client}, ${snr} dB: ${link.rate} < ${previous}`);
      previous = link.rate;
    }
  }
});

test('at the same SNR, a wider channel and 4×4 never lower the rate', () => {
  for (const profile of Object.keys(AP_PROFILES)) {
    const widths = AP_PROFILES[profile].widths;
    for (const snr of SNR_SWEEP) {
      const client = app.referenceClient(profile);
      for (let i = 1; i < widths.length; i += 1) {
        const narrow = app.linkFor(radio({ profile, width: widths[i - 1] }), snr, client, 2).rate;
        const wide = app.linkFor(radio({ profile, width: widths[i] }), snr, client, 2).rate;
        assert.ok(wide >= narrow, `${profile} ${widths[i]} vs ${widths[i - 1]} MHz at ${snr} dB`);
      }
      for (const width of widths) {
        const two = app.linkFor(radio({ profile, width, streams: 2 }), snr, client, 2).rate;
        const four = app.linkFor(radio({ profile, width, streams: 4 }), snr, client, 2).rate;
        assert.ok(four >= two, `${profile} @ ${width}: 4×4 ${four} < 2×2 ${two} at ${snr} dB`);
      }
    }
  }
});

test('a newer client standard never lowers the rate on the same radio', () => {
  const order = ['wifi4', 'wifi5', 'wifi6', 'wifi7'];
  for (const profile of ['2g', '5g-ac', '5g-ax']) {
    for (const width of AP_PROFILES[profile].widths) {
      for (const snr of [10, 25, 40]) {
        const rates = order.map((c) => app.linkFor(radio({ profile, width }), snr, c, 2).rate);
        for (let i = 1; i < rates.length; i += 1) {
          assert.ok(rates[i] >= rates[i - 1], `${profile} @ ${width}, ${snr} dB: ${order[i]} vs ${order[i - 1]}`);
        }
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * Plausibility against the earlier planning matrix
 * ------------------------------------------------------------------ */

test('at the default SNR, 5/6 GHz capacities stay within ±15% of the earlier matrix', () => {
  for (const profile of ['5g-ac', '5g-ax', '6g-6e', '6g-be']) {
    for (const width of AP_PROFILES[profile].widths) {
      for (const streams of STREAM_OPTIONS) {
        const legacy = app.legacyCapacity(profile, width, streams);
        const r = radio({ profile, width, streams, signal: app.defaultSnr(profile) });
        const derived = wlan([], [r]).capacity;
        const deviation = derived / legacy - 1;
        assert.ok(Math.abs(deviation) <= 0.15,
          `${profile} @ ${width} MHz ${streams}×${streams}: ${derived} vs ${legacy} (${(deviation * 100).toFixed(1)}%)`);
      }
    }
  }
});

test('2.4 GHz stays conservative: below 5 GHz and close to the earlier matrix', () => {
  const twoG = wlan([], [radio({ profile: '2g', width: 20, signal: 15 })]).capacity;
  const fiveG = wlan([], [radio({ profile: '5g-ax', width: 20, signal: 25 })]).capacity;
  assert.ok(twoG < fiveG / 2, `2.4 GHz ${twoG} vs 5 GHz ${fiveG} at 20 MHz`);
  near(twoG, 50, 10, '2.4 GHz @ 20 MHz vs earlier 50 Mbit/s');
  near(wlan([], [radio({ profile: '2g', width: 40, signal: 15 })]).capacity, 100, 20, '2.4 GHz @ 40 MHz vs earlier 100 Mbit/s');
});

test('real-world sanity: usable rate never exceeds what a client sees in a speed test', () => {
  // Best case: Wi-Fi 6 2×2 at 80 MHz, MCS 11 → 1201 PHY. Single-client TCP
  // tests reach roughly 700–950 Mbit/s; the planning value must stay below.
  const best = app.linkFor(radio(), 60, 'wifi6', 2);
  assert.equal(best.mcs, 11);
  assert.ok(best.rate > 600 && best.rate < 950, `${best.rate}`);
  // A Wi-Fi 4 1×1 IoT client on 2.4 GHz at the default SNR: tens of Mbit/s at most.
  const iot = app.linkFor(radio({ profile: '2g', width: 20 }), 15, 'wifi4', 1);
  assert.ok(iot.rate > 5 && iot.rate < 30, `${iot.rate}`);
});

/* ------------------------------------------------------------------ *
 * Airtime model
 * ------------------------------------------------------------------ */

test('a uniform mix reduces to load / capacity', () => {
  const r = wlan([row('office-light', 40, 5)], [radio()]);
  const radio0 = r.radios[0];
  assert.equal(radio0.capacity, 432.4);
  assert.equal(radio0.utilization, Math.round((50 / 432.4) * 1000) / 1000);
});

test('slow clients take more airtime than their data suggests (rate anomaly)', () => {
  const fast = row('office-heavy', 10, 20, { client: 'wifi6', clientStreams: 2 });
  const slow = row('iot', 10, 20, { client: 'wifi4', clientStreams: 1 });
  const onlyFast = wlan([fast, { ...fast }], [radio()], 100).radios[0];
  const mixed = wlan([fast, slow], [radio()], 100).radios[0];
  assert.ok(mixed.utilization > onlyFast.utilization * 2, `${mixed.utilization} vs ${onlyFast.utilization}`);
  // The blended capacity is the demand-weighted harmonic mean of both rates.
  const [a, b] = mixed.links.map((l) => l.rate);
  near(mixed.capacity, 2 / (1 / a + 1 / b), 0.1, 'harmonic mean');
  assert.ok(mixed.capacity < (a + b) / 2, 'below the arithmetic mean');
  // The airtime of the rows adds up to the utilization.
  const sum = mixed.links.reduce((s, l) => s + l.airtime, 0);
  near(mixed.utilization, sum, 0.0005, 'airtime sum');
});

test('clients that cannot connect are reported and not counted on the radio', () => {
  const rows = [row('office-light', 20, 2), row('stream-4k', 5, 25, { client: 'wifi6' })];
  const r = wlan(rows, [radio({ profile: '6g-6e' })]);
  assert.equal(r.unreachable.length, 2);
  assert.equal(r.radios[0].clients, 0);
  assert.equal(r.utilization, 0);
  assert.equal(r.peak, 165, 'the demand still shows in the totals');
  const fixed = wlan(rows.map((x) => ({ ...x, client: 'wifi6e' })), [radio({ profile: '6g-6e' })]);
  assert.equal(fixed.unreachable.length, 0);
  assert.equal(fixed.radios[0].clients, 25);
});

test('capacity override: replaces the derived rate for every client; empty is auto; 0 is flagged', () => {
  const rows = [row('office-light', 20, 2), row('iot', 10, 1)];
  const manual = wlan(rows, [radio({ capacity: 300 })]).radios[0];
  assert.equal(manual.capacity, 300);
  assert.equal(manual.capacityManual, true);
  assert.ok(manual.links.every((l) => l.rate === 300));
  assert.equal(manual.utilization, Math.round((12.5 / 300) * 1000) / 1000);
  const auto = wlan(rows, [radio({ capacity: null })]).radios[0];
  assert.equal(auto.capacityManual, false);
  assert.equal(auto.capacityInvalid, false);
  const zero = wlan(rows, [radio({ capacity: 0 })]).radios[0];
  assert.equal(zero.capacityInvalid, true);
  assert.equal(zero.capacity, auto.capacity, 'an invalid override uses the auto value');
});

test('empty mix: no NaN or Infinity anywhere', () => {
  for (const rows of [[], [row('office-light', 0, 2)], [row('office-light', 5, 0)]]) {
    const r = wlan(rows, [radio(), radio({ id: 'r2', profile: '2g', width: 20, signal: 15 })]);
    const numbers = JSON.stringify(r).match(/null|NaN|Infinity/g) || [];
    assert.ok(!numbers.includes('NaN') && !numbers.includes('Infinity'), JSON.stringify(r));
    assert.ok(r.radios.every((x) => Number.isFinite(x.capacity) && x.capacity > 0));
    assert.equal(r.aps, 1);
  }
});

/* ------------------------------------------------------------------ *
 * Acceptance examples (SPEC.md)
 * ------------------------------------------------------------------ */

test('acceptance 1: default mix on the default radio', () => {
  const r = app.calcWlan(clone(DEFAULTS.wlan));
  assert.equal(r.peak, 165);
  assert.equal(r.effective, 41.25);
  assert.equal(r.capacity, 432.4);
  assert.equal(r.radios[0].reference.mcs, 7);
  assert.equal(app.formatPercent(r.utilization), '9.5%');
  assert.equal(r.verdict, 'ok');
  assert.equal(r.aps, 1);
  near(r.perClient, 17.3, 0.01, 'avg per client');
});

test('acceptance 2: 30 × stream-4k on 2.4 GHz @ 20 MHz', () => {
  const rows = [row('stream-4k', 30, 25)];
  const r = wlan(rows, [radio({ profile: '2g', width: 20, signal: 15 })]);
  assert.equal(r.peak, 750);
  assert.equal(r.effective, 187.5);
  assert.equal(r.capacity, 41.3);
  assert.equal(r.radios[0].reference.mcs, 3);
  assert.equal(app.formatPercent(r.utilization), '454%');
  assert.equal(r.verdict, 'crit');
  assert.equal(r.aps, 8);
  const full = wlan(rows, [radio({ profile: '2g', width: 20, signal: 15 })], 100);
  assert.equal(app.formatPercent(full.utilization), '1816%');
  assert.equal(full.aps, 31);
});

test('acceptance 3: two radios, IoT on 2.4 GHz, office and video on 5 GHz', () => {
  const radios = [radio({ id: 'r1', profile: '2g', width: 20, signal: 15 }), radio({ id: 'r2' })];
  const rows = [
    row('iot', 10, 0.5, { radio: 'r1' }),
    row('office-light', 20, 2, { radio: 'r2' }),
    row('stream-4k', 5, 25, { radio: 'r2' }),
  ];
  const r = wlan(rows, radios);
  const [twoG, fiveG] = r.radios;
  assert.equal(twoG.peak, 5);
  assert.equal(twoG.effective, 1.25);
  assert.equal(twoG.capacity, 15.6, 'Wi-Fi 4 1×1 at MCS 3');
  assert.equal(app.formatPercent(twoG.utilization), '8.0%');
  assert.equal(twoG.aps, 1);
  assert.equal(fiveG.capacity, 432.4);
  assert.equal(app.formatPercent(fiveG.utilization), '9.5%');
  assert.equal(r.peak, 170);
  assert.equal(r.effective, 42.5);
  assert.equal(r.aps, 1);
  assert.equal(r.limiting, 'r2');
});

test('acceptance 4: APs are the highest single-radio requirement, not the sum', () => {
  const radios = [radio({ id: 'r1', profile: '2g', width: 20, signal: 15 }), radio({ id: 'r2' })];
  const r = wlan([row('stream-4k', 30, 25, { radio: 'r1' })], radios);
  assert.equal(r.radios[0].aps, 8);
  assert.equal(r.radios[1].aps, 0);
  assert.equal(r.aps, 8);
});

test('acceptance 5: 4×4 radios', () => {
  const r = app.calcWlan({ ...clone(DEFAULTS.wlan), radios: [radio({ streams: 4 })] });
  assert.equal(r.capacity, 518.8, 'MCS 8 thanks to +3 dB');
  assert.equal(app.formatPercent(r.utilization), '8.0%');
  assert.equal(r.aps, 1);
  near(r.perClient, 20.75, 0.01, 'avg per client');
  const twoG = wlan([row('stream-4k', 30, 25)], [radio({ profile: '2g', width: 20, streams: 4, signal: 15 })]);
  assert.equal(twoG.capacity, 61.9);
  assert.equal(app.formatPercent(twoG.utilization), '303%');
  assert.equal(twoG.aps, 6);
});

test('acceptance 6: RSSI −67 dBm on 5 GHz shows the cost of wide channels', () => {
  const at = (width) => wlan([], [radio({ signalMode: 'rssi', signal: -67, width })]).radios[0].reference;
  // SNR 28 / 25 / 22 / 19 dB: each doubling costs 3 dB, yet still gains capacity.
  assert.deepEqual([20, 40, 80, 160].map((w) => at(w).snr), [28, 25, 22, 19]);
  assert.deepEqual([20, 40, 80, 160].map((w) => at(w).mcs), [8, 7, 6, 4]);
  assert.deepEqual([20, 40, 80, 160].map((w) => at(w).rate), [123.9, 206.5, 389.1, 518.8]);
});

/* ------------------------------------------------------------------ *
 * Persistence and migration
 * ------------------------------------------------------------------ */

test('migration: saved matrix capacities become auto, real overrides survive', () => {
  const old = {
    rows: [{ type: 'office-light', count: 20, mbps: 2, radio: 'r1' }, { type: 'iot', count: 5, mbps: 0.5, radio: 'r2' }],
    radios: [
      { id: 'r1', profile: '5g-ax', width: 80, streams: 2, capacity: 450 },
      { id: 'r2', profile: '2g', width: 20, streams: 4, capacity: 60 },
      { id: 'r3', profile: '5g-ax', width: 80, streams: 2, capacity: 300 },
    ],
    concurrency: 25,
  };
  const s = app.sanitizeState('wlan', old);
  assert.equal(s.radios[0].capacity, null, '450 was the matrix value');
  assert.equal(s.radios[1].capacity, null, '60 was the 4×4 matrix value');
  assert.equal(s.radios[2].capacity, 300, '300 was an override');
  assert.deepEqual(s.radios.map((r) => [r.signalMode, r.signal, r.noise]), [['snr', 25, null], ['snr', 15, null], ['snr', 25, null]]);
  assert.deepEqual(s.rows.map((r) => [r.client, r.clientStreams]), [['wifi6', 2], ['wifi4', 1]], 'presets of the type');
});

test('migration: the oldest single-radio state', () => {
  const s = app.sanitizeState('wlan', { rows: [{ type: 'voip', count: 3, mbps: 0.1 }], profile: '6g-be', width: 320, capacity: 1900 });
  assert.equal(s.radios.length, 1);
  assert.equal(s.radios[0].profile, '6g-be');
  assert.equal(s.radios[0].capacity, null);
  assert.equal(s.rows[0].radio, 'r1');
  assert.equal(s.rows[0].client, 'wifi5');
});

test('current states round-trip unchanged; corrupt values are repaired', () => {
  const current = {
    rows: [{ type: 'pos', count: 4, mbps: 1, radio: 'r1', client: 'wifi7', clientStreams: 4 }],
    radios: [{ id: 'r1', profile: '6g-be', width: 320, streams: 4, capacity: null, signalMode: 'rssi', signal: -58, noise: -92 }],
    concurrency: 40,
  };
  assert.deepEqual(app.sanitizeState('wlan', clone(current)), current);
  const corrupt = app.sanitizeState('wlan', {
    rows: [{ type: 'pos', count: 4, mbps: 1, radio: 'r1', client: 'wifi9', clientStreams: 3 }],
    radios: [{ id: 'r1', profile: '5g-ax', width: 80, streams: 2, capacity: null, signalMode: 'rssi', signal: 12, noise: 'x' }],
    concurrency: 25,
  });
  assert.equal(corrupt.rows[0].client, 'wifi5');
  assert.equal(corrupt.rows[0].clientStreams, 2);
  assert.equal(corrupt.radios[0].signal, -64, 'invalid RSSI resets to the default SNR over the auto noise floor');
  assert.equal(corrupt.radios[0].noise, null);
});

test('wired rows carry no WLAN fields and the wired tab is unchanged', () => {
  const s = app.sanitizeState('wired', { rows: [{ type: 'iot', count: 1, mbps: 1 }], concurrency: 25 });
  assert.equal('client' in s.rows[0], false);
  const r = app.calcWired(clone(DEFAULTS.wired));
  assert.equal(r.peak, 145);
  assert.equal(r.effective, 36.25);
  assert.equal(r.uplink.gbps, 1);
  assert.equal(app.formatPercent(r.uplink.utilization), '3.6%');
  assert.equal(r.switchSize.size, 24);
});
