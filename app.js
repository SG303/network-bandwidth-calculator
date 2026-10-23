'use strict';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const CLIENT_TYPES = [
  { id: 'office-light', label: 'Office – light (web, email, SaaS)', mbps: 2 },
  { id: 'office-heavy', label: 'Office – heavy (cloud workloads, downloads)', mbps: 10 },
  { id: 'video-conf', label: 'Video conference (Teams/Zoom, HD)', mbps: 4 },
  { id: 'stream-hd', label: 'Video streaming (HD)', mbps: 8 },
  { id: 'stream-4k', label: 'Video streaming (4K)', mbps: 25 },
  { id: 'voip', label: 'VoIP telephony', mbps: 0.1 },
  { id: 'file-transfer', label: 'File transfer / CAD / backup', mbps: 50 },
  { id: 'iot', label: 'Printers / scanners / IoT', mbps: 0.5 },
  { id: 'pos', label: 'Point of sale / POS', mbps: 1 },
  { id: 'custom', label: 'Custom client type', mbps: 10 },
];
const TYPE_BY_ID = Object.fromEntries(CLIENT_TYPES.map((t) => [t.id, t]));

const UPLINK_CLASSES_GBPS = [1, 10, 25, 40, 100];
const COMPARISON_CLASSES_GBPS = [1, 10, 25];
const SWITCH_SIZES = [8, 12, 24, 28, 48, 52];

// Planning capacity (usable throughput) per AP radio in Mbit/s: conservative, roughly a third
// to half of the PHY rate of a typical 2×2 radio, lower still on 2.4 GHz.
const AP_PROFILES = {
  '2g': { label: '2.4 GHz (Wi-Fi 4/6)', short: '2.4 GHz', capacity: { 20: 50, 40: 100 } },
  '5g-ac': { label: '5 GHz – Wi-Fi 5 (802.11ac)', short: '5 GHz (Wi-Fi 5)', capacity: { 20: 80, 40: 170, 80: 350 } },
  '5g-ax': { label: '5 GHz – Wi-Fi 6 (802.11ax)', short: '5 GHz (Wi-Fi 6)', capacity: { 20: 110, 40: 220, 80: 450, 160: 900 } },
  '6g-6e': { label: '6 GHz – Wi-Fi 6E', short: '6 GHz (Wi-Fi 6E)', capacity: { 20: 110, 40: 220, 80: 450, 160: 900 } },
  '6g-be': { label: '6 GHz – Wi-Fi 7 (802.11be)', short: '6 GHz (Wi-Fi 7)', capacity: { 20: 120, 40: 240, 80: 500, 160: 1000, 320: 1900 } },
};

// Spatial streams of the AP radio. The matrix above is based on a 2×2 radio.
// A 4×4 radio serving 2×2 clients gains about 3 dB link margin (receive
// combining uplink, beamforming downlink), roughly one MCS step for clients
// away from the AP. It adds no streams for those clients and MU-MIMO is not
// counted, so the planning value rises by a conservative 15%.
const STREAM_OPTIONS = [2, 4];
const FOUR_BY_FOUR_GAIN_PCT = 15;

const OK_LIMIT = 0.6;
const BORDERLINE_LIMIT = 0.85;
const MAX_RADIOS = 4;

