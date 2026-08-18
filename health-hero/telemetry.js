/**
 * Campaign telemetry.
 *
 * THE FIRST RULE HERE IS THAT THIS FILE CANNOT BREAK THE GAME. Every entry
 * point is wrapped, every failure is swallowed, and after a few consecutive
 * network failures it switches itself off for the rest of the visit. A booth
 * at Gamescom gets one attempt at each visitor; losing a run to an analytics
 * bug would cost more than losing every number in here.
 *
 * Loaded by play.html. The screen frames reach it as parent.__t(), which is
 * safe because they are same-origin.
 */
(function () {
  'use strict';

  var API = (window.__API || '').replace(/\/$/, '');
  if (!API) return;

  var DID = 'wizard.did';       // random per device, persisted
  /* 30 s, not 15. The heartbeat IS the write rate: there is always one queued,
     so every visitor writes to the database once per interval whatever else
     they do. At a projected 2,000 concurrent that is the difference between
     ~133 and ~67 writes a second, against a database with a single writer.

     It costs nothing in accuracy. beat() measures real elapsed time rather
     than counting fixed lumps, so engaged time is exactly as precise — only
     how often it is reported changes. */
  var FLUSH_MS = 30000;
  var HB_MS = 30000;

  /* Back off, never give up.
     This used to switch telemetry off for the rest of the visit after four
     consecutive failures, and throw the queue away with it. The intent was
     right — a phone must not hammer a broken endpoint while someone is trying
     to play — but it could not tell "the API is down" from "the API is busy
     for twenty seconds", and it punished the second like the first. A brief
     slowdown at peak would blind every visitor mid-session, permanently, and
     lose what they had already collected. That is the busiest hour of the
     campaign and the data you most want.

     Backing off stops the hammering just as effectively, and is still
     listening when the server recovers. */
  var BACKOFF_MS = 30000;      // first retry delay
  var BACKOFF_MAX = 240000;    // never wait longer than four minutes
  /* No queue to bound any more: the state IS the payload, so a visit's memory
     is a fixed set of integers however long an outage lasts. */

  function rid() {
    var a = new Uint8Array(12);
    (crypto.getRandomValues ? crypto : { getRandomValues: function (b) {
      for (var i = 0; i < b.length; i++) b[i] = Math.random() * 256 | 0;
    } }).getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/[+/=]/g, '').slice(0, 16);
  }

  var device;
  try {
    device = localStorage.getItem(DID);
    if (!device || !/^[A-Za-z0-9_-]{6,64}$/.test(device)) {
      device = rid();
      localStorage.setItem(DID, device);
    }
  } catch (e) {
    // Private mode, or storage denied. Still measurable as a session; this
    // visitor just cannot be recognised on a second visit.
    device = rid();
  }

  var sid = rid();
  var form = Math.min(innerWidth, innerHeight) < 768 ? 'mobile' : 'desktop';
  var version = 0;
  var fails = 0;
  var backoffUntil = 0;
  var engaged = 0;          // ms accumulated since the last flush
  var lastBeat = Date.now();

  /* WHAT THE TOTALS ARE, not what changed.
     The server puts these on a queue, and queues do not guarantee order: a
     message that failed is redelivered AFTER newer ones. Sending deltas against
     a high-water-mark would silently discard the redelivered one. Sending the
     running totals means any single message carries everything up to its
     version, so reordering, duplication and outright loss are all harmless —
     the next message repairs it. */
  var st = {
    engaged_ms: 0,
    saw_splash: 0, saw_intro: 0, saw_game: 0, saw_ended: 0, saw_board: 0,
    cta_out_ended: 0, cta_out_board: 0, cta_play_again: 0,
    cta_leaderboard: 0, cta_privacy: 0,
    runs: 0, finished: 0, metres: 0, orbs: 0, named: 0
  };
  var SCREEN_COL = {
    splash: 'saw_splash', intro: 'saw_intro', game: 'saw_game',
    ended: 'saw_ended', board: 'saw_board'
  };
  var CTA_COL = {
    play_again: 'cta_play_again', leaderboard: 'cta_leaderboard', privacy: 'cta_privacy'
  };

  /* The moments worth sending at once rather than on the next tick. A visitor
     who finishes a run and closes the tab is the common case at a booth. */
  var URGENT = { run_end: 1, cta: 1, name_claim: 1 };

  function record(kind, d) {
    d = d || {};
    if (kind === 'hb') {
      if (d.ms > 0) st.engaged_ms += d.ms;
      return false;
    }
    if (kind === 'view') { var c = SCREEN_COL[d.screen]; if (c) st[c] += 1; return false; }
    if (kind === 'run_start') { st.runs += 1; return false; }
    if (kind === 'run_end') {
      /* Checked here so one bad run cannot poison the visit's totals, which
         the server can only bounds-check in aggregate. */
      if (d.score === d.metres + d.orbs * 10 && d.metres >= 0 && d.orbs >= 0) {
        st.finished += 1; st.metres += d.metres; st.orbs += d.orbs;
      }
      return true;
    }
    if (kind === 'name_claim') { st.named = 1; return true; }
    if (kind === 'cta') {
      if (d.label === 'learn_more' || d.label === 'find_out_more') {
        if (d.screen === 'ended') st.cta_out_ended += 1;
        else if (d.screen === 'board') st.cta_out_board += 1;
      } else if (CTA_COL[d.label]) st[CTA_COL[d.label]] += 1;
      return true;
    }
    return false;
  }

  /* text/plain, NOT application/json, and this matters more than it looks.
     The body IS json and the Worker parses it as json either way — but
     application/json is not a CORS-safelisted content type, so it forces a
     preflight. sendBeacon cannot preflight: the request is dropped, and it
     still returns true, so there is no way to notice. Every end-of-visit
     flush was being thrown away, which is precisely where run_end and the
     outbound click live. text/plain is safelisted, so the beacon goes, and
     the timed flush drops from OPTIONS+POST to a single request. */
  var TYPE = 'text/plain';

  /* One request at a time, per visit.
     Overlapping sends are no longer a correctness problem — each carries a
     version and the row takes the newest — but two in flight would only race
     to write the same totals, so the older is wasted work. */
  var inFlight = false;

  function flush(useBeacon) {
    if (!useBeacon && Date.now() < backoffUntil) return;
    if (inFlight && !useBeacon) return;
    var body = JSON.stringify({ sid: sid, device: device, form: form, v: ++version, st: st });

    if (useBeacon && navigator.sendBeacon) {
      // Last chance before the page goes; ignore the backoff, it costs nothing.
      try { navigator.sendBeacon(API + '/t', new Blob([body], { type: TYPE })); } catch (e) {}
      return;
    }

    inFlight = true;
    fetch(API + '/t', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': TYPE },
      body: body
    }).then(function (r) {
      if (!r.ok && r.status !== 204) throw new Error('status ' + r.status);
      fails = 0; backoffUntil = 0;
    }).catch(function () {
      fails += 1;
      backoffUntil = Date.now() +
        Math.min(BACKOFF_MS * Math.pow(2, fails - 1), BACKOFF_MAX);
    }).then(function () { inFlight = false; });
  }

  /* Engaged time, not elapsed time. A phone in a pocket with the tab still
     open would otherwise report a twenty-minute visit. */
  function beat() {
    var now = Date.now();
    if (document.visibilityState === 'visible') {
      var d = now - lastBeat;
      if (d > 0 && d < 60000) engaged += d;
    }
    lastBeat = now;
    if (engaged >= 1000) { record('hb', { ms: Math.round(engaged) }); engaged = 0; }
  }

  setInterval(function () { try { beat(); } catch (e) {} }, HB_MS);
  setInterval(function () { try { flush(); } catch (e) {} }, FLUSH_MS);

  document.addEventListener('visibilitychange', function () {
    try {
      beat();
      if (document.visibilityState === 'hidden') flush(true);
    } catch (e) {}
  });
  addEventListener('pagehide', function () { try { beat(); flush(true); } catch (e) {} });

  /** The one entry point. Never throws. */
  window.__t = function (kind, data) {
    try { if (record(kind, data)) flush(); } catch (e) {}
  };

  window.__t('view', { screen: 'splash' });
})();
