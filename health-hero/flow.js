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
  /* Both CTA labels are listed on purpose. The leaderboard's button was renamed
     to FIND OUT MORE at the client's request; the run-ended screens still say
     Learn More. Matching on the label is what makes this survive re-exports —
     and it is also why renaming a button silently breaks its link unless the
     new wording is added here. That is exactly how FIND OUT MORE shipped dead. */
  /* d-leaderboard and leaderboard are one screen at two breakpoints; the form
     factor is already recorded on the session, so they collapse here. */
  /* .html is OPTIONAL here: Cloudflare Pages serves these as clean URLs, so
     the same document is /run-ended live and /run-ended.html locally. Matching
     only the extension form worked in local testing and produced a null screen
     on the deployment, which is the one place it matters. */
  var SCREEN = (location.pathname.match(/([^\/]+?)(?:\.html)?$/) || [, ''])[1].replace(/^d-/, '');
  if (SCREEN === 'run-ended') SCREEN = 'ended';
  else if (SCREEN === 'leaderboard') SCREEN = 'board';

  var SLUG = {
    'click here': 'privacy',
    'learn more': 'learn_more',
    'find out more': 'find_out_more',
    'play again': 'play_again',
    'leaderboard': 'leaderboard'
  };

  var LINKS = [
    ['click here', 'https://www.novonordisk.com/data-privacy-and-user-rights/privacy-policy.html'],
    /* Client-supplied campaign link, carrying their cid for attribution.
       Written in punycode rather than as über-gewicht.de: identical
       destination, but it cannot be mangled by a server that serves this file
       without a charset. Browsers still show the umlaut in the address bar. */
    ['learn more', 'http://xn--ber-gewicht-shb.de/health-hero?cid=nnref-imkrgak59x'],
    ['find out more', 'http://xn--ber-gewicht-shb.de/health-hero?cid=nnref-imkrgak59x']
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
        /* Keyed on SCREEN, not on the label. Both Learn More buttons point at
           the same URL so the destination cannot separate them, and the labels
           have already been renamed twice — one of those renames is what
           silently killed this very link. The screen is structural.

           target="_blank" means the click does not unload the page, so this
           rides the normal flush and needs no beacon. */
        a.addEventListener('click', function () {
          try {
            if (parent !== window && parent.__t) {
              parent.__t('cta', { screen: SCREEN, label: SLUG[label] || null });
            }
          } catch (e) {}
        });
        a.style.cssText = 'display:contents;cursor:pointer;color:inherit;text-decoration:inherit';
        t.parentElement.insertBefore(a, t);
        a.appendChild(t);
      });
    });
  }
  wireLinks();

  /* Tag each CTA with its family, so the interaction states in flow.css can
     treat them differently — the blue plate lightens on hover, the white ones
     tint blue, which are opposite moves in luminance.

     By LABEL, like wireLinks above, and for the same reason: node ids change
     whenever a screen is re-exported and the wording does not. Anything not
     matched here — the name field, most obviously — is left untagged and falls
     back to the plain brightness rule, which suits its navy and red plates. */
  var PRIMARY = /^(learn more|find out more)$/;
  var SECONDARY = /^(play again|leaderboard)$/;
  [].forEach.call(document.querySelectorAll('[data-name="Button"]'), function (b) {
    var t = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
              .replace(/[.↻↗\s]+$/, '');
    if (PRIMARY.test(t)) b.setAttribute('data-cta', 'primary');
    else if (SECONDARY.test(t)) b.setAttribute('data-cta', 'secondary');
    else return;
    /* Play Again and Leaderboard are real anchors nowhere — the host wires
       their behaviour — so they are tracked here alongside the outbound ones,
       and by the same screen key. Replay rate is the retention signal. */
    b.addEventListener('click', function () {
      try {
        if (parent !== window && parent.__t) {
          parent.__t('cta', { screen: SCREEN, label: SLUG[t] || null });
        }
      } catch (e) {}
    });
    markFace(b);
  });

  /* Find the button's inner FACE and mark it, so a state change lands on the
     face alone and leaves the raised border alone.

     A state applied to the whole button tints its bevel too, which reads as
     the entire chip changing colour rather than the face lighting up — the
     frame keeps that border constant in every state.

     Found by area, not by node id or order: the artwork is 28 slices, and in
     every button the largest is the full outline and the SECOND largest is the
     face inset within it. Measured across all four CTAs it is 100% then 77%
     every time, so the ranking is a property of how these are drawn rather
     than a coincidence worth hard-coding around. */
  function markFace(btn) {
    var bb = btn.getBoundingClientRect();
    if (!bb.width || !bb.height) return;          // hidden right now; skip
    var imgs = [].slice.call(btn.querySelectorAll('img')).map(function (im) {
      var r = im.getBoundingClientRect();
      return { el: im, area: r.width * r.height };
    }).sort(function (a, b2) { return b2.area - a.area; });
    if (imgs.length < 2) return;
    var face = imgs[1].el.parentElement || imgs[1].el;
    var outline = imgs[0].el.parentElement || imgs[0].el;
    face.setAttribute('data-face', '');
    outline.setAttribute('data-outline', '');
    /* The label has to stay above both. Lifting the face over the bevels also
       lifted it over the text, which vanished on hover. */
    var p = btn.querySelector('p');
    if (p && p.parentElement) p.parentElement.setAttribute('data-label', '');
    // the overlays need a positioned box to sit in
    [face, outline].forEach(function (el) {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    });
  }
  /* The name field is tagged by the host, not here — its label changes as you
     use it, so it cannot be matched by wording. It still needs its face found,
     so the host calls back into this once it has tagged it. */
  window.__markFace = markFace;

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
    cv.style.cssText =
      'position:absolute;pointer-events:none;left:' + (cx - size / 2) + 'px;top:' +
      (cy - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px';
    orb.parentElement.insertBefore(cv, orb);
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

      /* The orb is not just a pulse — it carries a ripple ring that expands out
         of it on a 32-frame loop. This starts as soon as the intro loads, which
         is several seconds before the splash actually hands over, so by then it
         is at an arbitrary point in its cycle: the film ends with no ring, and
         whatever arc the loop happens to be mid-way through appears out of
         nowhere at the cut. Matching the orb's position and size does not help
         with that, because it is not the orb that is mismatched.

         So the host rewinds the loop as the handover begins. Both sides are
         then ring-free at the moment they overlap most, and the ring grows in
         afterwards as its own beat rather than arriving as a jump. */
      window.__orb = p;   // handle for measuring the loop frame by frame
      window.__orbResync = function (frame, holdMs) {
        try {
          /* Pinned, not just rewound. The loop runs at 24fps, so a 420ms
             dissolve advances it ten frames — far enough for the ring to swing
             back out of agreement while the splash is still partly visible.
             Holding the phase for the length of the dissolve keeps both sides
             identical the whole way across, and the ripple resumes once there
             is nothing left to disagree with. */
          p.setFrame(frame || 0);
          p.pause();
          setTimeout(function () { try { p.play(); } catch (e) {} }, holdMs || 0);
        } catch (e) {}
      };
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
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.documentElement);
  fit();
})();