// One radio of an AP; an AP is described by a list of these.
const DEFAULT_RADIO = { id: 'r1', profile: '5g-ax', width: 80, streams: 2, capacity: 450 };

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
      { type: 'office-light', count: 20, mbps: 2, radio: 'r1' },
      { type: 'stream-4k', count: 5, mbps: 25, radio: 'r1' },
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
function utilizationOf(load, capacity) {
  return Math.round(clean((load * 1000) / capacity)) / 1000;
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

function channelWidths(profile) {
  return Object.keys(AP_PROFILES[profile].capacity).map(Number);
}

function plannedCapacity(profile, width, streams = 2) {
  const profileData = AP_PROFILES[profile] || AP_PROFILES[DEFAULT_RADIO.profile];
  const base = profileData.capacity[width] || DEFAULT_RADIO.capacity;
  if (streams !== 4) return base;
  // Integer math keeps halves exact, so 100 → 115 rounds to 120, not 110.
  return Math.round((base * (100 + FOUR_BY_FOUR_GAIN_PCT)) / 1000) * 10;
}

function streamsLabel(streams) {
  return `${streams}×${streams}`;
}

// Compact label for results, e.g. "5 GHz (Wi-Fi 6) @ 80 MHz, 2×2".
function radioLabel(radio) {
  const profile = AP_PROFILES[radio.profile] || AP_PROFILES[DEFAULT_RADIO.profile];
  return `${profile.short} @ ${radio.width} MHz, ${streamsLabel(radio.streams || 2)}`;
}

// One radio: demand of its clients, effective load and the APs it alone needs.
function calcRadio(rows, radio, concurrency) {
  const mix = summarizeMix(rows.filter((row) => row.radio === radio.id));
  const planned = plannedCapacity(radio.profile, radio.width, radio.streams);
  const override = toNumber(radio.capacity);
  const effectiveCapacity = override > 0 ? override : planned;
  const effective = clean((mix.demand * concurrency) / 100);
  const utilization = utilizationOf(effective, effectiveCapacity);
  return {
    id: radio.id,
    profile: radio.profile,
    width: radio.width,
    streams: radio.streams,
    label: radioLabel(radio),
    ...mix,
    peak: mix.demand,
    effective,
    plannedCapacity: planned,
    capacity: effectiveCapacity,
    capacityFallback: override === 0,
    utilization,
    verdict: utilizationZone(utilization),
    aps: mix.clients > 0 ? Math.max(1, Math.ceil(clean(utilization / OK_LIMIT))) : 0,
    perClient: mix.clients > 0 ? clean(effectiveCapacity / mix.clients) : null,
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
  const mix = summarizeMix(rows);
  return {
    ...mix,
    peak: mix.demand,
    effective: clean((mix.demand * conc) / 100),
    radios: perRadio,
    limiting: limiting ? limiting.id : null,
    utilization: limiting ? limiting.utilization : 0,
    verdict,
    aps: Math.max(1, ...perRadio.map((r) => r.aps)),
    capacity: (limiting || perRadio[0]).capacity,
    plannedCapacity: perRadio[0].plannedCapacity,
    capacityFallback: perRadio.some((r) => r.capacityFallback),
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

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return null;
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      type: TYPE_BY_ID[row.type] ? row.type : 'custom',
      count: Math.floor(toNumber(row.count)),
      mbps: toNumber(row.mbps),
      radio: typeof row.radio === 'string' && row.radio ? row.radio : undefined,
    }));
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
  // switch in the UI; a stale capacity resets to the matching matrix value.
  const width = widthValid ? Number(entry.width) : Math.max(...widths);
  // States from before the stream choice have no streams field: they were 2×2.
  const streamsValid = STREAM_OPTIONS.includes(Number(entry.streams));
  const streams = streamsValid ? Number(entry.streams) : 2;
  const capacity = widthValid && (streamsValid || entry.streams === undefined) && Number.isFinite(entry.capacity)
    ? entry.capacity
    : plannedCapacity(profile, width, streams);
  return { id, profile, width, streams, capacity };
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
  const rows = sanitizeRows(data.rows);
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

  $('wlan-streams-note').hidden = !r.radios.some((x) => x.streams === 4);

  renderRadioTable(r);
  renderRadioHelp(r);
  renderBreakdown('wlan', r);
}

function renderRadioTable(result) {
  const body = $('wlan-radio-table');
  body.replaceChildren();
  for (const radio of result.radios) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    const short = (AP_PROFILES[radio.profile] || {}).short || radio.label;
    const parts = short.match(/^(\S+ GHz)(.*)$/);
    const name = document.createElement('span');
    name.className = 'radio-name';
    name.textContent = parts ? parts[1] : short;
    const standard = document.createElement('span');
    standard.className = 'radio-std';
    standard.textContent = parts ? parts[2] : '';
    const meta = document.createElement('span');
    meta.className = 'radio-meta';
    meta.textContent = `@ ${radio.width} MHz, ${streamsLabel(radio.streams)}`;
    th.append(name, standard, ' ', meta);
    tr.append(th);
    tr.insertCell().textContent = formatNumber(radio.effective);
    tr.insertCell().textContent = formatNumber(radio.capacity);
    const utilization = tr.insertCell();
    const stack = document.createElement('span');
    stack.className = 'util-stack';
    stack.append(formatPercent(radio.utilization), ' ');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = radio.clients > 0 ? VERDICT_SHORT[radio.verdict] : 'idle';
    if (radio.clients > 0) badge.dataset.zone = radio.verdict;
    stack.append(badge);
    utilization.append(stack);
    tr.insertCell().textContent = radio.clients > 0 ? formatNumber(radio.aps, 0) : '—';
  }
}

