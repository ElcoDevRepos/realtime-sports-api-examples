/**
 * Realtime Sports API custom functions for Google Sheets.
 *
 * Paste this file into Extensions > Apps Script, save, reload the sheet, then use
 * "Realtime Sports API > Set API key..." once. Functions:
 *
 *   =RSA_LIVE("football", "nfl")                    games in progress (cached 60 s)
 *   =RSA_SCHEDULE("football", "nfl", 2026, 5)       season schedule, optional week / season type (cached 1 h)
 *   =RSA_EVENTS("basketball", "nba")                current scoreboard window: recent, live, upcoming (cached 5 min)
 *   =RSA_TEAMS("hockey", "nhl")                     teams with ids and abbreviations (cached 24 h)
 *   =RSA_QUOTA()                                    calls remaining this month (cached 5 min)
 *
 * Every API call counts toward your monthly quota, so results are cached with CacheService and a
 * recalculation inside the cache window costs nothing. Data is aggregated from public sources and is
 * typically 20-30 seconds behind live play.
 *
 * Sport slugs: football (American), basketball, baseball, hockey, soccer.
 * League slugs: nfl, college-football, nba, mens-college-basketball, mlb, nhl, eng.1, usa.1, uefa.champions, ...
 */

var RSA_BASE_URL = 'https://www.realtimesportsapi.com/api/v1';
var RSA_KEY_PROPERTY = 'RSA_API_KEY';
var RSA_TTL = { live: 60, events: 300, schedule: 3600, teams: 86400, quota: 300 };

// ------------------------------------------------------------------------------ menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Realtime Sports API')
    .addItem('Set API key...', 'rsaSetApiKey')
    .addItem('Test connection', 'rsaTestConnection')
    .addSeparator()
    .addItem('Refresh now (clears cache)', 'rsaRefreshNow')
    .addItem('Remove API key', 'rsaRemoveApiKey')
    .addToUi();
}

function rsaSetApiKey() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'Realtime Sports API key',
    'Paste your API key (get a free one at https://www.realtimesportsapi.com/signup).\n' +
      'It is stored in your user properties for this script, not in the sheet.',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) return;
  PropertiesService.getUserProperties().setProperty(RSA_KEY_PROPERTY, key);
  rsaRefreshNow();
  ui.alert('API key saved.');
}

function rsaRemoveApiKey() {
  PropertiesService.getUserProperties().deleteProperty(RSA_KEY_PROPERTY);
  SpreadsheetApp.getUi().alert('API key removed.');
}

function rsaTestConnection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = rsaFetch_('/sports');
    var remaining = res.meta && res.meta.rateLimit ? res.meta.rateLimit.remaining : 'unknown';
    ui.alert('Connected. ' + res.data.length + ' sports available. Calls remaining this month: ' + remaining + '.');
  } catch (e) {
    ui.alert('Connection failed: ' + e.message);
  }
}

/**
 * Clears cached results and bumps the optional named range RSA_REFRESH so formulas that pass it as
 * their last argument (e.g. =RSA_LIVE("basketball", "nba", RSA_REFRESH)) recalculate.
 */
function rsaRefreshNow() {
  var props = PropertiesService.getDocumentProperties();
  // Changing the cache namespace invalidates every cached entry at once.
  props.setProperty('RSA_CACHE_NS', String(Date.now()));
  var range = SpreadsheetApp.getActiveSpreadsheet().getRangeByName('RSA_REFRESH');
  if (range) range.setValue(new Date());
}

// ------------------------------------------------------------------------------ custom functions

/**
 * Games in progress for a league.
 *
 * @param {string} sport Sport slug, e.g. "football", "basketball", "soccer".
 * @param {string} league League slug, e.g. "nfl", "nba", "eng.1".
 * @param {*} refresh Optional. Any cell (such as the named range RSA_REFRESH); changing it forces a recalculation.
 * @return Away, score, home, score, status, event id. One header row.
 * @customfunction
 */
