/* =========================================================
   SIGHTCITY — WebGL fluid cursor, whole site
   A trimmed Navier-Stokes solver in the manner of Pavel Dobryakov's
   WebGL-Fluid-Simulation: advect → curl → vorticity → divergence →
   Jacobi pressure → gradient subtract → display. Bloom and sunrays are
   left out; they are expensive and would fight the photography.

   ONE fixed full-screen canvas for the whole page, above the content and
   pointer-events:none, so it never intercepts a click, a link, a phone
   number or a form field.

   Readability on both dark and light sections is handled with real alpha
   compositing rather than a blend mode. `screen` only ever lightens, so it
   vanished on the white sections; `overlay` pushes the wrong way on a dark
   backdrop. Instead the dye carries a hue and the shader emits a low alpha,
   and the hue is chosen from the section under the cursor:
     · over dark bands  → pale mist (white / pale blue)
     · over light bands → deeper brand tones (royal blue, a little saffron)
   Alpha is hard-capped so text, prices and inputs stay legible.

   Every failure path ends with the site looking exactly as it does without
   this file:
     · reduced motion / <1024px / coarse pointer → never starts
     · no WebGL, no float targets, software renderer → nothing injected
     · tab hidden, or pointer idle → simulation stops
     · sustained slow frames → drops resolution, then removes itself
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- gates, cheapest first ---------------- */
  if (!window.matchMedia) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(min-width: 1024px)').matches) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;

  /* Sections whose background is dark. Anything else is treated as light.
     Hue is picked per splat from whichever the cursor is over. */
  var DARK_ZONES = '.hcar, .pagehead, .closing, .site-foot, .topbar';

  /* Hues are stored normalised (max channel = 1) so the shader can separate
     colour from strength — the stored intensity drives alpha alone. */
  var MIST = [               /* over dark bands */
    [0.95, 0.97, 1.00],
    [0.65, 0.80, 1.00],
    [0.74, 0.86, 1.00]
  ];
  var MIST_SAFFRON = [1.00, 0.72, 0.34];

  var INK = [                /* over light bands — deeper, or it disappears */
    [0.13, 0.34, 1.00],
    [0.22, 0.42, 1.00],
    [0.30, 0.50, 0.98]
  ];
  var INK_SAFFRON = [1.00, 0.63, 0.16];

  var CONFIG = {
    SIM_RESOLUTION: 96,
    DYE_RESOLUTION: 384,
    DENSITY_DISSIPATION: 2.6,   /* a trail, not a painting */
    VELOCITY_DISSIPATION: 2.0,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 14,
    CURL: 11,
    SPLAT_RADIUS: 0.15,
    SPLAT_FORCE: 4000,
    MAX_DPR: 1,                 /* the effect is soft; retina buys nothing */

    INTENSITY_DARK: 0.13,       /* → alpha over dark sections */
    INTENSITY_LIGHT: 0.15,      /* → alpha over light sections */
    MAX_ALPHA: 0.16,            /* hard ceiling; content always wins */

    IDLE_MS: 2500,              /* pointer still this long → wind down */
    DRAIN_MS: 1400              /* keep stepping so the trail fades out */
  };

  var quality = document.body.getAttribute('data-fluid-quality');
  if (quality === 'low')  { CONFIG.SIM_RESOLUTION = 64;  CONFIG.DYE_RESOLUTION = 256; CONFIG.PRESSURE_ITERATIONS = 10; }
  if (quality === 'high') { CONFIG.SIM_RESOLUTION = 128; CONFIG.DYE_RESOLUTION = 512; }

  function whenIdle(fn) {
    (window.requestIdleCallback || function (f) { setTimeout(f, 250); })(fn, { timeout: 2000 });
  }
  if (document.readyState === 'complete') whenIdle(boot);
  else window.addEventListener('load', function () { whenIdle(boot); });

  function boot() {
    var canvas = document.createElement('canvas');
    canvas.className = 'sc-fluid';
    canvas.setAttribute('aria-hidden', 'true');

    var gl, ext;
    try {
      var params = { alpha: true, premultipliedAlpha: false, depth: false, stencil: false,
                     antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
      gl = canvas.getContext('webgl2', params);
      var isWebGL2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
      if (!gl) return;
      ext = getExtensions(gl, isWebGL2);
      if (!ext) return;
      /* Chrome falls back to SwiftShader when the GPU is blocklisted or the
         driver is broken. That rasterises every GL op on the CPU — measured at
         ~10fps under load, which looks worse than no effect at all. */
      if (isSoftwareRenderer(gl)) return;
    } catch (e) { return; }

    document.body.appendChild(canvas);

    var sim;
    try { sim = createSim(gl, ext, canvas); }
    catch (e) { canvas.remove(); return; }
    if (!sim) { canvas.remove(); return; }

    /* ---------------- pointer ---------------- */
    var pointer = { x: .5, y: .5, dx: 0, dy: 0, moved: false, color: pickFor(false), primed: false };
    var lastMove = 0, lastHue = 0;

    function overDark(cx, cy) {
      /* the canvas is pointer-events:none, so this reads the real content */
      var el = document.elementFromPoint(cx, cy);
      return !!(el && el.closest && el.closest(DARK_ZONES));
    }

    function pickFor(dark) {
      var saffron = Math.random() < 0.12;          /* a touch, never a theme */
      var hue, intensity;
      if (dark) {
        hue = saffron ? MIST_SAFFRON : MIST[(Math.random() * MIST.length) | 0];
        intensity = CONFIG.INTENSITY_DARK * (saffron ? 0.75 : 1);
      } else {
        hue = saffron ? INK_SAFFRON : INK[(Math.random() * INK.length) | 0];
        intensity = CONFIG.INTENSITY_LIGHT * (saffron ? 0.8 : 1);
      }
      return { r: hue[0] * intensity, g: hue[1] * intensity, b: hue[2] * intensity };
    }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var w = window.innerWidth, h = window.innerHeight;
      var x = e.clientX / w;
      var y = 1.0 - e.clientY / h;
      if (!pointer.primed) { pointer.x = x; pointer.y = y; pointer.primed = true; }
      pointer.dx = (x - pointer.x) * CONFIG.SPLAT_FORCE;
      pointer.dy = (y - pointer.y) * CONFIG.SPLAT_FORCE;
      pointer.x = x; pointer.y = y;
      pointer.moved = true;

      var now = performance.now();
      /* re-roll hue periodically, and immediately re-read the zone so the
         trail changes character as it crosses from a photo onto white */
      if (now - lastHue > 550) { pointer.color = pickFor(overDark(e.clientX, e.clientY)); lastHue = now; }
      lastMove = now;
      wake();
    }, { passive: true });

    /* ---------------- run / pause ---------------- */
    var running = false, raf = 0, last = performance.now();

    function wake() {
      if (running || document.hidden) return;
      running = true; last = performance.now(); raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    /* Watchdog: a renderer can report as hardware and still be far too slow.
       Step down once, then remove itself rather than letting the page stutter. */
    var samples = [], warmup = 30, tier = 0;
    function watch(ms) {
      if (warmup > 0) { warmup--; return; }
      samples.push(ms);
      if (samples.length < 60) return;
      var avg = samples.reduce(function (a, b) { return a + b; }, 0) / samples.length;
      samples.length = 0;
      if (avg <= 24) return;
      if (tier === 0) { tier = 1; sim.setQuality(64, 256, 10); warmup = 30; }
      else { stop(); canvas.remove(); }
    }

    function frame() {
      if (!running) return;
      var now = performance.now();
      var raw = now - last;
      var dt = Math.min(raw / 1000, 0.0166);
      last = now;

      sim.resize();
      if (pointer.moved) {
        sim.splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        pointer.moved = false;
      }
      sim.step(dt);
      sim.render();
      watch(raw);

      /* idle: keep stepping long enough for the dye to dissipate, then stop
         entirely so a parked cursor costs nothing at all */
      var still = now - lastMove;
      if (still > CONFIG.IDLE_MS + CONFIG.DRAIN_MS) { sim.clear(); stop(); return; }

      raf = requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else { lastMove = performance.now(); wake(); }
    });

    /* if the viewport drops below the desktop gate mid-session, shut down */
    var gate = window.matchMedia('(min-width: 1024px)');
    var onGate = function () { if (!gate.matches) { stop(); canvas.remove(); } };
    gate.addEventListener ? gate.addEventListener('change', onGate) : gate.addListener(onGate);

    window.__scFluid = {
      stop: stop, wake: wake, config: CONFIG, info: sim.info,
      isRunning: function () { return running; },
      probeZone: overDark
    };
  }

  /* =======================================================
     WebGL plumbing
     ======================================================= */
  function isSoftwareRenderer(gl) {
    var name = '';
    try {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch (e) { return false; }
    return /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(name);
  }

  function getExtensions(gl, isWebGL2) {
    var halfFloat, supportLinear;
    if (isWebGL2) {
      if (!gl.getExtension('EXT_color_buffer_float')) return null;
      supportLinear = !!gl.getExtension('OES_texture_float_linear');
      return {
        webgl2: true,
        halfFloatTexType: gl.HALF_FLOAT,
        formatRGBA: { internalFormat: gl.RGBA16F, format: gl.RGBA },
        formatRG:   { internalFormat: gl.RG16F,   format: gl.RG },
        formatR:    { internalFormat: gl.R16F,    format: gl.RED },
        filtering: supportLinear ? gl.LINEAR : gl.NEAREST
      };
    }
    halfFloat = gl.getExtension('OES_texture_half_float');
    if (!halfFloat) return null;
    supportLinear = !!gl.getExtension('OES_texture_half_float_linear');
    var type = halfFloat.HALF_FLOAT_OES;
    var rgba = { internalFormat: gl.RGBA, format: gl.RGBA };
    if (!supportRenderTextureFormat(gl, gl.RGBA, gl.RGBA, type)) return null;
    return {
      webgl2: false, halfFloatTexType: type,
      formatRGBA: rgba, formatRG: rgba, formatR: rgba,
      filtering: supportLinear ? gl.LINEAR : gl.NEAREST
    };
  }

  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    return ok;
  }

  function compile(gl, type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    var uniforms = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var name = gl.getActiveUniform(p, i).name;
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { program: p, uniforms: uniforms };
  }

  var VERT = [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
    'uniform vec2 texelSize;',
    'void main () {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(texelSize.x, 0.0);',
    '  vR = vUv + vec2(texelSize.x, 0.0);',
    '  vT = vUv + vec2(0.0, texelSize.y);',
    '  vB = vUv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F = {
    clear: [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;',
      'void main () { gl_FragColor = value * texture2D(uTexture, vUv); }'
    ].join('\n'),

    splat: [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;',
      'uniform vec3 color; uniform vec2 point; uniform float radius;',
      'void main () {',
      '  vec2 p = vUv - point.xy; p.x *= aspectRatio;',
      '  vec3 splat = exp(-dot(p, p) / radius) * color;',
      '  vec3 base = texture2D(uTarget, vUv).xyz;',
      '  gl_FragColor = vec4(base + splat, 1.0);',
      '}'
    ].join('\n'),

    advection: [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;',
      'uniform vec2 texelSize; uniform vec2 dyeTexelSize;',
      'uniform float dt; uniform float dissipation;',
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {',
      '  vec2 st = uv / tsize - 0.5;',
      '  vec2 iuv = floor(st); vec2 fuv = fract(st);',
      '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);',
      '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);',
      '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);',
      '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);',
      '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);',
      '}',
      'void main () {',
      '#ifdef MANUAL_FILTERING',
      '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;',
      '  vec4 result = bilerp(uSource, coord, dyeTexelSize);',
      '#else',
      '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
      '  vec4 result = texture2D(uSource, coord);',
      '#endif',
      '  float decay = 1.0 + dissipation * dt;',
      '  gl_FragColor = result / decay;',
      '}'
    ].join('\n'),

    divergence: [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
      'varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).x;',
      '  float R = texture2D(uVelocity, vR).x;',
      '  float T = texture2D(uVelocity, vT).y;',
      '  float B = texture2D(uVelocity, vB).y;',
      '  vec2 C = texture2D(uVelocity, vUv).xy;',
      '  if (vL.x < 0.0) { L = -C.x; }',
      '  if (vR.x > 1.0) { R = -C.x; }',
      '  if (vT.y > 1.0) { T = -C.y; }',
      '  if (vB.y < 0.0) { B = -C.y; }',
      '  float div = 0.5 * (R - L + T - B);',
      '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),

    curl: [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
      'varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).y;',
      '  float R = texture2D(uVelocity, vR).y;',
      '  float T = texture2D(uVelocity, vT).x;',
      '  float B = texture2D(uVelocity, vB).x;',
      '  float vorticity = R - L - T + B;',
      '  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),

    vorticity: [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
      'uniform sampler2D uVelocity; uniform sampler2D uCurl;',
      'uniform float curl; uniform float dt;',
      'void main () {',
      '  float L = texture2D(uCurl, vL).x;',
      '  float R = texture2D(uCurl, vR).x;',
      '  float T = texture2D(uCurl, vT).x;',
      '  float B = texture2D(uCurl, vB).x;',
      '  float C = texture2D(uCurl, vUv).x;',
      '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
      '  force /= length(force) + 0.0001;',
      '  force *= curl * C;',
      '  force.y *= -1.0;',
      '  vec2 vel = texture2D(uVelocity, vUv).xy;',
      '  vel += force * dt;',
      '  vel = min(max(vel, -1000.0), 1000.0);',
      '  gl_FragColor = vec4(vel, 0.0, 1.0);',
      '}'
    ].join('\n'),

    pressure: [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
      'varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uPressure; uniform sampler2D uDivergence;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  float divergence = texture2D(uDivergence, vUv).x;',
      '  float pressure = (L + R + B + T - divergence) * 0.25;',
      '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'),

    gradientSubtract: [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;',
      'varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uPressure; uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
      '  velocity.xy -= vec2(R - L, T - B);',
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
      '}'
    ].join('\n'),

    /* Separate hue from strength: the dye's brightest channel becomes alpha
       (capped), and the colour is renormalised. That gives honest alpha
       compositing, which works over a photograph AND over white — unlike a
       blend mode, which can only ever push one direction. */
    display: [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uTexture; uniform float uMaxAlpha;',
      'void main () {',
      '  vec3 c = texture2D(uTexture, vUv).rgb;',
      '  float peak = max(c.r, max(c.g, c.b));',
      '  if (peak < 0.0008) { gl_FragColor = vec4(0.0); return; }',
      '  float a = min(peak, uMaxAlpha);',
      '  gl_FragColor = vec4(c / peak, a);',
      '}'
    ].join('\n')
  };

  /* =======================================================
     Simulation
     ======================================================= */
  function createSim(gl, ext, canvas) {
    var manualFilter = (ext.filtering === gl.NEAREST);

    var vert = compile(gl, gl.VERTEX_SHADER, VERT);
    function frag(src) {
      return compile(gl, gl.FRAGMENT_SHADER,
        (manualFilter ? '#define MANUAL_FILTERING 1\n' : '') + src);
    }

    var progClear    = program(gl, vert, frag(F.clear));
    var progSplat    = program(gl, vert, frag(F.splat));
    var progAdvect   = program(gl, vert, frag(F.advection));
    var progDiv      = program(gl, vert, frag(F.divergence));
    var progCurl     = program(gl, vert, frag(F.curl));
    var progVort     = program(gl, vert, frag(F.vorticity));
    var progPressure = program(gl, vert, frag(F.pressure));
    var progGradSub  = program(gl, vert, frag(F.gradientSubtract));
    var progDisplay  = program(gl, vert, frag(F.display));

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    function createFBO(w, h, fmt, filter) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, ext.halfFloatTexType, null);

      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        texture: texture, fbo: fbo, width: w, height: h,
        texelSizeX: 1 / w, texelSizeY: 1 / h,
        attach: function (idx) {
          gl.activeTexture(gl.TEXTURE0 + idx);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return idx;
        }
      };
    }

    function createDoubleFBO(w, h, fmt, filter) {
      var a = createFBO(w, h, fmt, filter);
      var b = createFBO(w, h, fmt, filter);
      return {
        width: w, height: h, texelSizeX: a.texelSizeX, texelSizeY: a.texelSizeY,
        get read() { return a; }, set read(v) { a = v; },
        get write() { return b; }, set write(v) { b = v; },
        swap: function () { var t = a; a = b; b = t; }
      };
    }

    var dye, velocity, divergence, curlFBO, pressure;
    var simW, simH, dyeW, dyeH;

    function getResolution(res) {
      var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspect < 1) aspect = 1 / aspect;
      var min = Math.round(res), max = Math.round(res * aspect);
      return gl.drawingBufferWidth > gl.drawingBufferHeight
        ? { width: max, height: min } : { width: min, height: max };
    }

    function initFramebuffers() {
      var s = getResolution(CONFIG.SIM_RESOLUTION);
      var d = getResolution(CONFIG.DYE_RESOLUTION);
      simW = s.width; simH = s.height; dyeW = d.width; dyeH = d.height;
      var filter = ext.filtering;
      dye        = createDoubleFBO(dyeW, dyeH, ext.formatRGBA, filter);
      velocity   = createDoubleFBO(simW, simH, ext.formatRG, filter);
      divergence = createFBO(simW, simH, ext.formatR, gl.NEAREST);
      curlFBO    = createFBO(simW, simH, ext.formatR, gl.NEAREST);
      pressure   = createDoubleFBO(simW, simH, ext.formatR, gl.NEAREST);
    }

    /* full-screen fixed canvas: track the viewport */
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
      var w = Math.round(window.innerWidth * dpr);
      var h = Math.round(window.innerHeight * dpr);
      if (!w || !h) return false;
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w; canvas.height = h;
      initFramebuffers();
      return true;
    }

    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    if (!resize()) { canvas.width = 2; canvas.height = 2; initFramebuffers(); }

    function use(p) { gl.useProgram(p.program); return p.uniforms; }

    function step(dt) {
      gl.disable(gl.BLEND);

      var u = use(progCurl);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      blit(curlFBO);

      u = use(progVort);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(u.uCurl, curlFBO.attach(1));
      gl.uniform1f(u.curl, CONFIG.CURL);
      gl.uniform1f(u.dt, dt);
      blit(velocity.write); velocity.swap();

      u = use(progDiv);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      blit(divergence);

      u = use(progClear);
      gl.uniform1i(u.uTexture, pressure.read.attach(0));
      gl.uniform1f(u.value, CONFIG.PRESSURE);
      blit(pressure.write); pressure.swap();

      u = use(progPressure);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(u.uDivergence, divergence.attach(0));
      for (var i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(u.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }

      u = use(progGradSub);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(u.uPressure, pressure.read.attach(0));
      gl.uniform1i(u.uVelocity, velocity.read.attach(1));
      blit(velocity.write); velocity.swap();

      u = use(progAdvect);
      gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (manualFilter) gl.uniform2f(u.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var velId = velocity.read.attach(0);
      gl.uniform1i(u.uVelocity, velId);
      gl.uniform1i(u.uSource, velId);
      gl.uniform1f(u.dt, dt);
      gl.uniform1f(u.dissipation, CONFIG.VELOCITY_DISSIPATION);
      blit(velocity.write); velocity.swap();

      if (manualFilter) gl.uniform2f(u.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(u.uSource, dye.read.attach(1));
      gl.uniform1f(u.dissipation, CONFIG.DENSITY_DISSIPATION);
      blit(dye.write); dye.swap();
    }

    function correctRadius(r) {
      var aspect = canvas.width / canvas.height;
      return aspect > 1 ? r * aspect : r;
    }

    function splat(x, y, dx, dy, color) {
      var u = use(progSplat);
      gl.uniform1i(u.uTarget, velocity.read.attach(0));
      gl.uniform1f(u.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(u.point, x, y);
      gl.uniform3f(u.color, dx, dy, 0.0);
      gl.uniform1f(u.radius, correctRadius(CONFIG.SPLAT_RADIUS / 100.0));
      blit(velocity.write); velocity.swap();

      gl.uniform1i(u.uTarget, dye.read.attach(0));
      gl.uniform3f(u.color, color.r, color.g, color.b);
      blit(dye.write); dye.swap();
    }

    function render() {
      gl.disable(gl.BLEND);
      var u = use(progDisplay);
      gl.uniform1i(u.uTexture, dye.read.attach(0));
      gl.uniform1f(u.uMaxAlpha, CONFIG.MAX_ALPHA);
      blit(null);
    }

    /* wipe the visible canvas when the pointer goes idle */
    function clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      initFramebuffers();
    }

    return {
      step: step, splat: splat, render: render, resize: resize, clear: clear,
      setQuality: function (simRes, dyeRes, iterations) {
        CONFIG.SIM_RESOLUTION = simRes;
        CONFIG.DYE_RESOLUTION = dyeRes;
        CONFIG.PRESSURE_ITERATIONS = iterations;
        initFramebuffers();
      },
      info: function () {
        return { sim: simW + 'x' + simH, dye: dyeW + 'x' + dyeH,
                 canvas: canvas.width + 'x' + canvas.height,
                 webgl2: !!ext.webgl2, linearFilter: !manualFilter,
                 maxAlpha: CONFIG.MAX_ALPHA };
      }
    };
  }
})();