function renderRadioHelp(result) {
  const help = $('wlan-radios-help');
  const rows = $('wlan-radios').querySelectorAll('.mix-row');
  result.radios.forEach((radio, i) => {
    const input = rows[i] && rows[i].querySelector('[name="capacity"]');
    if (!input) return;
    if (radio.capacityFallback) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  });
  const invalid = result.radios.find((x) => x.capacityFallback);
  if (invalid) {
    help.textContent = `${invalid.label}: enter a value greater than 0. Using the planning value of ${formatRateText(invalid.plannedCapacity)} until then.`;
  } else {
    help.textContent = 'Planning values per band, standard, width and streams — usable throughput per radio, not the PHY data rate. Edit a value to override it.';
  }
  help.classList.toggle('is-error', Boolean(invalid));
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
      row.type = value;
      row.mbps = TYPE_BY_ID[value].mbps;
      li.querySelector('[name="mbps"]').value = row.mbps;
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
      if (tab === 'wlan') row.radio = state.wlan.radios[0].id;
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

function buildComparison() {
  const list = $('wired-compare');
  for (const gbps of COMPARISON_CLASSES_GBPS) {
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
  buildComparison();
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

function buildRadioRow(radio, index) {
  const li = $('radio-row-template').content.firstElementChild.cloneNode(true);
  li.dataset.index = String(index);
  const profileSelect = li.querySelector('[name="profile"]');
  profileSelect.append(...Object.entries(AP_PROFILES).map(([id, p]) => new Option(p.label, id)));
  profileSelect.value = radio.profile;
  fillWidthSelect(li.querySelector('[name="width"]'), radio.profile, radio.width);
  const streamsSelect = li.querySelector('[name="streams"]');
  streamsSelect.append(...STREAM_OPTIONS.map((n) => new Option(streamsLabel(n), String(n))));
  streamsSelect.value = String(radio.streams);
  li.querySelector('[name="capacity"]').value = radio.capacity;
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

function setupWlan() {
  const root = $('wlan-radios');

  root.addEventListener('input', (event) => {
    const li = event.target.closest('.mix-row');
    if (!li) return;
    const radio = state.wlan.radios[Number(li.dataset.index)];
    const { name, value } = event.target;
    if (name === 'profile') {
      radio.profile = value;
      const widths = channelWidths(radio.profile);
      if (!widths.includes(radio.width)) radio.width = Math.max(...widths);
      radio.capacity = plannedCapacity(radio.profile, radio.width, radio.streams);
      fillWidthSelect(li.querySelector('[name="width"]'), radio.profile, radio.width);
      li.querySelector('[name="capacity"]').value = radio.capacity;
    } else if (name === 'width') {
      radio.width = Number(value);
      radio.capacity = plannedCapacity(radio.profile, radio.width, radio.streams);
      li.querySelector('[name="capacity"]').value = radio.capacity;
    } else if (name === 'streams') {
      radio.streams = Number(value);
      radio.capacity = plannedCapacity(radio.profile, radio.width, radio.streams);
      li.querySelector('[name="capacity"]').value = radio.capacity;
    } else if (name === 'capacity') {
      const text = value.trim();
      radio.capacity = text === '' ? 0 : Number(text.replace(',', '.')) || 0;
    }
    // Profile, width and streams change how radios are labelled in the client mix.
    if (name !== 'capacity') renderMix('wlan');
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
    AP_PROFILES,
    STREAM_OPTIONS,
    DEFAULTS,
    toNumber,
    summarizeMix,
    utilizationZone,
    accessPortClass,
    recommendUplink,
    recommendSwitch,
    clampConcurrency,
    calcWired,
    calcRadio,
    calcWlan,
    plannedCapacity,
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
