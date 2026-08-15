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
