/* Fit a Figma frame to the viewport.

   Two modes, chosen by whether the page has a .content wrapper:

   - SPLIT (mobile 393x852). The frame is far taller than any phone browser
     viewport, so one scale cannot serve it: the background covers the viewport
     and .content is counter-scaled back down to contain. Artwork reaches every
     edge, no content is ever cut. See flow.css.

   - PLAIN (desktop 1920x1080). Contained and centred.

     NOTE: this leaves bars on any window that is not 16:9. Making the desktop
     screens genuinely fluid means laying them out as two columns rather than
     scaling a picture, and that is a real piece of work — an attempt at it is
     recorded in the project notes. It is not done here on purpose: a contained
     frame is exact and predictable, and a half-finished fluid one is neither.

   ResizeObserver as well as the events: on iOS Safari 'resize' is not
   dependable around rotation and the collapsing URL bar. */
(function () {
  var screenEl = document.getElementById('screen');
  if (!screenEl) return;

  /* The three outbound links.

     Figma draws these as plain text, so they are wired here by their label
     rather than by node id — the ids differ between the mobile and desktop
     frames and change whenever a screen is re-exported, the label does not.

     Each one climbs to the largest ancestor that still contains only that
     label, so the whole target is clickable: the arrow travels with "Learn
     More", and "LEARN MORE" picks up its entire pixel-art button rather than
     just the word. The wrapper is display:contents so the layout is untouched.

     target=_blank keeps the run alive behind them, and rel=noopener is
     mandatory with it — without it the opened page can reach back through
     window.opener. */
  var LINKS = [
    ['click here', 'https://www.novonordisk.com/data-privacy-and-user-rights/privacy-policy.html'],
    ['learn more', 'https://www.ueber-gewicht.de/']
  ];
  function wireLinks() {
    var norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\.$/, ''); };
    LINKS.forEach(function (pair) {
      var label = pair[0], href = pair[1];
      [].forEach.call(document.querySelectorAll('p, span'), function (el) {
        if (norm(el.textContent) !== label || el.closest('a')) return;
        var t = el;
        while (t.parentElement && t.parentElement !== document.body &&
               norm(t.parentElement.textContent) === label) t = t.parentElement;
        var a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.style.cssText = 'display:contents;cursor:pointer;color:inherit;text-decoration:inherit';
        t.parentElement.insertBefore(a, t);
        a.appendChild(t);
      });
    });
  }
  wireLinks();

  /* Give mixed-size lines something real to trim against.

     Figma writes them as a font-size:0 wrapper with sized spans inside —
     "2050" at 20px beside "PTS." at 14px. text-box-trim then measures cap
     height against a ZERO-size font, the box collapses, and the number rides
     8px above "Your Score:" instead of sharing its baseline.

     Setting the <p> to its largest span's size changes nothing visually — every
     glyph is inside a span with its own size — but it gives the line box a real
     strut, so the trim lands where Figma's does. */
  document.querySelectorAll('[style*="font-size:0px"] > p').forEach(function (p) {
    var max = 0;
    p.querySelectorAll('span').forEach(function (s) {
      max = Math.max(max, parseFloat(getComputedStyle(s).fontSize) || 0);
    });
    if (max) p.style.fontSize = max + 'px';
  });

  /* The home screen's orb, animated.

     Figma draws the centrepiece as two still pieces: a faint "ripple effect"
     PNG and a "heart orbs" SVG on top of it. The client supplied the moving
     version — "ripple 3", a 600x600 loop, 32 frames at 24fps — and it contains
     BOTH: a shape layer for the orb and a 24-frame image sequence for the
     rings around it. So it replaces the pair, and both stills are hidden.

     Worth stating because it is easy to get backwards: the loop is not just
     the rings. Swapping only the ripple and leaving the drawn orb on top
     double-draws the orb, and hiding only the orb leaves the still rings
     behind the moving ones.

     SIZE is derived from the artwork, not guessed. In the loop the orb is
     0.398 of the frame, measured off a render; Figma draws it at 136px. So the
     canvas is 136 / 0.398 = 342px and the orb lands exactly where the still
     one did, with the rings reaching their natural distance around it.

     Drawn plainly — no blend mode, no reduced opacity. Those belonged to the
     still ripple, which was a faint wash UNDER the orb; carrying them onto a
     layer that now contains the orb itself washes the orb out. On this sky,
     plus-lighter at 0.25 made the whole thing disappear. */
  /* Both layouts draw the same centrepiece, but out of different pieces.

       mobile   a faint "ripple effect" PNG + a "heart orbs" SVG on top
       desktop  three siblings, all exported as "Vector" apart from the glow:
                the orb, the ripple glow (plus-lighter), and the heart

     Desktop is addressed by node id because every piece there is called
     "Vector" and nothing else distinguishes them — the same reason play.html
     keeps an id table for the screens. Mobile is addressed by name, which is
     stable there. Whichever set is present wins; the other is simply absent.

     The canvas goes in as a SIBLING of the orb, so it inherits the orb's
     containing block and the orb's own used left/top can be reused directly.
     That is what keeps one placement calculation working for both. */
  var ORB_SETS = [
    { orb: '[data-name^="heart orbs"]',
      hide: ['[data-name^="ripple effect"]', '[data-name^="heart orbs"]'] },
    { orb: '[data-node-id="643:3869"]',
      hide: ['[data-node-id="643:3869"]', '[data-node-id="643:3870"]',
             '[data-node-id="643:3882"]'] }
  ];

  (function orbLoop() {
    var set = null, orb = null;
    for (var i = 0; i < ORB_SETS.length && !orb; i++) {
      orb = document.querySelector(ORB_SETS[i].orb);
      if (orb) set = ORB_SETS[i];
    }
    if (!orb) return;

    var hidden = [];
    set.hide.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) hidden.push(el);
    });

    var o = getComputedStyle(orb);
    var cx = parseFloat(o.left) + parseFloat(o.width) / 2;
    var cy = parseFloat(o.top) + parseFloat(o.height) / 2;
    var size = parseFloat(o.width) / 0.398;

    var cv = document.createElement('canvas');
    var top0 = cy - size / 2;                 // the design position, kept to reset to
    cv.style.cssText =
      'position:absolute;pointer-events:none;left:' + (cx - size / 2) + 'px;top:' +
      top0 + 'px;width:' + size + 'px;height:' + size + 'px';
    orb.parentElement.insertBefore(cv, orb);

    /* Land the orb where the splash film leaves it, so the two meet.

       The film is 402x874 and the splash renders it with fit:'contain'. That
       is height-bound for any viewport wider in aspect than 402/874 = 0.46 —
       which is every phone and every desktop — so it always ends with the orb
       centred at the SAME fraction of viewport height:

           430.9 / 874 = 0.49302

       Checked against the rendered film at 393x852, 1440x900, 1600x1000 and
       1920x1080: predicted within about a pixel at all four.

       Only the vertical is touched. Horizontally the two already agree to a
       pixel, and the sizes are the film's own business — this is about the
       orb not jumping when the splash hands over.

       Measured, then reset, then measured again: `top` is in the frame's own
       units and the frame is scaled by fit(), so the correction has to be
       divided by that scale. Reading the scale off the canvas's own rendered
       height is what keeps this working at any zoom without knowing which of
       the two layout modes is running. Resetting to top0 first makes it
       idempotent, which matters because it re-runs on every resize. */
    var SPLASH_ENDS_AT = 430.9 / 874;
    function alignToSplash() {
      cv.style.top = top0 + 'px';
      var r = cv.getBoundingClientRect();
      if (!r.height) return;                  // not laid out yet; a resize will retry
      var scale = r.height / size;
      if (!scale) return;
      var have = r.top + r.height / 2;
      var want = SPLASH_ENDS_AT * innerHeight;
      cv.style.top = (top0 + (want - have) / scale) + 'px';
    }
    window.FLOW_ALIGN_ORB = alignToSplash;    // fit() calls this once it has scaled
    var hide = function (on) {
      hidden.forEach(function (el) { el.style.display = on ? 'none' : ''; });
    };
    hide(true);

    import('./splash/dotlottie.js').then(function (m) {
      m.DotLottie.setWasmUrl('splash/dotlottie-player.wasm');
      var p = new m.DotLottie({
        canvas: cv, src: 'splash/home.lottie',
        autoplay: true, loop: true,
        layout: { fit: 'contain', align: [0.5, 0.5] },
        renderConfig: { devicePixelRatio: Math.min(devicePixelRatio || 1, 2),
                        freezeOnOffscreen: true }
      });
      // if it cannot play, put the stills back rather than leaving a hole
      p.addEventListener('loadError', function () { cv.remove(); hide(false); });
    }).catch(function () { cv.remove(); hide(false); });
  })();

  /* Desktop two-column mode. See the note in flow.css for why. Structure:

       .scene-wrap > .scene-box > [Figma scene, at its own offsets]
       [gradient, stretched to the viewport]
       .left-col   > .left-in   > [everything above the gradient except the panel]
       .panel-col( = the Figma panel) > .panel-in > [its own children]

     Layers Figma stacks UNDER the scene are left where they are, so they stay
     hidden as designed — lifting them out was what surfaced a stray HUD badge
     and a second footer last time. */
  var D = window.FLOW_DESK, built = false;
  function build() {
    if (built || !D) return;
    var scene = document.querySelector('[data-node-id="' + D.scene + '"]');
    var grad  = document.querySelector('[data-node-id="' + D.grad  + '"]');
    var panel = document.querySelector('[data-node-id="' + D.panel + '"]');
    if (!scene || !grad || !panel) return;
    built = true;

    var root = scene.parentElement;
    root.classList.add('frame-root');

    var wrap = document.createElement('div'); wrap.className = 'scene-wrap';
    var box  = document.createElement('div'); box.className  = 'scene-box';
    root.insertBefore(wrap, scene); wrap.appendChild(box); box.appendChild(scene);

    grad.style.cssText = 'position:absolute;inset:0;background-image:' +
      getComputedStyle(grad).backgroundImage;
    root.insertBefore(grad, wrap.nextSibling);

    var left = document.createElement('div'); left.className = 'left-col';
    var lin  = document.createElement('div'); lin.className  = 'left-in';
    left.appendChild(lin); root.appendChild(left);

    var above = false;
    [].slice.call(root.children).forEach(function (n) {
      if (n === grad) { above = true; return; }
      if (n === wrap || n === panel || n === left) return;
      if (above) lin.appendChild(n);
    });

    var pin = document.createElement('div'); pin.className = 'panel-in';
    while (panel.firstChild) pin.appendChild(panel.firstChild);
    panel.appendChild(pin);
    panel.classList.add('panel-col');
    panel.style.width = ''; panel.style.height = ''; panel.style.right = ''; panel.style.top = '';
    root.appendChild(panel);
  }

  function desk() {
    build();
    if (!built) return;
    var vw = innerWidth, vh = innerHeight, FW = 1920, FH = 1080;
    var k = Math.min(vw / FW, vh / FH), kc = Math.max(vw / FW, vh / FH);
    function put(sel, cw, ow) {
      var el = document.querySelector(sel); if (!el) return;
      var w = el.parentElement.getBoundingClientRect().width;
      el.style.transform = 'translate(' + ((w - ow * cw) / 2) + 'px,' +
        ((vh - FH * cw) / 2) + 'px) scale(' + cw + ')';
    }
    var sb = document.querySelector('.scene-box');
    if (sb) sb.style.transform = 'translate(' + ((vw - FW * kc) / 2) + 'px,' +
      ((vh - FH * kc) / 2) + 'px) scale(' + kc + ')';
    put('.panel-in', k, 824);
    var li = document.querySelector('.left-in');
    if (li) {
      var lw = li.parentElement.getBoundingClientRect().width;
      li.style.transform = 'translate(' + (lw / 2 - 548 * k) + 'px,' +
        ((vh - FH * k) / 2) + 'px) scale(' + k + ')';
    }
  }
  var content = screenEl.querySelector('.content');
  var cs = getComputedStyle(document.documentElement);
  var W = parseFloat(cs.getPropertyValue('--w')) || 393;
  var H = parseFloat(cs.getPropertyValue('--h')) || 852;
  function fit() {
    if (D) { desk(); return; }
    var fw = innerWidth / W, fh = innerHeight / H;
    var contain = Math.min(fw, fh);
    var base = content ? Math.max(fw, fh) : contain;
    screenEl.style.transform = 'translate(-50%,-50%) scale(' + base + ')';
    if (content) content.style.transform = 'scale(' + contain / base + ')';
  }
  /* fit() first, then the orb: the alignment reads the live scale off the
     page, so it is only correct once the frame has been scaled for this size. */
  function layout() {
    fit();
    if (window.FLOW_ALIGN_ORB) window.FLOW_ALIGN_ORB();
  }
  addEventListener('resize', layout);
  addEventListener('orientationchange', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(document.documentElement);
  layout();
})();