function RSA_LIVE(sport, league, refresh) {
  rsaRequire_(sport, 'sport');
  rsaRequire_(league, 'league');
  return rsaCached_(['live', sport, league], RSA_TTL.live, function () {
    var events = rsaFetch_(rsaPath_(sport, league) + '/events/live').data || [];
    if (!events.length) return [['No live games']];
    return [RSA_EVENT_HEADER_].concat(events.map(rsaEventRow_));
  });
}

/**
 * Season schedule (NFL and college football support a week number).
 *
 * @param {string} sport Sport slug, e.g. "football".
 * @param {string} league League slug, e.g. "nfl".
 * @param {number} season Season year, e.g. 2026.
 * @param {number} week Optional week number (NFL and college football only).
 * @param {number} seasonType Optional: 1 preseason, 2 regular season, 3 postseason.
 * @return Start time, away, score, home, score, status, venue, event id. One header row.
 * @customfunction
 */
function RSA_SCHEDULE(sport, league, season, week, seasonType) {
  rsaRequire_(sport, 'sport');
  rsaRequire_(league, 'league');
  rsaRequire_(season, 'season');
  var query = {};
  if (week !== undefined && week !== '') query.week = Math.floor(Number(week));
  if (seasonType !== undefined && seasonType !== '') query.seasonType = Math.floor(Number(seasonType));
  return rsaCached_(['schedule', sport, league, season, query.week, query.seasonType], RSA_TTL.schedule, function () {
    var path = rsaPath_(sport, league) + '/seasons/' + encodeURIComponent(String(season)) + '/schedule';
    var events = rsaFetch_(path, query).data || [];
    if (!events.length) return [['No games found']];
    return [RSA_SCHEDULE_HEADER_].concat(events.map(rsaScheduleRow_));
  });
}

/**
 * Current scoreboard window for a league: recent results, live and upcoming games.
 *
 * @param {string} sport Sport slug.
 * @param {string} league League slug.
 * @param {*} refresh Optional. Any cell; changing it forces a recalculation.
 * @return Start time, away, score, home, score, status, venue, event id. One header row.
 * @customfunction
 */
function RSA_EVENTS(sport, league, refresh) {
  rsaRequire_(sport, 'sport');
  rsaRequire_(league, 'league');
  return rsaCached_(['events', sport, league], RSA_TTL.events, function () {
    var events = rsaFetch_(rsaPath_(sport, league) + '/events').data || [];
    if (!events.length) return [['No games found']];
    return [RSA_SCHEDULE_HEADER_].concat(events.map(rsaScheduleRow_));
  });
}

/**
 * Teams in a league (fetches up to 5 pages of 100; college leagues have hundreds of teams).
 *
 * @param {string} sport Sport slug.
 * @param {string} league League slug.
 * @return Team id, abbreviation, name. One header row.
 * @customfunction
 */
function RSA_TEAMS(sport, league) {
  rsaRequire_(sport, 'sport');
  rsaRequire_(league, 'league');
  return rsaCached_(['teams', sport, league], RSA_TTL.teams, function () {
    var rows = [['Team ID', 'Abbreviation', 'Name']];
    for (var page = 1; page <= 5; page++) {
      var res = rsaFetch_(rsaPath_(sport, league) + '/teams', { limit: 100, page: page });
      (res.data || []).forEach(function (t) {
        rows.push([t.id || '', t.abbreviation || '', t.displayName || t.name || '']);
      });
      var p = (res.meta && res.meta.pagination) || {};
      if (!p.hasNextPage) break;
    }
    return rows;
  });
}

/**
 * Calls remaining this month (from meta.rateLimit). Costs one call per refresh, cached 5 min.
 *
 * @return Remaining calls, monthly limit, reset time.
 * @customfunction
 */
function RSA_QUOTA() {
  return rsaCached_(['quota'], RSA_TTL.quota, function () {
    var rl = (rsaFetch_('/sports').meta || {}).rateLimit || {};
    return [
      ['Remaining', 'Limit', 'Resets'],
      [rl.remaining != null ? rl.remaining : '', rl.limit != null ? rl.limit : '', rl.reset ? new Date(rl.reset) : '']
    ];
  });
}

// ------------------------------------------------------------------------------ rows

