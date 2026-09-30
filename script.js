/* =========================================================
   SIGHTCITY TOUR & TRAVELS — shared script
   Vanilla apart from GSAP. Nothing here is required for the
   page to be readable or for a customer to call.
   ========================================================= */
(function () {
  'use strict';

  /* =======================================================
     EDIT YOUR DETAILS HERE
     These drive every JS-generated link (WhatsApp messages,
     footer email). The plain tel: links in the HTML are listed
     in README.md — change those with find-and-replace.
     ======================================================= */
  var BIZ = {
    phonePrimary:   '8077198576',
    phoneSecondary: '8979698864',
    whatsapp:       '918077198576',          // country code, no +
    email:          'your-email@example.com' // TODO ← replace with the real address
  };

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* =======================================================
     1. HEADER — solid once past the hero media
     ======================================================= */
  var head = $('.topbar');
  if (head) {
    var onScroll = function () {
      head.classList.toggle('is-solid', window.scrollY > 60);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* =======================================================
     2. MOBILE NAV
     ======================================================= */
  var burger = $('.burger');
  var nav = $('.nav');
  var scrim = $('.nav-scrim');

  function setNav(open) {
    if (!burger || !nav) return;
    burger.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    if (scrim) scrim.classList.toggle('is-on', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) {
    burger.addEventListener('click', function () {
      setNav(burger.getAttribute('aria-expanded') !== 'true');
    });
  }
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  $$('.nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setNav(false);
  });

  /* =======================================================
     3. ACCORDIONS
     ======================================================= */
  $$('.acc__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* =======================================================
     4. ENQUIRY → WHATSAPP
     Builds a message that reads cleanly in the owner's chat list.
     ======================================================= */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function prettyDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function prettyTime(t) {
    if (!t) return '';
    var p = t.split(':');
    var h = parseInt(p[0], 10);
    var m = p[1] || '00';
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + ap;
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function setError(field, msg) {
    if (!field) return;
    var box = field.closest('.field');
    if (!box) return;
    box.classList.toggle('has-error', !!msg);
    var e = $('.err', box);
    if (e) e.textContent = msg || '';
    field.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  $$('.enq__form').forEach(function (form) {
    var service = $('[name="service"]', form);
    var date    = $('[name="date"]', form);
    var time    = $('[name="time"]', form);
    var persons = $('[name="persons"]', form);
    var name    = $('[name="name"]', form);

    /* no past dates */
    if (date) date.min = todayISO();

    /* per-page default service, e.g. data-service="Package (Chardham Yatra)" */
    var preset = form.getAttribute('data-service');
    if (preset && service) {
      for (var i = 0; i < service.options.length; i++) {
        if (service.options[i].value === preset) { service.selectedIndex = i; break; }
      }
    }

    /* persons stepper */
    $$('[data-step]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = parseInt(persons.value, 10);
        if (isNaN(v)) v = 1;
        v += parseInt(b.getAttribute('data-step'), 10);
        if (v < 1) v = 1;
        if (v > 60) v = 60;
        persons.value = v;
      });
    });

    /* clear errors as the user fixes them */
    [service, date, time, persons].forEach(function (el) {
      if (el) el.addEventListener('change', function () { setError(el, ''); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;

      if (!service.value) { setError(service, 'Please choose a service.'); ok = false; }

      if (!date.value) {
        setError(date, 'Please pick a date.'); ok = false;
      } else if (date.value < todayISO()) {
        setError(date, 'Please pick today or a later date.'); ok = false;
      } else {
        setError(date, '');
      }

      var pv = parseInt(persons.value, 10);
      if (isNaN(pv) || pv < 1) { setError(persons, 'At least 1 person.'); ok = false; }

      if (!ok) {
        var bad = $('.field.has-error .ctrl', form);
        if (bad) { bad.focus(); }
        return;
      }

      var when = prettyDate(date.value);
      if (time.value) when += ', ' + prettyTime(time.value);

      var lines = [
        'Namaste! Enquiry from Sightcity website',
        '',
        'Service : ' + service.value,
        'Date    : ' + when,
        'Persons : ' + pv
      ];
      if (name && name.value.trim()) lines.push('Name    : ' + name.value.trim());

      /* tells the owner which page the enquiry came from — a "Package"
         enquiry from the Chardham page means something different to one
         from the adventure page */
      var origin = form.getAttribute('data-page');
      if (origin) { lines.push(''); lines.push('(sent from the ' + origin + ' page)'); }

      var url = 'https://wa.me/' + BIZ.whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));
      window.open(url, '_blank', 'noopener');
    });
  });

  /* =======================================================
     5. HERO CHIPS + SERVICE DEEP LINKS
     Pre-fill the enquiry service, then scroll to the card.
     ======================================================= */
  $$('[data-fill]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var want = el.getAttribute('data-fill');
      var form = $('.enq__form');
      if (!form) return;
      e.preventDefault();
      var sel = $('[name="service"]', form);
      if (sel) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === want) { sel.selectedIndex = i; break; }
        }
      }
      var target = $('#enquiry');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(function () {
        var d = $('[name="date"]', form);
        if (d) d.focus({ preventScroll: true });
      }, 650);
    });
  });

  /* =======================================================
     6. FOOTER EMAIL from config
     ======================================================= */
  $$('[data-email]').forEach(function (el) {
    el.setAttribute('href', 'mailto:' + BIZ.email);
    if (!el.textContent.trim()) el.textContent = BIZ.email;
  });

  /* =======================================================
     7. MOTION
     Gated three ways: reduced-motion, GSAP present, and no
     errors. If any gate fails the page simply stays static
     and fully visible — .js-motion is never added.
     ======================================================= */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =======================================================
     LINE SPLITTER
     Wraps each visual line of a heading in its own mask so it can wipe up
     independently. The copy is fixed but the wrap point is not, so lines are
     measured at runtime rather than authored: words are wrapped, grouped by
     the offsetTop they land on, then rebuilt as masked lines.
     ======================================================= */
  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function splitLines(el) {
    var source = el.getAttribute('data-text');
    if (source === null) {
      source = el.textContent.replace(/\s+/g, ' ').trim();
      el.setAttribute('data-text', source);   /* keep the original for re-splits */
    }
    if (!source) return;

    /* pass 1 — measure where the browser actually breaks */
    el.innerHTML = source.split(' ').map(function (w) {
      return '<span class="wd">' + esc(w) + '</span>';
    }).join(' ');

    var lines = [], cur = null, top = null;
    $$('.wd', el).forEach(function (w) {
      var t = Math.round(w.offsetTop);
      if (t !== top) { cur = []; lines.push(cur); top = t; }
      cur.push(w.textContent);
    });

    /* pass 2 — rebuild as masked lines */
    el.innerHTML = lines.map(function (words, i) {
      /* trailing space on every line but the last: laid out as collapsed
         whitespace, but keeps textContent readable for screen readers and
         for anyone copying the heading */
      var tail = (i < lines.length - 1) ? ' ' : '';
      return '<span class="ln" style="--i:' + i + '"><span>' + esc(words.join(' ')) + tail + '</span></span>';
    }).join('');
  }

  /* Re-split on resize: the wrap point moves, and a stale split would mask
     the wrong words. Anything already revealed is restored immediately. */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!window.__scMotion) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      $$('.h-sec').forEach(function (el) {
        var wasIn = el.classList.contains('is-in');
        el.classList.remove('is-in');
        splitLines(el);
        if (wasIn) { void el.offsetWidth; el.classList.add('is-in'); }
      });
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }, 200);
  });

  /* Nothing below may leave content hidden. The inline script in <head> adds
     .js-motion (which hides the hero for the entrance) and starts a failsafe
     timer; if we do not claim the flag below, that timer unhides everything. */
  function unhide() {
    document.documentElement.classList.remove('js-motion');
  }

  function initMotion() {
    if (reduced.matches) { unhide(); return; }
    if (!window.gsap || !window.ScrollTrigger) { unhide(); return; }

    var gsap = window.gsap;

    try {
      gsap.registerPlugin(window.ScrollTrigger);
      /* tells the head-script failsafe that motion is genuinely running */
      window.__scMotion = true;

    /* The hero is a filmstrip carousel now and owns its own motion —
       see assets/js/hero.js. Nothing hero-specific belongs here. */


    /* --- scroll reveals --- */
    $$('.reveal').forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0, duration: .8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true }
        }
      );
    });

    /* --- the label signature: rule draws out after the text settles ---
       One gesture repeated in every section. Repetition is what reads as
       authored; this is the cheapest, highest-value item in the whole plan. */
    $$('.label').forEach(function (el) {
      window.ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: function () { el.classList.add('is-in'); }
      });
    });

    /* --- section headings wipe up line by line ---
       Same vocabulary as the hero headline, so the body opens in the voice
       the hero closed in. */
    $$('.h-sec').forEach(function (el) {
      splitLines(el);
      window.ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: function () { el.classList.add('is-in'); }
      });
    });

    /* supporting copy beside or beneath a heading follows it in */
    $$('.sec-head--split .side, .sec-head--center .lede').forEach(function (el) {
      gsap.fromTo(el, { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: .7, delay: .12, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });

    /* --- direction-aware cascades ---
       Every grid arrives in the order its own layout implies, instead of one
       generic bottom-up rise. This is what kills the monotony. */
    $$('[data-stagger]').forEach(function (group) {
      var kids = Array.prototype.slice.call(group.children);
      if (!kids.length) return;
      var kind = group.getAttribute('data-stagger') || 'even';
      var trig = { trigger: group, start: 'top 85%', once: true };

      if (kind === 'fan') {
        /* dealt cards: each starts a little lower than the last */
        kids.forEach(function (card, i) {
          gsap.fromTo(card, { opacity: 0, y: 30 + i * 12 },
            { opacity: 1, y: 0, duration: .85, delay: i * .1, ease: 'power3.out',
              scrollTrigger: trig });
        });

      } else if (kind === 'sides') {
        /* the 55/45 bento converges: each tile enters from its own column */
        kids.forEach(function (tile, i) {
          var fromLeft = (i % 2 === 0);
          gsap.fromTo(tile, { opacity: 0, x: fromLeft ? -36 : 36, y: 14 },
            { opacity: 1, x: 0, y: 0, duration: .8, delay: Math.floor(i / 2) * .12,
              ease: 'power3.out', scrollTrigger: trig });
        });

      } else if (kind === 'center') {
        /* a centred header deserves a symmetrical grid: outward from the middle */
        gsap.fromTo(kids, { opacity: 0, y: 22, scale: .985 },
          { opacity: 1, y: 0, scale: 1, duration: .8, ease: 'power2.out',
            stagger: { each: .09, from: 'center' }, scrollTrigger: trig });

      } else {
        /* 'even' — deliberately the calmest on the page. Confidence reads
           as unhurried, so the trust cards simply arrive. */
        gsap.fromTo(kids, { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: .9, stagger: .12, ease: 'power2.out',
            scrollTrigger: trig });
      }
    });

    /* --- trust strip: a quick left-to-right read, then the chips --- */
    var trustItems = $$('.trustbar .trust__i');
    if (trustItems.length) {
      gsap.fromTo(trustItems, { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .5, stagger: .07, ease: 'power2.out',
          scrollTrigger: { trigger: '.trustbar', start: 'top 95%', once: true } });
      gsap.fromTo($$('.trustbar .chip'), { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: .5, delay: .22, stagger: .05, ease: 'power2.out',
          scrollTrigger: { trigger: '.trustbar', start: 'top 95%', once: true } });
    }

    /* --- image settle: 1.08 → 1 as the card enters --- */
    $$('[data-settle] img').forEach(function (img) {
      gsap.fromTo(img,
        { scale: 1.08 },
        {
          scale: 1, duration: 1.4, ease: 'power2.out',
          scrollTrigger: { trigger: img, start: 'top 90%', once: true }
        }
      );
    });

    /* --- step rail fills as the block scrolls past --- */
    var rail = document.querySelector('.steps__list');
    if (rail) {
      gsap.fromTo(rail, { '--p': 0 }, {
        '--p': 1, ease: 'none',
        scrollTrigger: { trigger: rail, start: 'top 72%', end: 'bottom 62%', scrub: true }
      });
    }

    /* --- step block: the tint travels between steps --- */
    var steps = $$('.step');
    if (steps.length) {
      steps.forEach(function (step, i) {
        window.ScrollTrigger.create({
          trigger: step,
          start: 'top 62%',
          end: 'bottom 45%',
          onToggle: function (self) {
            if (self.isActive) {
              steps.forEach(function (s) { s.classList.remove('is-active'); });
              step.classList.add('is-active');
            }
          }
        });
      });
    }

    } catch (err) {
      /* any failure mid-setup would otherwise leave the hero headline and
         both CTAs permanently invisible — fail open instead */
      window.__scMotion = false;
      /* keep the reason around — a silently swallowed failure here is very
         hard to diagnose later, and costs nothing to record */
      window.__scMotionError = (err && err.message) || String(err);
      unhide();
      if (window.ScrollTrigger) {
        window.ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
      }
    }
  }

  /* All four scripts are deferred and run in document order, so GSAP is
     already present here — no need to wait for load, which would mean a
     visible jump on a slow connection. If the CDN failed, window.gsap is
     simply undefined and initMotion unhides and returns. */
  initMotion();

  /* images change layout height, so recompute trigger positions once they land */
  window.addEventListener('load', function () {
    if (window.__scMotion && window.ScrollTrigger) window.ScrollTrigger.refresh();
  });

  /* if the user flips reduced-motion on, stop everything and restore */
  var onReduce = function () {
    if (reduced.matches) {
      document.documentElement.classList.remove('js-motion');
      if (window.ScrollTrigger) window.ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
    }
  };
  if (reduced.addEventListener) reduced.addEventListener('change', onReduce);
  else if (reduced.addListener) reduced.addListener(onReduce);

  /* =======================================================
     8. FOOTER YEAR
     ======================================================= */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
