'use strict';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

// Each type carries a typical client capability for the WLAN tab: its Wi-Fi
// standard and spatial streams (the wired tab ignores both).
const CLIENT_TYPES = [
  { id: 'office-light', label: 'Office – light (web, email, SaaS)', mbps: 2, client: 'wifi6', streams: 2 },
  { id: 'office-heavy', label: 'Office – heavy (cloud workloads, downloads)', mbps: 10, client: 'wifi6', streams: 2 },
  { id: 'video-conf', label: 'Video conference (Teams/Zoom, HD)', mbps: 4, client: 'wifi6', streams: 2 },
  { id: 'stream-hd', label: 'Video streaming (HD)', mbps: 8, client: 'wifi6', streams: 2 },
  { id: 'stream-4k', label: 'Video streaming (4K)', mbps: 25, client: 'wifi6', streams: 2 },
  { id: 'voip', label: 'VoIP telephony', mbps: 0.1, client: 'wifi5', streams: 1 },
  { id: 'file-transfer', label: 'File transfer / CAD / backup', mbps: 50, client: 'wifi6', streams: 2 },
  { id: 'iot', label: 'Printers / scanners / IoT', mbps: 0.5, client: 'wifi4', streams: 1 },
  { id: 'pos', label: 'Point of sale / POS', mbps: 1, client: 'wifi5', streams: 2 },
  { id: 'custom', label: 'Custom client type', mbps: 10, client: 'wifi6', streams: 2 },
];
const TYPE_BY_ID = Object.fromEntries(CLIENT_TYPES.map((t) => [t.id, t]));

const UPLINK_CLASSES_GBPS = [1, 10, 25, 40, 100];
const COMPARISON_CLASSES_GBPS = [1, 10, 25];
// Ethernet speeds of a switch port that an AP plugs into, with the copper
// cabling that carries each over 100 m.
const AP_PORT_CLASSES = [
  { gbps: 1, cabling: 'Cat5e or better' },
  { gbps: 2.5, cabling: 'Cat5e or better' },
  { gbps: 5, cabling: 'Cat6 or better' },
  { gbps: 10, cabling: 'Cat6a (Cat6 up to 55 m)' },
];
const SWITCH_SIZES = [8, 12, 24, 28, 48, 52];

// Wi-Fi generations as PHY families: data subcarriers per channel width, OFDM
// symbol duration in µs including a 0.8 µs guard interval, and the top MCS.
const PHY = {
  4: { name: '802.11n', nsd: { 20: 52, 40: 108 }, symbolUs: 4, maxMcs: 7 },
  5: { name: '802.11ac', nsd: { 20: 52, 40: 108, 80: 234, 160: 468 }, symbolUs: 4, maxMcs: 9 },
  6: { name: '802.11ax', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960 }, symbolUs: 13.6, maxMcs: 11 },
  7: { name: '802.11be', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }, symbolUs: 13.6, maxMcs: 13 },
};

// Modulation and coding per MCS index, with the SNR (dB) a typical receiver
// needs for it. Planning values: vendor sensitivity tables differ by a few dB.
const MCS_TABLE = [
  { mcs: 0, modulation: 'BPSK', bits: 1, coding: [1, 2], snr: 5 },
  { mcs: 1, modulation: 'QPSK', bits: 2, coding: [1, 2], snr: 8 },
  { mcs: 2, modulation: 'QPSK', bits: 2, coding: [3, 4], snr: 11 },
  { mcs: 3, modulation: '16-QAM', bits: 4, coding: [1, 2], snr: 14 },
  { mcs: 4, modulation: '16-QAM', bits: 4, coding: [3, 4], snr: 17 },
  { mcs: 5, modulation: '64-QAM', bits: 6, coding: [2, 3], snr: 20 },
  { mcs: 6, modulation: '64-QAM', bits: 6, coding: [3, 4], snr: 22 },
  { mcs: 7, modulation: '64-QAM', bits: 6, coding: [5, 6], snr: 25 },
  { mcs: 8, modulation: '256-QAM', bits: 8, coding: [3, 4], snr: 28 },
  { mcs: 9, modulation: '256-QAM', bits: 8, coding: [5, 6], snr: 30 },
  { mcs: 10, modulation: '1024-QAM', bits: 10, coding: [3, 4], snr: 33 },
  { mcs: 11, modulation: '1024-QAM', bits: 10, coding: [5, 6], snr: 35 },
  { mcs: 12, modulation: '4096-QAM', bits: 12, coding: [3, 4], snr: 38 },
  { mcs: 13, modulation: '4096-QAM', bits: 12, coding: [5, 6], snr: 40 },
];

// Share of the PHY rate a radio really carries for its clients after
// contention, protocol overhead, retries and management traffic.
const MAC_EFFICIENCY = 0.6;

// Per band: the default design SNR and the noise floor of a 20 MHz channel,
// which rises 3 dB with every doubling of the width. 2.4 GHz plans with a
// lower SNR because interference (neighbours, Bluetooth, microwaves) and
// legacy clients cost it more than the noise floor alone shows.
const BANDS = {
  '2.4': { defaultSnr: 15, noiseFloor20: -90 },
  5: { defaultSnr: 25, noiseFloor20: -95 },
  6: { defaultSnr: 25, noiseFloor20: -95 },
};

const AP_PROFILES = {
  '2g': { label: '2.4 GHz (Wi-Fi 4/6)', short: '2.4 GHz', band: '2.4', gen: 6, widths: [20, 40] },
  '5g-ac': { label: '5 GHz – Wi-Fi 5 (802.11ac)', short: '5 GHz (Wi-Fi 5)', band: '5', gen: 5, widths: [20, 40, 80] },
  '5g-ax': { label: '5 GHz – Wi-Fi 6 (802.11ax)', short: '5 GHz (Wi-Fi 6)', band: '5', gen: 6, widths: [20, 40, 80, 160] },
  '6g-6e': { label: '6 GHz – Wi-Fi 6E', short: '6 GHz (Wi-Fi 6E)', band: '6', gen: 6, widths: [20, 40, 80, 160] },
  '6g-be': { label: '6 GHz – Wi-Fi 7 (802.11be)', short: '6 GHz (Wi-Fi 7)', band: '6', gen: 7, widths: [20, 40, 80, 160, 320] },
};

const CLIENT_STANDARDS = {
  wifi4: { label: 'Wi-Fi 4', gen: 4, bands: ['2.4', '5'] },
  wifi5: { label: 'Wi-Fi 5', gen: 5, bands: ['2.4', '5'] },
  wifi6: { label: 'Wi-Fi 6', gen: 6, bands: ['2.4', '5'] },
  wifi6e: { label: 'Wi-Fi 6E', gen: 6, bands: ['2.4', '5', '6'] },
  wifi7: { label: 'Wi-Fi 7', gen: 7, bands: ['2.4', '5', '6'] },
};
const CLIENT_STREAM_OPTIONS = [1, 2, 4];

// Spatial streams of the AP radio. The signal input describes a 2×2 radio.
// A 4×4 radio serving clients with fewer streams gains about 3 dB link margin
// (receive combining uplink, beamforming downlink); it adds no streams for
// those clients, and MU-MIMO is not counted.
const STREAM_OPTIONS = [2, 4];
const FOUR_BY_FOUR_GAIN_DB = 3;

const SIGNAL_LIMITS = { snr: [0, 60], rssi: [-100, -20], noise: [-110, -60] };

// Capacity matrix of earlier versions. Saved radios carried its value in their
// capacity field; it is only used to tell those apart from real overrides.
const LEGACY_CAPACITY = {
  '2g': { 20: 50, 40: 100 },
  '5g-ac': { 20: 80, 40: 170, 80: 350 },
  '5g-ax': { 20: 110, 40: 220, 80: 450, 160: 900 },
  '6g-6e': { 20: 110, 40: 220, 80: 450, 160: 900 },
  '6g-be': { 20: 120, 40: 240, 80: 500, 160: 1000, 320: 1900 },
};

