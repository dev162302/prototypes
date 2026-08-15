/* Cover the background, contain the content — see the note in flow.css.
   ResizeObserver as well as the events: on iOS Safari 'resize' is not
   dependable around rotation and the collapsing URL bar, and the URL bar is
   exactly what changes the height here. */
(function () {
  var screenEl = document.getElementById('screen');
  if (!screenEl) return;
  var content = screenEl.querySelector('.content');
  var W = 393, H = 852;
  function fit() {
    var fw = innerWidth / W, fh = innerHeight / H;
    var cover = Math.max(fw, fh), contain = Math.min(fw, fh);
    screenEl.style.transform = 'translate(-50%,-50%) scale(' + cover + ')';
    if (content) content.style.transform = 'scale(' + contain / cover + ')';
  }
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.documentElement);
  fit();
})();