var RSA_EVENT_HEADER_ = ['Away', 'Away score', 'Home', 'Home score', 'Status', 'Event ID'];
var RSA_SCHEDULE_HEADER_ = ['Start', 'Away', 'Away score', 'Home', 'Home score', 'Status', 'Venue', 'Event ID'];

function rsaTeam_(t) {
  t = t || {};
  return t.abbreviation || t.name || '';
}

function rsaScore_(t, state) {
  if (state === 'pre' || !t || t.score === undefined || t.score === null) return '';
  return t.score;
}

function rsaEventRow_(e) {
  var s = e.status || {};
  return [rsaTeam_(e.awayTeam), rsaScore_(e.awayTeam, s.state), rsaTeam_(e.homeTeam), rsaScore_(e.homeTeam, s.state), s.detail || s.state || '', e.id || ''];
}

function rsaScheduleRow_(e) {
  var s = e.status || {};
  var start = e.date ? new Date(e.date) : '';
  return [
    start,
    rsaTeam_(e.awayTeam),
    rsaScore_(e.awayTeam, s.state),
    rsaTeam_(e.homeTeam),
    rsaScore_(e.homeTeam, s.state),
    s.detail || s.state || '',
    (e.venue && e.venue.name) || '',
    e.id || ''
  ];
}

// ------------------------------------------------------------------------------ http + cache

function rsaRequire_(value, name) {
  if (value === undefined || value === null || value === '') throw new Error('Missing argument: ' + name);
}

function rsaPath_(sport, league) {
  return '/sports/' + encodeURIComponent(String(sport).trim()) + '/leagues/' + encodeURIComponent(String(league).trim());
}

function rsaApiKey_() {
  var key = PropertiesService.getUserProperties().getProperty(RSA_KEY_PROPERTY);
  if (!key) throw new Error('No API key. Use the menu: Realtime Sports API > Set API key...');
  return key;
}

/** GET a path under /api/v1 and return the parsed envelope { success, data, meta }. */
function rsaFetch_(path, query) {
  var qs = Object.keys(query || {})
    .filter(function (k) { return query[k] !== undefined && query[k] !== null && query[k] !== ''; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(query[k])); })
    .join('&');
  var url = RSA_BASE_URL + path + (qs ? '?' + qs : '');
  var options = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + rsaApiKey_(), Accept: 'application/json' },
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  if (code >= 500) {
    // One retry for transient server errors.
    Utilities.sleep(1000);
    res = UrlFetchApp.fetch(url, options);
    code = res.getResponseCode();
  }
  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = null;
  }
  if (code >= 200 && code < 300 && body && body.success !== false) return body;

  var err = (body && body.error) || {};
  var msg = err.message || 'HTTP ' + code;
  if (code === 429) {
    var headers = res.getHeaders();
    var retry = headers['Retry-After'] || headers['retry-after'];
    msg = 'Monthly quota exhausted' + (retry ? ' (retry in ' + Math.ceil(Number(retry) / 60) + ' min)' : '') + '. Upgrade your plan or wait for the reset.';
  } else if (code === 401 || code === 403) {
    msg = (err.code ? err.code + ': ' : '') + msg + ' Check your key via Realtime Sports API > Set API key...';
  }
  throw new Error(msg);
}

/**
 * Cache a computed 2D array. Keys include the document-level namespace so "Refresh now" invalidates
 * everything. Entries over CacheService's 100 KB limit are simply not cached.
 */
function rsaCached_(parts, ttlSeconds, compute) {
  var ns = PropertiesService.getDocumentProperties().getProperty('RSA_CACHE_NS') || '0';
  var raw = ns + '|' + JSON.stringify(parts);
  var key = 'rsa:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw));
  var cache = CacheService.getDocumentCache() || CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return rsaRevive_(JSON.parse(hit));
  var rows = compute();
  var json = JSON.stringify(rows);
  if (json.length < 100000) cache.put(key, json, Math.min(ttlSeconds, 21600));
  return rows;
}

/** JSON turns Dates into ISO strings; turn them back into Dates so Sheets formats them. */
function rsaRevive_(rows) {
  var iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
  return rows.map(function (row) {
    return row.map(function (v) {
      return typeof v === 'string' && iso.test(v) ? new Date(v) : v;
    });
  });
}