const OK_LIMIT = 0.6;
const BORDERLINE_LIMIT = 0.85;
const MAX_RADIOS = 4;

// One radio of an AP; an AP is described by a list of these. Capacity null
// means "derive it from the signal", a number overrides it.
const DEFAULT_RADIO = {
  id: 'r1', profile: '5g-ax', width: 80, streams: 2, capacity: null, signalMode: 'snr', signal: 25, noise: null,
};

const DEFAULTS = {
  wired: {
    rows: [
      { type: 'office-light', count: 10, mbps: 2 },
      { type: 'stream-4k', count: 5, mbps: 25 },
    ],
    concurrency: 25,
  },
  wlan: {
    rows: [
      { type: 'office-light', count: 20, mbps: 2, radio: 'r1', client: 'wifi6', clientStreams: 2 },
      { type: 'stream-4k', count: 5, mbps: 25, radio: 'r1', client: 'wifi6', clientStreams: 2 },
    ],
    radios: [DEFAULT_RADIO],
    concurrency: 25,
  },
};

const STORAGE_KEYS = { wired: 'nbc-wired-v1', wlan: 'nbc-wlan-v1' };

/* ------------------------------------------------------------------ *
 * Pure calculation
 * ------------------------------------------------------------------ */

// Parses user input; anything invalid, empty or negative counts as 0.
function toNumber(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Removes floating-point noise such as 0.30000000000000004.
function clean(n) {
  return Math.round(n * 1e9) / 1e9;
}

// Utilization rounded to 0.1%, the precision shown in the UI. Thresholds and
// the AP count use this value, so the verdict always matches the displayed
// number (60.04% shows as "60.0%" and counts as OK, not borderline).
function roundRatio(ratio) {
  return Math.round(clean(ratio * 1000)) / 1000;
}

function utilizationOf(load, capacity) {
  return roundRatio(load / capacity);
}

function summarizeMix(rows) {
  let demand = 0;
  let clients = 0;
  let maxPerClient = 0;
  const lines = [];
  for (const row of rows) {
    const count = Math.floor(toNumber(row.count));
    const mbps = toNumber(row.mbps);
    if (count === 0) continue;
    const subtotal = clean(count * mbps);
    demand += subtotal;
    clients += count;
    maxPerClient = Math.max(maxPerClient, mbps);
    lines.push({ type: row.type, count, mbps, subtotal });
  }
  return { demand: clean(demand), clients, maxPerClient, lines };
}

function utilizationZone(ratio) {
  if (ratio <= OK_LIMIT) return 'ok';
  if (ratio <= BORDERLINE_LIMIT) return 'warn';
  return 'crit';
}

const VERDICT_RANK = { ok: 0, warn: 1, crit: 2 };

function accessPortClass(maxPerClient) {
  if (maxPerClient > 9500) return { gbps: 10, special: true };
  if (maxPerClient > 4500) return { gbps: 10, special: false };
  if (maxPerClient > 2200) return { gbps: 5, special: false };
  if (maxPerClient > 900) return { gbps: 2.5, special: false };
  return { gbps: 1, special: false };
}

function recommendUplink(effectiveMbps) {
  const gbps = UPLINK_CLASSES_GBPS.find((g) => g * 1000 >= effectiveMbps);
  if (gbps === undefined) return { gbps: null, utilization: null, lowReserve: false };
  const utilization = utilizationOf(effectiveMbps, gbps * 1000);
  return { gbps, utilization, lowReserve: utilization > BORDERLINE_LIMIT };
}

// Two AP port speeds. The minimum is the smallest that carries the typical
// load at no more than 85% utilization. The recommendation also leaves room
// for peaks: it is at least the smallest speed that carries `ceiling`, what
// the radios could deliver at most, so a fast client is not capped by the port.
function recommendApPort(loadMbps, ceilingMbps) {
  const byLoad = AP_PORT_CLASSES.find((c) => utilizationOf(loadMbps, c.gbps * 1000) <= BORDERLINE_LIMIT);
  if (!byLoad) return { gbps: null, utilization: null, cabling: null, minimum: null, capped: false };
  const byPeak = AP_PORT_CLASSES.find((c) => c.gbps * 1000 >= ceilingMbps) || AP_PORT_CLASSES[AP_PORT_CLASSES.length - 1];
  const pick = byPeak.gbps > byLoad.gbps ? byPeak : byLoad;
  const describe = (c) => ({ gbps: c.gbps, utilization: utilizationOf(loadMbps, c.gbps * 1000), cabling: c.cabling });
  return { ...describe(pick), minimum: describe(byLoad), capped: ceilingMbps > pick.gbps * 1000 };
}

// Smallest common switch with 20% port reserve (integer math: size ≥ ports × 1.2).
function recommendSwitch(ports) {
  const size = SWITCH_SIZES.find((s) => s * 10 >= ports * 12);
  if (size !== undefined) return { size, count: 1 };
  return { size: 48, count: Math.ceil((ports * 12) / 480) };
}

function clampConcurrency(value) {
  const n = Math.round(toNumber(value) / 5) * 5;
  return Math.min(100, Math.max(10, n || 25));
}

function calcWired({ rows, concurrency }) {
  const mix = summarizeMix(rows);
  const effective = clean((mix.demand * clampConcurrency(concurrency)) / 100);
  return {
    ...mix,
    peak: mix.demand,
    effective,
    uplink: recommendUplink(effective),
    accessPort: accessPortClass(mix.maxPerClient),
    switchSize: recommendSwitch(mix.clients),
    comparison: COMPARISON_CLASSES_GBPS.map((gbps) => ({
      gbps,
      utilization: utilizationOf(effective, gbps * 1000),
    })),
  };
}

function profileOf(id) {
  return AP_PROFILES[id] || AP_PROFILES[DEFAULT_RADIO.profile];
}

function channelWidths(profile) {
  return profileOf(profile).widths.slice();
}

// Noise floor of a channel: +3 dB per doubling of the width (twice the noise
// bandwidth), e.g. −95 dBm at 20 MHz → −89 dBm at 80 MHz on 5/6 GHz.
function noiseFloorFor(profile, width) {
  return BANDS[profileOf(profile).band].noiseFloor20 + 3 * Math.log2(width / 20);
}

function defaultSnr(profile) {
  return BANDS[profileOf(profile).band].defaultSnr;
}

// Default value of the signal field in the given mode for a fresh radio.
function defaultSignal(profile, width, mode) {
  const snr = defaultSnr(profile);
  return mode === 'rssi' ? snr + noiseFloorFor(profile, width) : snr;
}

function inRange(value, [min, max]) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

// The SNR the radio plans with, either entered directly or as RSSI − noise
// floor. Invalid inputs fall back to the band default and are flagged.
function resolveSignal(radio) {
  const mode = radio.signalMode === 'rssi' ? 'rssi' : 'snr';
  const autoNoise = noiseFloorFor(radio.profile, radio.width);
  const noiseSet = radio.noise !== null && radio.noise !== undefined;
  const noiseError = mode === 'rssi' && noiseSet && !inRange(radio.noise, SIGNAL_LIMITS.noise);
  const noise = noiseSet && !noiseError ? radio.noise : autoNoise;
  const signalError = !inRange(radio.signal, SIGNAL_LIMITS[mode]);
  const fallback = defaultSnr(radio.profile);
  let snr = fallback;
  if (!signalError) snr = mode === 'rssi' ? clean(radio.signal - noise) : radio.signal;
  return {
    mode,
    snr,
    rssi: mode === 'rssi' && !signalError ? radio.signal : null,
    noise,
    autoNoise,
    noiseAuto: !noiseSet || noiseError,
    signalError,
    noiseError,
    fallbackSnr: fallback,
  };
}

// Value of the signal field after switching to `mode`, so that the planned
// SNR stays the same: RSSI = SNR + noise floor.
function convertSignal(radio, mode) {
  const { snr, noise } = resolveSignal(radio);
  const value = mode === 'rssi' ? snr + noise : snr;
  return Math.round(value * 10) / 10;
}

// A wider channel collects more noise (+3 dB per doubling), so the same
// received signal gives a lower SNR. In RSSI mode that follows from the noise
// floor; in SNR mode the entered value is moved along with the width. An
// invalid or empty value is left alone.
function signalAfterWidthChange(radio, newWidth) {
  if (radio.signalMode === 'rssi' || !inRange(radio.signal, SIGNAL_LIMITS.snr)) return radio.signal;
  const shifted = radio.signal - 3 * Math.log2(newWidth / radio.width);
  const [min, max] = SIGNAL_LIMITS.snr;
  return Math.min(max, Math.max(min, Math.round(shifted * 10) / 10));
}

// PHY data rate in Mbit/s, or null where the standard defines no such MCS.
// 802.11ac requires a whole number of data bits per OFDM symbol, which rules
// out MCS 9 at 20 MHz with 1, 2 or 4 streams; 802.11ax/be have no such gaps.
function phyRate(gen, width, mcs, streams) {
  const phy = PHY[gen];
  const entry = MCS_TABLE[mcs];
  if (!phy || !phy.nsd[width] || !entry || mcs > phy.maxMcs) return null;
  const [num, den] = entry.coding;
  const bitsTimesDen = phy.nsd[width] * entry.bits * num * streams;
  if (gen === 5 && bitsTimesDen % den !== 0) return null;
  return clean(bitsTimesDen / den / phy.symbolUs);
}

// A 2×2 client of the radio's own standard: the reference for idle radios and
// for the link readout of the radio list.
function referenceClient(profile) {
  const { gen, band } = profileOf(profile);
  if (gen >= 7) return 'wifi7';
  if (gen === 6) return band === '6' ? 'wifi6e' : 'wifi6';
  return gen === 5 ? 'wifi5' : 'wifi4';
}

// The link between one radio and one kind of client: the common standard,
// width and streams of both sides and the highest MCS the SNR supports.
// Returns null when the client cannot use the band at all.
function linkFor(radio, snr, client, clientStreams) {
  const profile = profileOf(radio.profile);
  const standard = CLIENT_STANDARDS[client] || CLIENT_STANDARDS.wifi6;
  if (!standard.bands.includes(profile.band)) return null;
  let gen = Math.min(profile.gen, standard.gen);
  if (gen === 5 && profile.band === '2.4') gen = 4; // 802.11ac exists on 5 GHz only
  const phy = PHY[gen];
  const width = Math.max(...Object.keys(phy.nsd).map(Number).filter((w) => w <= radio.width));
  const apStreams = radio.streams === 4 ? 4 : 2;
  const wanted = CLIENT_STREAM_OPTIONS.includes(clientStreams) ? clientStreams : 2;
  const streams = Math.min(apStreams, wanted);
  const gain = apStreams === 4 && wanted < 4 ? FOUR_BY_FOUR_GAIN_DB : 0;
  const linkSnr = clean(snr + gain);
  let mcs = 0;
  for (let m = phy.maxMcs; m > 0; m -= 1) {
    if (MCS_TABLE[m].snr <= linkSnr && phyRate(gen, width, m, streams) !== null) {
      mcs = m;
      break;
    }
  }
  const phyMbps = phyRate(gen, width, mcs, streams);
  return {
    gen,
    width,
    streams,
    gain,
    snr: linkSnr,
    mcs,
    belowFloor: linkSnr < MCS_TABLE[0].snr,
    phyRate: phyMbps,
    rate: Math.round(phyMbps * MAC_EFFICIENCY * 10) / 10,
  };
}

function streamsLabel(streams) {
  return `${streams}×${streams}`;
}

// Compact label for results, e.g. "5 GHz (Wi-Fi 6) @ 80 MHz, 2×2".
function radioLabel(radio) {
  return `${profileOf(radio.profile).short} @ ${radio.width} MHz, ${streamsLabel(radio.streams || 2)}`;
}

// Capacity of a mix with different link rates: what the radio carries when
// every client gets its share of demand (demand-weighted harmonic mean).
function blendedRate(links, rateOf) {
  const weighted = (weightOf) => {
    let weight = 0;
    let airtime = 0;
    for (const link of links) {
      weight += weightOf(link);
      airtime += weightOf(link) / rateOf(link);
    }
    return weight > 0 ? weight / airtime : null;
  };
  const rate = weighted((l) => l.demand) ?? weighted((l) => l.count);
  return rate === null ? null : Math.round(rate * 10) / 10;
}

// One radio: the link of every client row on it, the airtime they need and
// the APs this radio alone requires. Utilization is the sum of the airtime
// shares, so slow clients weigh more than their data rate suggests.
function calcRadio(rows, radio, concurrency) {
  const signal = resolveSignal(radio);
  const capacitySet = radio.capacity !== null && radio.capacity !== undefined;
  const manual = capacitySet ? toNumber(radio.capacity) : 0;
  const reference = linkFor(radio, signal.snr, referenceClient(radio.profile), 2);
  const links = [];
  const unreachable = [];
  rows.forEach((row, index) => {
    if (row.radio !== radio.id) return;
    const count = Math.floor(toNumber(row.count));
    if (count === 0) return;
    const entry = { index, radio: radio.id, type: row.type, count, client: row.client, clientStreams: row.clientStreams };
    const link = linkFor(radio, signal.snr, row.client, row.clientStreams);
    if (!link) {
      unreachable.push(entry);
      return;
    }
    const demand = clean(count * toNumber(row.mbps));
    const effective = clean((demand * concurrency) / 100);
    const rate = manual > 0 ? manual : link.rate;
    links.push({ ...entry, row, link, demand, effective, rate, airtime: effective / rate });
  });

  const mix = summarizeMix(links.map((l) => l.row));
  const autoCapacity = blendedRate(links, (l) => l.link.rate) ?? reference.rate;
  const capacity = manual > 0 ? manual : autoCapacity;
  const airtime = links.reduce((sum, l) => sum + l.airtime, 0);
  const utilization = roundRatio(airtime);
  return {
    id: radio.id,
    profile: radio.profile,
    width: radio.width,
    streams: radio.streams,
    label: radioLabel(radio),
    ...mix,
    peak: mix.demand,
    effective: clean((mix.demand * concurrency) / 100),
    signal,
    reference,
    links: links.map(({ row, ...rest }) => rest),
    unreachable,
    belowFloor: reference.belowFloor || links.some((l) => l.link.belowFloor),
    autoCapacity,
    capacity,
    capacityManual: manual > 0,
    capacityInvalid: capacitySet && manual === 0,
    utilization,
    verdict: utilizationZone(utilization),
    aps: mix.clients > 0 ? Math.max(1, Math.ceil(clean(utilization / OK_LIMIT))) : 0,
    perClient: mix.clients > 0 ? clean(capacity / mix.clients) : null,
  };
}

// The AP is the unit: one device carries all of its radios, so the number of
// APs is set by the radio with the highest requirement, never by their sum.
function calcWlan({ rows, radios, concurrency }) {
  const conc = clampConcurrency(concurrency);
  const list = Array.isArray(radios) && radios.length ? radios : [DEFAULT_RADIO];
  const perRadio = list.map((radio) => calcRadio(rows, radio, conc));
  const active = perRadio.filter((r) => r.clients > 0);
  const limiting = active.reduce((worst, r) => (!worst || r.utilization > worst.utilization ? r : worst), null);
  const verdict = active.reduce(
    (worst, r) => (VERDICT_RANK[r.verdict] > VERDICT_RANK[worst] ? r.verdict : worst),
    'ok',
  );
  const byIndex = (a, b) => a.index - b.index;
  const mix = summarizeMix(rows);
  const aps = Math.max(1, ...perRadio.map((r) => r.aps));
  // Each AP gets its own port. A radio never puts more on the wire than its
  // capacity, so an overloaded radio is capped there.
  const portLoad = clean(active.reduce((sum, r) => sum + Math.min(r.effective, r.capacity), 0) / aps);
  const portCeiling = clean(active.reduce((sum, r) => sum + r.capacity, 0));
  return {
    ...mix,
    peak: mix.demand,
    effective: clean((mix.demand * conc) / 100),
    radios: perRadio,
    links: perRadio.flatMap((r) => r.links).sort(byIndex),
    unreachable: perRadio.flatMap((r) => r.unreachable).sort(byIndex),
    limiting: limiting ? limiting.id : null,
    utilization: limiting ? limiting.utilization : 0,
    verdict,
    aps,
    port: active.length ? { load: portLoad, ceiling: portCeiling, ...recommendApPort(portLoad, portCeiling) } : null,
    capacity: (limiting || perRadio[0]).capacity,
    perClient: limiting ? limiting.perClient : null,
  };
}

/* ------------------------------------------------------------------ *
 * Formatting (en-US)
 * ------------------------------------------------------------------ */

const NBSP = '\u00a0';
const numberFormats = new Map();

function formatNumber(value, maxDigits = 2, minDigits = 0, grouping = true) {
  const key = `${maxDigits}|${minDigits}|${grouping}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
      useGrouping: grouping,
    }));
  }
  return numberFormats.get(key).format(value);
}

// Returns number and unit separately so the UI can set them in different sizes.
function formatRate(mbps) {
  const rounded = Math.round(mbps * 100) / 100;
  if (rounded >= 1000) return { num: formatNumber(rounded / 1000), unit: 'Gbit/s' };
  return { num: formatNumber(rounded), unit: 'Mbit/s' };
}

function formatRateText(mbps) {
  const { num, unit } = formatRate(mbps);
  return `${num}${NBSP}${unit}`;
}

// One decimal below 100%; whole numbers above, e.g. "36.7%" and "1500%".
function formatPercent(ratio) {
  const pct = ratio * 100;
  const num = pct < 100 ? formatNumber(pct, 1, 1) : formatNumber(pct, 0, 0, false);
  return `${num}%`;
}

// Decibel values with a real minus sign, e.g. "−89 dBm".
function formatDb(value, unit) {
  return `${formatNumber(value, 1).replace('-', '−')}${NBSP}${unit}`;
}

function mcsText(mcs) {
  const { modulation, coding } = MCS_TABLE[mcs];
  return `${modulation} ${coding[0]}/${coding[1]}`;
}

function clientLabel(client, streams) {
  return `${(CLIENT_STANDARDS[client] || CLIENT_STANDARDS.wifi6).label}, ${streamsLabel(streams)}`;
}

// Which clients a band takes, for the "cannot connect" hint.
function bandNeeds(profile) {
  const band = profileOf(profile).band;
  const names = Object.values(CLIENT_STANDARDS).filter((s) => s.bands.includes(band)).map((s) => s.label);
  return `${band} GHz needs ${names.join(' or ')}`;
}

function accessPortText(accessPort) {
  if (accessPort.special) return { num: '10', unit: 'Gbit/s+ (special case)' };
  return formatRate(accessPort.gbps * 1000);
}

function switchText({ size, count }) {
  const prefix = count > 1 ? `${count}${NBSP}×${NBSP}` : '';
  return `e.g. ${prefix}${size}-port switch (with 20% reserve)`;
}

const EMPTY_TEXT = 'No clients configured. Add a client type or enter a count above 0.';

const VERDICT_TEXT = {
  ok: 'OK – headroom available',
  warn: 'Borderline – tight during load peaks',
  crit: 'Overloaded – add APs, widen the channel or change the profile',
};

const VERDICT_SHORT = { ok: 'OK', warn: 'Borderline', crit: 'Overloaded' };

/* ------------------------------------------------------------------ *
 * State & persistence
 * ------------------------------------------------------------------ */

function cloneDefaults(tab) {
  return JSON.parse(JSON.stringify(DEFAULTS[tab]));
}

function sanitizeRows(rows, tab) {
  if (!Array.isArray(rows)) return null;
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const type = TYPE_BY_ID[row.type] ? row.type : 'custom';
      const out = {
        type,
        count: Math.floor(toNumber(row.count)),
        mbps: toNumber(row.mbps),
        radio: typeof row.radio === 'string' && row.radio ? row.radio : undefined,
      };
      if (tab !== 'wlan') return out;
      // Rows saved before the client capability take the preset of their type.
      const preset = TYPE_BY_ID[type];
      out.client = CLIENT_STANDARDS[row.client] ? row.client : preset.client;
      out.clientStreams = CLIENT_STREAM_OPTIONS.includes(row.clientStreams) ? row.clientStreams : preset.streams;
      return out;
    });
}

// Capacity a radio of an earlier version stored when the user had not
// overridden it (the matrix value, +15% for 4×4).
function legacyCapacity(profile, width, streams) {
  const base = (LEGACY_CAPACITY[profile] || {})[width];
  if (base === undefined) return undefined;
  return streams === 4 ? Math.round((base * 115) / 1000) * 10 : base;
}

function sanitizeRadio(entry, index) {
  const id = typeof entry.id === 'string' && entry.id ? entry.id : `r${index + 1}`;
  // Corrupt profile: the stored width and capacity cannot be trusted either,
  // so restore the whole radio configuration to the documented defaults.
  if (!AP_PROFILES[entry.profile]) {
    return { ...DEFAULT_RADIO, id };
  }
  const profile = entry.profile;
  const widths = channelWidths(profile);
  const widthValid = widths.includes(Number(entry.width));
  // Invalid width falls back to the widest channel, mirroring the profile
  // switch in the UI.
  const width = widthValid ? Number(entry.width) : Math.max(...widths);
  // States from before the stream choice have no streams field: they were 2×2.
  const streamsValid = STREAM_OPTIONS.includes(Number(entry.streams));
  const streams = streamsValid ? Number(entry.streams) : 2;

  let capacity = null;
  if ('signalMode' in entry) {
    if (Number.isFinite(entry.capacity)) capacity = entry.capacity;
  } else if (widthValid && (streamsValid || entry.streams === undefined) && Number.isFinite(entry.capacity)
    && entry.capacity !== legacyCapacity(profile, width, streams)) {
    // Older versions always stored a capacity; only a real override survives.
    capacity = entry.capacity;
  }

  const signalMode = entry.signalMode === 'rssi' ? 'rssi' : 'snr';
  const signal = inRange(entry.signal, SIGNAL_LIMITS[signalMode])
    ? entry.signal
    : defaultSignal(profile, width, signalMode);
  const noise = Number.isFinite(entry.noise) ? entry.noise : null;
  return { id, profile, width, streams, capacity, signalMode, signal, noise };
}

// Older states stored one radio at the top level ({profile, width, capacity});
// those migrate to a single-radio AP.
function sanitizeRadios(data) {
  const entries = Array.isArray(data.radios) && data.radios.length
    ? data.radios.filter((x) => x && typeof x === 'object')
    : [{ id: 'r1', profile: data.profile, width: data.width, capacity: data.capacity }];
  const radios = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    const radio = sanitizeRadio(entry, index);
    if (seen.has(radio.id)) return; // malformed storage: drop duplicate ids
    seen.add(radio.id);
    radios.push(radio);
  });
  return radios.length ? radios : null;
}

function sanitizeState(tab, data) {
  if (!data || typeof data !== 'object') return null;
  const rows = sanitizeRows(data.rows, tab);
  if (!rows) return null;
  if (tab === 'wired') return { rows, concurrency: clampConcurrency(data.concurrency) };

  const radios = sanitizeRadios(data);
  if (!radios) return null;
  // Clients whose radio no longer exists move to the first radio.
  const ids = new Set(radios.map((radio) => radio.id));
  for (const row of rows) if (!ids.has(row.radio)) row.radio = radios[0].id;
  return { rows, radios, concurrency: clampConcurrency(data.concurrency) };
}

function loadState(tab) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[tab]);
    return (raw && sanitizeState(tab, JSON.parse(raw))) || cloneDefaults(tab);
  } catch (error) {
    return cloneDefaults(tab);
  }
}

function saveState(tab, data) {
  try {
    localStorage.setItem(STORAGE_KEYS[tab], JSON.stringify(data));
  } catch (error) {
    // Storage unavailable (private mode, file:// restrictions): keep working without it.
  }
}

function clearState(tab) {
  try {
    localStorage.removeItem(STORAGE_KEYS[tab]);
  } catch (error) {
    // See saveState.
  }
}

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const state = {};

function setReading(el, reading) {
  el.replaceChildren();
  el.classList.toggle('is-empty', !reading);
  if (!reading) {
    el.textContent = '—';
    return;
  }
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = reading.num;
  el.append(num);
  if (reading.unit) {
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = reading.unit;
    // Percent signs sit tight against the number, rates keep a space.
    el.append(reading.tight ? '' : ' ', unit);
  }
}

function setScale(el, ratio) {
  const fill = el.querySelector('.scale-fill');
  const hasValue = ratio !== null && Number.isFinite(ratio);
  fill.style.width = hasValue ? `${Math.min(ratio, 1) * 100}%` : '0%';
  el.dataset.zone = hasValue ? utilizationZone(ratio) : '';
  el.classList.toggle('is-over', hasValue && ratio > 1);
}

function setBadge(el, text, zone) {
  el.hidden = !text;
  el.textContent = text || '';
  el.dataset.zone = zone || '';
}

function setNote(el, text, tone) {
  el.hidden = !text;
  el.textContent = text || '';
  el.dataset.tone = tone || '';
}

function renderBreakdown(tab, result) {
  const body = $(`${tab}-breakdown`);
  const foot = $(`${tab}-breakdown-total`);
  body.replaceChildren();
  foot.replaceChildren();

  if (result.lines.length === 0) {
    const tr = body.insertRow();
    const td = tr.insertCell();
    td.colSpan = 4;
    td.className = 'breakdown-empty';
    td.textContent = EMPTY_TEXT;
    return;
  }

  for (const line of result.lines) {
    const tr = body.insertRow();
    tr.insertCell().textContent = TYPE_BY_ID[line.type].label;
    tr.insertCell().textContent = formatNumber(line.count, 0);
    tr.insertCell().textContent = formatNumber(line.mbps);
    tr.insertCell().textContent = formatRateText(line.subtotal);
  }
  const tr = foot.insertRow();
  const th = document.createElement('th');
  th.scope = 'row';
  th.textContent = 'Total';
  tr.append(th);
  tr.insertCell().textContent = formatNumber(result.clients, 0);
  tr.insertCell();
  tr.insertCell().textContent = formatRateText(result.demand);
}

function renderWired() {
  const data = state.wired;
  const r = calcWired(data);
  const empty = r.clients === 0;
  const concurrencyText = `${data.concurrency}%`;

  $('wired-concurrency-value').textContent = concurrencyText;
  $('wired-effective-label').textContent = `Effective uplink load (at ${data.concurrency}% concurrency)`;

  const uplink = r.uplink;
  const hasUplink = !empty && uplink.gbps !== null;
  setReading($('wired-uplink'), hasUplink ? formatRate(uplink.gbps * 1000) : null);
  setBadge(
    $('wired-uplink-badge'),
    hasUplink ? `Utilization ${formatPercent(uplink.utilization)}` : '',
    hasUplink ? utilizationZone(uplink.utilization) : '',
  );
  setScale($('wired-uplink-scale'), hasUplink ? uplink.utilization : (empty ? null : 2));

  const note = $('wired-uplink-note');
  if (empty) setNote(note, EMPTY_TEXT, 'neutral');
  else if (uplink.gbps === null) setNote(note, 'Demand exceeds 100 Gbit/s – split the network into segments.', 'crit');
  else if (uplink.lowReserve) setNote(note, 'Low headroom – consider the next uplink class.', 'warn');
  else setNote(note, '');

  setReading($('wired-peak'), empty ? null : formatRate(r.peak));
  setReading($('wired-effective'), empty ? null : formatRate(r.effective));

  setReading($('wired-access'), empty ? null : accessPortText(r.accessPort));
  $('wired-access-note').textContent = empty ? '' : r.accessPort.gbps === 1
    ? '1 Gbit/s is enough for standard clients'
    : `Highest single-client demand: ${formatRateText(r.maxPerClient)}`;

  setReading($('wired-ports'), empty ? null : { num: formatNumber(r.clients, 0) });
  $('wired-switch').textContent = empty ? '' : switchText(r.switchSize);

  $('wired-compare').querySelectorAll('.compare-row').forEach((row, i) => {
    const { utilization } = r.comparison[i];
    setScale(row.querySelector('.scale'), empty ? null : utilization);
    row.querySelector('.compare-value').textContent = empty ? '—' : formatPercent(utilization);
    row.classList.toggle('is-recommended', hasUplink && uplink.gbps === r.comparison[i].gbps);
  });

  renderBreakdown('wired', r);
}

function renderWlan() {
  const data = state.wlan;
  const r = calcWlan(data);
  const empty = r.clients === 0;
  const single = r.radios.length === 1;
  const limiting = r.radios.find((x) => x.id === r.limiting) || r.radios[0];

  $('wlan-concurrency-value').textContent = `${data.concurrency}%`;
  $('wlan-effective-label').textContent = `Effective demand (at ${data.concurrency}% concurrency)`;

  setReading($('wlan-utilization'), empty ? null : { num: formatPercent(r.utilization).slice(0, -1), unit: '%', tight: true });
  setBadge($('wlan-verdict'), empty ? '' : VERDICT_TEXT[r.verdict], empty ? '' : r.verdict);
  setScale($('wlan-scale'), empty ? null : r.utilization);
  setNote($('wlan-note'), empty ? EMPTY_TEXT : (single ? '' : `Limiting radio: ${limiting.label}`), 'neutral');
  renderLinkNote(r);

  setReading($('wlan-aps'), empty ? null : { num: formatNumber(r.aps, 0) });
  $('wlan-aps-note').textContent = single
    ? 'Recommended APs for this mix (max. 60% utilization per AP)'
    : 'Highest requirement of a single radio (max. 60% utilization per AP)';

  $('wlan-capacity-label').textContent = single ? 'AP capacity (usable throughput)' : 'Capacity, limiting radio';
  $('wlan-per-client-label').textContent = single ? 'Avg. bandwidth per client' : 'Avg. per client, limiting radio';
  setReading($('wlan-peak'), empty ? null : formatRate(r.peak));
  setReading($('wlan-effective'), empty ? null : formatRate(r.effective));
  setReading($('wlan-capacity-out'), empty ? null : formatRate(r.capacity));
  setReading($('wlan-per-client'), empty ? null : formatRate(r.perClient));

  renderApPort(r);

  $('wlan-streams-note').hidden = !r.radios.some((x) => x.streams === 4);

  renderRadioTable(r);
  renderAirtimeTable(r);
  renderRadioStatus(r);
  renderClientStatus(r);
  renderBreakdown('wlan', r);
}

function renderApPort(result) {
  const port = result.port;
  const hasPort = !!port && port.gbps !== null;

  setReading($('wlan-port'), hasPort ? formatRate(port.gbps * 1000) : null);
  setBadge(
    $('wlan-port-badge'),
    hasPort ? `Utilization ${formatPercent(port.utilization)}` : '',
    hasPort ? utilizationZone(port.utilization) : '',
  );

  const count = result.aps > 1 ? `One port per AP, ${formatNumber(result.aps, 0)} in total. ` : '';
  $('wlan-port-note').textContent = port ? `${count}Effective load per AP: ${formatRateText(port.load)}` : '';
  $('wlan-port-minimum').textContent = hasPort
    ? `Minimum for the typical load: ${formatRateText(port.minimum.gbps * 1000)} (${formatPercent(port.minimum.utilization)} utilization)`
    : '';
  $('wlan-port-cabling').textContent = hasPort ? `Cabling for 100 m: ${port.cabling}` : '';

  const hint = $('wlan-port-hint');
  if (!port) setNote(hint, '');
  else if (!hasPort) setNote(hint, 'The load per AP exceeds what a 10 Gbit/s port carries – check the capacity override.', 'crit');
  else if (port.capped) {
    setNote(hint, `The radios can deliver up to ${formatRateText(port.ceiling)} per AP, more than this port carries. `
      + 'The typical load fits, but single peaks are capped at the port speed.', 'warn');
  } else if (port.gbps > port.minimum.gbps) {
    setNote(hint, `The radios can deliver up to ${formatRateText(port.ceiling)} per AP. `
      + `The minimum carries the typical load; ${formatRateText(port.gbps * 1000)} also leaves room for single peaks.`);
  } else {
    setNote(hint, `The radios can deliver up to ${formatRateText(port.ceiling)} per AP, so ${formatRateText(port.gbps * 1000)} `
      + 'also leaves room for single peaks.');
  }

  $('wlan-port-compare').querySelectorAll('.compare-row').forEach((row, i) => {
    const gbps = AP_PORT_CLASSES[i].gbps;
    setScale(row.querySelector('.scale'), port ? utilizationOf(port.load, gbps * 1000) : null);
    row.querySelector('.compare-value').textContent = port ? formatPercent(utilizationOf(port.load, gbps * 1000)) : '—';
    row.classList.toggle('is-recommended', hasPort && port.gbps === gbps);
    row.classList.toggle('is-minimum', hasPort && port.minimum.gbps === gbps && port.gbps !== gbps);
  });
}

// Clients that cannot connect at all come first; a link below MCS 0 second.
function renderLinkNote(result) {
  const note = $('wlan-link-note');
  if (result.unreachable.length) {
    const count = result.unreachable.reduce((sum, x) => sum + x.count, 0);
    const radio = result.radios.find((x) => x.id === result.unreachable[0].radio);
    setNote(note, `${formatNumber(count, 0)} ${count === 1 ? 'client' : 'clients'} cannot connect: ${bandNeeds(radio.profile)}. `
      + 'Assign them to another radio or change their Wi-Fi standard; their demand is not counted.', 'crit');
    return;
  }
  const weak = result.radios.find((x) => x.belowFloor);
  if (weak) {
    setNote(note, `${weak.label}: the SNR is below the ${MCS_TABLE[0].snr} dB that MCS 0 needs. `
      + 'Planned at MCS 0, but expect dropped connections.', 'warn');
    return;
  }
  setNote(note, '');
}

function radioHeader(radio, meta) {
  const th = document.createElement('th');
  th.scope = 'row';
  const short = profileOf(radio.profile).short;
  const parts = short.match(/^(\S+ GHz)(.*)$/);
  const name = document.createElement('span');
  name.className = 'radio-name';
  name.textContent = parts ? parts[1] : short;
  const standard = document.createElement('span');
  standard.className = 'radio-std';
  standard.textContent = parts ? parts[2] : '';
  th.append(name, standard);
  // Each part stays on one line; the parts wrap between each other.
  for (const part of meta) {
    const line = document.createElement('span');
    line.className = 'radio-meta';
    line.textContent = part;
    th.append(' ', line);
  }
  return th;
}

function verdictCell(tr, text, badgeText, zone) {
  const cell = tr.insertCell();
  const stack = document.createElement('span');
  stack.className = 'util-stack';
  if (text) stack.append(text, ' ');
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = badgeText;
  if (zone) badge.dataset.zone = zone;
  stack.append(badge);
  cell.append(stack);
}

function renderRadioTable(result) {
  const body = $('wlan-radio-table');
  body.replaceChildren();
  for (const radio of result.radios) {
    const tr = body.insertRow();
    const snr = radio.capacityManual ? 'manual capacity' : `SNR ${formatDb(radio.signal.snr, 'dB')}`;
    tr.append(radioHeader(radio, [`@ ${radio.width} MHz, ${streamsLabel(radio.streams)},`, snr]));
    tr.insertCell().textContent = formatNumber(radio.effective);
    tr.insertCell().textContent = formatNumber(radio.capacity);
    const active = radio.clients > 0;
    verdictCell(tr, formatPercent(radio.utilization), active ? VERDICT_SHORT[radio.verdict] : 'idle', active ? radio.verdict : '');
    tr.insertCell().textContent = active ? formatNumber(radio.aps, 0) : '—';
  }
}

function renderAirtimeTable(result) {
  const body = $('wlan-airtime');
  body.replaceChildren();
  const entries = [...result.links, ...result.unreachable].sort((a, b) => a.index - b.index);
  if (entries.length === 0) {
    const td = body.insertRow().insertCell();
    td.colSpan = 4;
    td.className = 'breakdown-empty';
    td.textContent = EMPTY_TEXT;
    return;
  }
  const single = result.radios.length === 1;
  for (const entry of entries) {
    const tr = body.insertRow();
    const radio = result.radios.find((x) => x.id === entry.radio);
    const th = document.createElement('th');
    th.scope = 'row';
    const name = document.createElement('span');
    name.className = 'airtime-type';
    name.textContent = TYPE_BY_ID[entry.type].label;
    const meta = document.createElement('span');
    meta.className = 'radio-meta';
    const where = single ? '' : ` on ${profileOf(radio.profile).short}`;
    const link = entry.link;
    meta.textContent = link
      ? `${formatNumber(entry.count, 0)} × ${clientLabel(entry.client, entry.clientStreams)} at ${link.width} MHz${where}`
      : `${formatNumber(entry.count, 0)} × ${clientLabel(entry.client, entry.clientStreams)}${where}`;
    th.append(name, meta);
    tr.append(th);
    if (!link) {
      tr.insertCell().textContent = '—';
      tr.insertCell().textContent = '—';
      verdictCell(tr, '', 'No link', 'crit');
      continue;
    }
    tr.insertCell().textContent = radio.capacityManual ? '—' : String(link.mcs);
    tr.insertCell().textContent = formatNumber(entry.rate);
    tr.insertCell().textContent = formatPercent(roundRatio(entry.airtime));
  }
}

function setInvalid(input, invalid) {
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function setStep(li, step, text, tone) {
  const el = li.querySelector(`[data-step="${step}"]`);
  el.textContent = text;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

// Live readout per radio: SNR → MCS → usable rate for a 2×2 client of the
// radio's own standard, plus the validation state of its fields.
function renderRadioStatus(result) {
  const rows = $('wlan-radios').querySelectorAll('.mix-row');
  const errors = [];
  result.radios.forEach((radio, i) => {
    const li = rows[i];
    if (!li) return;
    const { signal, reference: link } = radio;
    const rssi = signal.mode === 'rssi';
    li.querySelector('.signal-label').textContent = rssi ? 'RSSI (dBm)' : 'SNR (dB)';
    li.querySelector('.cell--noise').hidden = !rssi;
    li.querySelector('[name="noise"]').placeholder = `auto ${formatNumber(signal.autoNoise, 0).replace('-', '−')}`;
    setInvalid(li.querySelector('[name="signal"]'), signal.signalError);
    setInvalid(li.querySelector('[name="noise"]'), signal.noiseError);
    setInvalid(li.querySelector('[name="capacity"]'), radio.capacityInvalid);

    const sources = [];
    if (rssi && !signal.signalError) sources.push(`${formatDb(signal.rssi, 'dBm')} over ${formatDb(signal.noise, 'dBm')} noise`);
    else if (signal.signalError) sources.push(`default ${formatDb(signal.snr, 'dB')}`);
    if (link.gain) sources.push(`+${link.gain} dB for 4×4`);
    setStep(li, 'snr', `SNR ${formatDb(link.snr, 'dB')}`);
    setStep(li, 'snr-sub', sources.join(', ') || 'signal to noise');
    setStep(li, 'mcs', `MCS ${link.mcs}`, link.belowFloor ? 'crit' : '');
    setStep(li, 'mcs-sub', link.belowFloor ? `below ${MCS_TABLE[0].snr} dB, unstable` : mcsText(link.mcs), link.belowFloor ? 'crit' : '');
    if (radio.capacityManual) {
      setStep(li, 'rate', formatRateText(radio.capacity));
      setStep(li, 'rate-sub', 'manual capacity');
    } else {
      setStep(li, 'rate', formatRateText(link.rate));
      setStep(li, 'rate-sub', `${MAC_EFFICIENCY * 100}% of ${formatNumber(link.phyRate, 1)} PHY, 2×2 client`);
    }

    if (radio.capacityInvalid) {
      errors.push(`${radio.label}: enter a capacity greater than 0, or clear the field for auto. Using ${formatRateText(radio.autoCapacity)} until then.`);
    }
    if (signal.signalError) {
      errors.push(rssi
        ? `${radio.label}: enter an RSSI from −100 to −20 dBm. Using an SNR of ${formatDb(signal.fallbackSnr, 'dB')} until then.`
        : `${radio.label}: enter an SNR from 0 to 60 dB. Using ${formatDb(signal.fallbackSnr, 'dB')} until then.`);
    }
    if (signal.noiseError) {
      errors.push(`${radio.label}: enter a noise floor from −110 to −60 dBm, or clear the field for auto (${formatDb(signal.autoNoise, 'dBm')}).`);
    }
  });
  const help = $('wlan-radios-help');
  help.textContent = errors[0]
    || 'The SNR sets the MCS; 60% of its PHY rate is usable capacity. Leave capacity empty for auto, or enter a measured value.';
  help.classList.toggle('is-error', errors.length > 0);
}

// Rows whose clients cannot use their radio's band get their standard flagged.
function renderClientStatus(result) {
  const blocked = new Set(result.unreachable.map((x) => x.index));
  $('wlan-mix').querySelectorAll('.mix-row').forEach((li) => {
    const select = li.querySelector('[name="client"]');
    if (select) setInvalid(select, blocked.has(Number(li.dataset.index)));
  });
}

const RENDERERS = { wired: renderWired, wlan: renderWlan };

function update(tab, persist = true) {
  if (persist) saveState(tab, state[tab]);
  RENDERERS[tab]();
}

/* Client mix (shared component) */

function buildMixRow(tab, row, index) {
  const li = $('mix-row-template').content.firstElementChild.cloneNode(true);
  li.dataset.index = String(index);
  const select = li.querySelector('[name="type"]');
  select.append(...CLIENT_TYPES.map((t) => new Option(t.label, t.id)));
  select.value = row.type;
  li.querySelector('[name="count"]').value = row.count;
  li.querySelector('[name="mbps"]').value = row.mbps;
  const clientPick = li.querySelector('.cell-field--client');
  if (tab !== 'wlan') {
    clientPick.remove();
  } else {
    const clientSelect = clientPick.querySelector('[name="client"]');
    clientSelect.append(...Object.entries(CLIENT_STANDARDS).map(([id, s]) => new Option(s.label, id)));
    clientSelect.value = row.client;
    const streamsSelect = clientPick.querySelector('[name="clientStreams"]');
    streamsSelect.append(...CLIENT_STREAM_OPTIONS.map((n) => new Option(streamsLabel(n), String(n))));
    streamsSelect.value = String(row.clientStreams);
  }
  const radioPick = li.querySelector('.cell-field--radio');
  // The radio pick only makes sense when the AP actually has several radios.
  if (tab !== 'wlan' || state.wlan.radios.length < 2) {
    radioPick.remove();
  } else {
    const radioSelect = radioPick.querySelector('[name="radio"]');
    radioSelect.append(...state.wlan.radios.map((x) => new Option(radioLabel(x), x.id)));
    radioSelect.value = row.radio;
  }
  return li;
}

function renderMix(tab) {
  $(`${tab}-mix`).querySelector('.mix-rows').replaceChildren(...state[tab].rows.map((row, i) => buildMixRow(tab, row, i)));
}

function setupMix(tab) {
  const root = $(`${tab}-mix`);

  root.addEventListener('input', (event) => {
    const li = event.target.closest('.mix-row');
    if (!li) return;
    const row = state[tab].rows[Number(li.dataset.index)];
    const { name, value } = event.target;
    if (name === 'type') {
      const preset = TYPE_BY_ID[value];
      row.type = value;
      row.mbps = preset.mbps;
      li.querySelector('[name="mbps"]').value = row.mbps;
      if (tab === 'wlan') {
        row.client = preset.client;
        row.clientStreams = preset.streams;
        li.querySelector('[name="client"]').value = row.client;
        li.querySelector('[name="clientStreams"]').value = String(row.clientStreams);
      }
    } else if (name === 'client') {
      row.client = value;
    } else if (name === 'clientStreams') {
      row.clientStreams = Number(value);
    } else if (name === 'count') {
      row.count = Math.floor(toNumber(value));
    } else if (name === 'mbps') {
      row.mbps = toNumber(value);
    } else if (name === 'radio') {
      row.radio = value;
    }
    update(tab);
  });

  root.addEventListener('click', (event) => {
    const rows = state[tab].rows;
    if (event.target.closest('.add-row')) {
      const preset = CLIENT_TYPES[0];
      const row = { type: preset.id, count: 1, mbps: preset.mbps };
      if (tab === 'wlan') {
        row.radio = state.wlan.radios[0].id;
        row.client = preset.client;
        row.clientStreams = preset.streams;
      }
      rows.push(row);
      renderMix(tab);
      update(tab);
      root.querySelector('.mix-row:last-child select').focus();
      return;
    }
    const removeButton = event.target.closest('.remove-row');
    if (removeButton) {
      const index = Number(removeButton.closest('.mix-row').dataset.index);
      rows.splice(index, 1);
      renderMix(tab);
      update(tab);
      const next = root.querySelectorAll('.remove-row')[Math.min(index, rows.length - 1)];
      (next || root.querySelector('.add-row')).focus();
    }
  });
}

/* Switch tab */

function buildComparison(listId, classes) {
  const list = $(listId);
  for (const gbps of classes) {
    const li = document.createElement('li');
    li.className = 'compare-row';
    li.innerHTML = `
      <span class="compare-label">${formatRateText(gbps * 1000)}</span>
      <div class="scale scale--mini" aria-hidden="true">
        <div class="scale-track"><div class="scale-fill"></div></div>
        <div class="scale-marks"><span class="mark" style="--at: 60%"></span><span class="mark" style="--at: 85%"></span></div>
      </div>
      <span class="compare-value">—</span>`;
    list.append(li);
  }
}

function syncWiredInputs() {
  $('wired-concurrency').value = state.wired.concurrency;
}

function setupWired() {
  buildComparison('wired-compare', COMPARISON_CLASSES_GBPS);
  $('wired-concurrency').addEventListener('input', (event) => {
    state.wired.concurrency = clampConcurrency(event.target.value);
    update('wired');
  });
}

/* WLAN tab */

function fillWidthSelect(select, profile, width) {
  select.replaceChildren(...channelWidths(profile).map((w) => new Option(`${w} MHz`, String(w))));
  select.value = String(width);
}

// Ids stay stable so client rows keep their assignment when a radio is removed.
function newRadio(radios) {
  let n = 1;
  while (radios.some((radio) => radio.id === `r${n}`)) n += 1;
  return { ...DEFAULT_RADIO, id: `r${n}` };
}

function fieldValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

// Writes the radio's state into its row. Called after changes that reset
// fields (profile, width, streams, signal mode), never while one is typed in.
function syncRadioRow(li, radio) {
  fillWidthSelect(li.querySelector('[name="width"]'), radio.profile, radio.width);
  li.querySelector('[name="streams"]').value = String(radio.streams);
  li.querySelector('[name="capacity"]').value = fieldValue(radio.capacity);
  li.querySelector('[name="signal"]').value = fieldValue(radio.signal);
  li.querySelector('[name="noise"]').value = fieldValue(radio.noise);
  li.querySelectorAll('[data-field="signalMode"]').forEach((input) => {
    input.checked = input.value === radio.signalMode;
  });
}

function buildRadioRow(radio, index) {
  const li = $('radio-row-template').content.firstElementChild.cloneNode(true);
  li.dataset.index = String(index);
  const profileSelect = li.querySelector('[name="profile"]');
  profileSelect.append(...Object.entries(AP_PROFILES).map(([id, p]) => new Option(p.label, id)));
  profileSelect.value = radio.profile;
  const streamsSelect = li.querySelector('[name="streams"]');
  streamsSelect.append(...STREAM_OPTIONS.map((n) => new Option(streamsLabel(n), String(n))));
  // Native radio buttons group by name, so every radio row needs its own.
  li.querySelectorAll('[data-field="signalMode"]').forEach((input) => {
    input.name = `signal-mode-${radio.id}`;
  });
  syncRadioRow(li, radio);
  li.querySelector('.remove-row').hidden = state.wlan.radios.length === 1;
  return li;
}

function renderRadios() {
  const root = $('wlan-radios');
  root.querySelector('.mix-rows').replaceChildren(...state.wlan.radios.map(buildRadioRow));
  root.querySelector('.add-row').hidden = state.wlan.radios.length >= MAX_RADIOS;
}

function syncWlanInputs() {
  renderRadios();
}

// Empty means "not set" (auto for capacity and noise floor); anything that is
// not a number stays NaN so the field is flagged instead of silently reset.
function parseField(text) {
  const trimmed = text.trim();
  return trimmed === '' ? null : Number(trimmed.replace(',', '.'));
}

function setupWlan() {
  buildComparison('wlan-port-compare', AP_PORT_CLASSES.map((c) => c.gbps));
  const root = $('wlan-radios');

  root.addEventListener('input', (event) => {
    const li = event.target.closest('.mix-row');
    if (!li) return;
    const radio = state.wlan.radios[Number(li.dataset.index)];
    const name = event.target.dataset.field || event.target.name;
    const { value } = event.target;
    if (name === 'profile') {
      const oldBand = profileOf(radio.profile).band;
      radio.profile = value;
      const widths = channelWidths(radio.profile);
      const oldWidth = radio.width;
      if (!widths.includes(radio.width)) radio.width = Math.max(...widths);
      radio.capacity = null;
      // A new band brings its own default SNR and noise floor; within a band a
      // narrower or wider channel moves the SNR.
      if (profileOf(radio.profile).band !== oldBand) {
        radio.noise = null;
        radio.signal = defaultSignal(radio.profile, radio.width, radio.signalMode);
      } else if (radio.width !== oldWidth) {
        radio.signal = signalAfterWidthChange({ ...radio, width: oldWidth }, radio.width);
      }
      syncRadioRow(li, radio);
    } else if (name === 'width' || name === 'streams') {
      // The SNR moves with the width (SNR mode); an RSSI stays as entered.
      if (name === 'width') radio.signal = signalAfterWidthChange(radio, Number(value));
      radio[name] = Number(value);
      radio.capacity = null;
      // A noise floor entered by hand belongs to the old width.
      if (name === 'width') radio.noise = null;
      syncRadioRow(li, radio);
    } else if (name === 'signalMode') {
      radio.signal = convertSignal(radio, value);
      radio.signalMode = value;
      syncRadioRow(li, radio);
    } else if (name === 'capacity' || name === 'signal' || name === 'noise') {
      radio[name] = parseField(value);
    }
    // Profile, width and streams change how radios are labelled in the client mix.
    if (name === 'profile' || name === 'width' || name === 'streams') renderMix('wlan');
    update('wlan');
  });

  root.addEventListener('click', (event) => {
    const radios = state.wlan.radios;
    if (event.target.closest('.add-row')) {
      if (radios.length >= MAX_RADIOS) return;
      radios.push(newRadio(radios));
      renderRadios();
      renderMix('wlan');
      update('wlan');
      root.querySelector('.mix-row:last-child select').focus();
      return;
    }
    const removeButton = event.target.closest('.remove-row');
    if (!removeButton || radios.length === 1) return;
    const index = Number(removeButton.closest('.mix-row').dataset.index);
    const [removed] = radios.splice(index, 1);
    for (const row of state.wlan.rows) if (row.radio === removed.id) row.radio = radios[0].id;
    renderRadios();
    renderMix('wlan');
    update('wlan');
    root.querySelector('.add-row').focus();
  });

  $('wlan-concurrency').addEventListener('input', (event) => {
    state.wlan.concurrency = clampConcurrency(event.target.value);
    update('wlan');
  });
}

/* Tabs */

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

  function activate(tab, focus) {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab, false));
    tab.addEventListener('keydown', (event) => {
      const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      activate(tabs[(moves[event.key] + tabs.length) % tabs.length], true);
    });
  });
}

/* Reset */

function setupReset() {
  document.querySelectorAll('[data-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.reset;
      state[tab] = cloneDefaults(tab);
      clearState(tab);
      renderMix(tab);
      if (tab === 'wired') syncWiredInputs();
      else syncWlanInputs();
      update(tab, false);
    });
  });
}

function init() {
  state.wired = loadState('wired');
  state.wlan = loadState('wlan');

  setupTabs();
  setupMix('wired');
  setupMix('wlan');
  setupWired();
  setupWlan();
  setupReset();

  renderMix('wired');
  renderMix('wlan');
  syncWiredInputs();
  syncWlanInputs();

  // Power-on sweep: scales start empty, then fill to their values once.
  const root = document.documentElement;
  root.classList.add('is-booting');
  void root.offsetWidth;
  update('wired', false);
  update('wlan', false);
  setTimeout(() => root.classList.remove('is-booting'), 1000);
}

if (typeof document !== 'undefined') {
  init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CLIENT_TYPES,
    CLIENT_STANDARDS,
    CLIENT_STREAM_OPTIONS,
    AP_PROFILES,
    BANDS,
    PHY,
    MCS_TABLE,
    MAC_EFFICIENCY,
    STREAM_OPTIONS,
    FOUR_BY_FOUR_GAIN_DB,
    SIGNAL_LIMITS,
    DEFAULT_RADIO,
    DEFAULTS,
    AP_PORT_CLASSES,
    toNumber,
    summarizeMix,
    utilizationZone,
    accessPortClass,
    recommendUplink,
    recommendApPort,
    recommendSwitch,
    clampConcurrency,
    calcWired,
    noiseFloorFor,
    defaultSnr,
    defaultSignal,
    resolveSignal,
    convertSignal,
    signalAfterWidthChange,
    phyRate,
    referenceClient,
    linkFor,
    blendedRate,
    calcRadio,
    calcWlan,
    legacyCapacity,
    radioLabel,
    formatRate,
    formatRateText,
    formatPercent,
    accessPortText,
    switchText,
    sanitizeState,
    sanitizeRadios,
    newRadio,
    VERDICT_TEXT,
    VERDICT_SHORT,
  };
}
