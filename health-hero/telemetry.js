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
  var FLUSH_MS = 15000;
  var HB_MS = 15000;
  var MAX_FAILS = 4;

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
  var queue = [];
  var seq = 0;
  var fails = 0;
  var off = false;
  var engaged = 0;          // ms accumulated since the last flush
  var lastBeat = Date.now();

  function push(kind, data) {
    if (off) return;
    var e = { seq: ++seq, kind: kind };
    for (var k in data) if (data[k] !== undefined && data[k] !== null) e[k] = data[k];
    queue.push(e);
    if (queue.length >= 40) flush();      // long before the server's 100 cap
  }

  /* Events stay in the queue until the server confirms them. Combined with the
     server's per-session sequence high-water-mark, that makes delivery
     exactly-once: a batch we could not confirm is re-sent with the same seq
     numbers and ignored if it did in fact land. */
  function flush(useBeacon) {
    if (off || !queue.length) return;
    var batch = queue.slice(0, 100);
    var body = JSON.stringify({ sid: sid, device: device, form: form, events: batch });

    if (useBeacon && navigator.sendBeacon) {
      // The page is going away; there is no response to wait for and no chance
      // to retry, so drop the queue rather than hold it for a flush that will
      // never run.
      try {
        navigator.sendBeacon(API + '/t', new Blob([body], { type: 'application/json' }));
        queue = queue.slice(batch.length);
      } catch (e) {}
      return;
    }

    fetch(API + '/t', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: body
    }).then(function (r) {
      if (!r.ok && r.status !== 204) throw new Error('status ' + r.status);
      queue = queue.slice(batch.length);
      fails = 0;
    }).catch(function () {
      if (++fails >= MAX_FAILS) { off = true; queue = []; }
    });
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
    if (engaged >= 1000) { push('hb', { ms: Math.round(engaged) }); engaged = 0; }
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
    try { push(kind, data || {}); } catch (e) {}
  };

  window.__t('view', { screen: 'splash' });
})();
