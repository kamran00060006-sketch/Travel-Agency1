/* =========================================================
   SIGHTCITY — hero filmstrip carousel
   Homepage only. Vanilla, no dependencies.

   Every card shares one top edge. The focused card unfurls to full
   height while its neighbours stay clipped to half. Changing focus
   slides the track so the focused card lands dead centre, and
   crossfades the background to that photo.

   Geometry is measured, never hard-coded: one ResizeObserver reads
   the stage and every size is written back as a CSS custom property
   as a ratio of it.

   Nothing here is required to reach a phone number. If this script
   fails, the markup still shows the first photo, the headline, and
   both CTAs.
   ========================================================= */
(function () {
  'use strict';

  var stage = document.querySelector('.hcar');
  if (!stage) return;

  var track   = stage.querySelector('.hcar__track');
  var cards   = Array.prototype.slice.call(stage.querySelectorAll('.hcar__card'));
  var titleEl = stage.querySelector('.hcar__title');
  var credEl  = stage.querySelector('.hcar__credit');
  var idxEl   = stage.querySelector('.hcar__i');
  var fillEl  = stage.querySelector('.hcar__fill');
  var bgs     = Array.prototype.slice.call(stage.querySelectorAll('.hcar__bgimg'));
  if (!track || cards.length === 0 || bgs.length < 2) return;

  /* ---- ratios, lifted from the reference layout ---- */
  var CARD_H    = 0.264;   // active card height / stage height
  var CARD_AR   = 0.75;    // active card is 3:4
  var GAP_R     = 0.038;   // gap / card width
  var TITLE_R   = 0.067;   // headline cap size / stage height
  var LABEL_R   = 0.0103;  // mono label / stage height
  var PAD_R     = 0.017;   // gutter / stage width
  var TITLE_W   = 0.085;   // headline cap size / stage WIDTH (the wrap guard)

  var WHEEL_THRESHOLD = 60;
  var WHEEL_COOLDOWN  = 420;
  var AUTOPLAY_MS     = 6000;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var last    = cards.length - 1;
  var index   = 0;
  var box     = { w: 0, h: 0 };
  var step    = 0, cardW = 0;
  var bgSlot  = 0;

  var clamp = function (n, lo, hi) { return Math.min(hi, Math.max(lo, n)); };

  /* Phones get the narrower background. Decided once — swapping sources
     mid-session would re-download photos the visitor already has. */
  var useSmall = window.matchMedia('(max-width: 820px)').matches;
  var srcFor = function (card) {
    return useSmall ? card.getAttribute('data-src-small') : card.getAttribute('data-src');
  };

  /* ---------- measurement ---------- */
  function measure() {
    box.w = stage.clientWidth;
    box.h = stage.clientHeight;
    if (!box.w || !box.h) return;

    var fullH = clamp(box.h * CARD_H, 96, 360);
    cardW = Math.round(fullH * CARD_AR);
    var gap = Math.max(4, Math.round(cardW * GAP_R));
    step = cardW + gap;

    var s = stage.style;
    s.setProperty('--fh', Math.round(fullH) + 'px');
    s.setProperty('--hh', Math.round(fullH / 2) + 'px');
    s.setProperty('--cw', cardW + 'px');
    s.setProperty('--gap', gap + 'px');
    s.setProperty('--pad', Math.max(16, Math.round(box.w * PAD_R)) + 'px');
    s.setProperty('--label', Math.max(9, Math.round(box.h * LABEL_R)) + 'px');
    /* Height alone sizes the headline far too large on a phone, where the
       stage is tall and narrow — the longest line then wraps and shoves the
       block up under the header. Take whichever axis is more restrictive. */
    var title = Math.min(box.h * TITLE_R, box.w * TITLE_W);
    s.setProperty('--title', Math.max(24, Math.round(title)) + 'px');
    s.setProperty('--stage-h', box.h + 'px');

    slide(false);
  }

  /* x that centres card i */
  function xFor(i) { return box.w / 2 - (i * step + cardW / 2); }

  function slide(animate) {
    if (!animate) track.style.transition = 'none';
    track.style.transform = 'translate3d(' + xFor(index) + 'px,0,0)';
    if (!animate) {
      /* force the style to land before transitions come back */
      void track.offsetWidth;
      track.style.transition = '';
    }
  }

  /* ---------- background crossfade ---------- */
  function paintBG(i) {
    var next = bgs[1 - bgSlot];
    var cur  = bgs[bgSlot];
    var url  = srcFor(cards[i]);
    if (next.getAttribute('src') === url) {
      /* already the right photo — just bring it forward */
      next.classList.add('is-on'); cur.classList.remove('is-on');
      bgSlot = 1 - bgSlot;
      return;
    }
    var img = new Image();
    img.onload = function () {
      next.src = url;
      next.classList.remove('is-on');
      void next.offsetWidth;          // restart the drift animation
      next.classList.add('is-on');
      cur.classList.remove('is-on');
      bgSlot = 1 - bgSlot;
    };
    img.src = url;
  }

  /* Pull the neighbours in early so a step never waits on the network. */
  function preloadAround(i) {
    [i - 1, i + 1].forEach(function (j) {
      if (j < 0 || j > last) return;
      var im = new Image();
      im.src = srcFor(cards[j]);
    });
  }

  /* ---------- headline ---------- */
  function paintText(i) {
    var card  = cards[i];
    var title = card.getAttribute('data-title') || '';
    var cred  = card.getAttribute('data-credit') || '';

    titleEl.classList.remove('is-in');
    credEl.classList.remove('is-in');
    titleEl.innerHTML = '';

    var parts = title.split('\n');
    parts.forEach(function (line, n) {
      var outer = document.createElement('span');
      outer.className = 'ln';
      outer.style.setProperty('--i', n);
      var inner = document.createElement('span');
      /* keep a space between lines so the h1 does not read as one run-on
         word to a screen reader; it collapses visually */
      inner.textContent = (n < parts.length - 1) ? line + ' ' : line;
      outer.appendChild(inner);
      titleEl.appendChild(outer);
    });
    credEl.textContent = cred;

    void titleEl.offsetWidth;         // commit the reset before animating in
    titleEl.classList.add('is-in');
    credEl.classList.add('is-in');
  }

  /* ---------- focus change ---------- */
  function go(next) {
    next = clamp(next, 0, last);
    if (next === index) { slide(true); return; }
    index = next;

    cards.forEach(function (c, i) {
      c.setAttribute('aria-current', i === index ? 'true' : 'false');
      c.setAttribute('tabindex', i === index ? '0' : '-1');
    });

    slide(true);
    paintBG(index);
    paintText(index);
    preloadAround(index);

    if (idxEl) idxEl.textContent = String(index + 1).padStart(2, '0');
    if (fillEl) fillEl.style.left = (index / cards.length) * 100 + '%';
  }

  /* ---------- input: click ---------- */
  cards.forEach(function (c, i) {
    c.addEventListener('click', function () { if (!moved) go(i); });
  });

  /* ---------- input: keyboard ---------- */
  stage.addEventListener('keydown', function (e) {
    var map = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last };
    if (!(e.key in map)) return;
    e.preventDefault();
    go(map[e.key]);
  });

  /* ---------- input: wheel / trackpad ---------- */
  var acc = 0, until = 0;
  stage.addEventListener('wheel', function (e) {
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    /* Scroll chaining: once the strip is against an end, hand the gesture back
       to the page. Without this a tall carousel is a scroll trap. */
    if ((d > 0 && index === last) || (d < 0 && index === 0)) { acc = 0; return; }
    e.preventDefault();
    if (e.timeStamp < until) return;
    acc += d;
    if (Math.abs(acc) < WHEEL_THRESHOLD) return;
    go(index + (acc > 0 ? 1 : -1));
    acc = 0;
    until = e.timeStamp + WHEEL_COOLDOWN;
  }, { passive: false });

  /* ---------- input: drag / swipe ---------- */
  var down = false, moved = false, startX = 0, startT = 0, baseX = 0, lastX = 0, lastT = 0;

  track.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    down = true; moved = false;
    startX = lastX = e.clientX;
    startT = lastT = e.timeStamp;
    baseX = xFor(index);
    track.classList.add('is-drag');
    track.setPointerCapture && track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    lastX = e.clientX; lastT = e.timeStamp;
    track.style.transform = 'translate3d(' + (baseX + dx) + 'px,0,0)';
  });

  function endDrag(e) {
    if (!down) return;
    down = false;
    track.classList.remove('is-drag');
    var dx = e.clientX - startX;
    var dt = Math.max(1, e.timeStamp - lastT + (lastT - startT));
    var vel = (lastX - startX) / dt * 1000;           // px per second
    /* land on whatever card the release sits nearest, nudged by throw
       velocity so a flick clears more than one card */
    var thrown = baseX + dx + vel * 0.12;
    go(Math.round((box.w / 2 - thrown - cardW / 2) / step));
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', function () {
    if (!down) return;
    down = false; track.classList.remove('is-drag'); slide(true);
  });

  /* stop a drag-release from also firing the card's click */
  track.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- autoplay, paused on any interaction ---------- */
  var timer = null, paused = false;
  function tick() {
    if (paused || down || reduced.matches || cards.length < 2) return;
    go(index === last ? 0 : index + 1);
  }
  function restart() {
    if (timer) clearInterval(timer);
    if (reduced.matches) return;
    timer = setInterval(tick, AUTOPLAY_MS);
  }
  ['pointerenter', 'focusin'].forEach(function (ev) {
    stage.addEventListener(ev, function () { paused = true; });
  });
  ['pointerleave', 'focusout'].forEach(function (ev) {
    stage.addEventListener(ev, function () { paused = false; });
  });

  /* ---------- boot ---------- */
  if (window.ResizeObserver) {
    new ResizeObserver(measure).observe(stage);
  } else {
    window.addEventListener('resize', measure);
  }
  measure();

  cards.forEach(function (c, i) {
    c.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    c.setAttribute('tabindex', i === 0 ? '0' : '-1');
  });
  paintBG(0);
  paintText(0);
  preloadAround(0);
  if (fillEl) fillEl.style.left = '0%';
  restart();

  reduced.addEventListener && reduced.addEventListener('change', function () {
    if (reduced.matches && timer) { clearInterval(timer); timer = null; }
    else restart();
  });
})();
