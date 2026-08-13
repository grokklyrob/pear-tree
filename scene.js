(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d", { alpha: false });

  const GOLD = "#c9a227";
  const EMBER = "#d4893a";

  const PHASES = [
    { id: "sneak", d: 10000 },
    { id: "shake", d: 7500 },
    { id: "scoop", d: 6500 },
    { id: "toss", d: 9000 },
    { id: "return", d: 8000 },
  ];
  const TOTAL = PHASES.reduce((s, p) => s + p.d, 0);

  let W = 0;
  let H = 0;
  let groundY = 0;
  let treeX = 0;
  let treeScale = 1;
  let moonR = 48;
  let extraShake = 0;
  let lastAbs = 0;
  let startTime = 0;
  let lastT = 0;

  const pointer = { x: 0.5, y: 0.3 };
  const moonOff = { x: 0, y: 0 };
  const moonTgt = { x: 0, y: 0 };

  const stars = [];
  const fireflies = [];
  const dust = [];
  const leaves = [];
  let tree = null;
  let boys = [];
  let pigs = [];
  let houses = [];
  let wallStones = [];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(370);

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function phaseAt(ms) {
    const t = ms % TOTAL;
    let acc = 0;
    for (const p of PHASES) {
      if (t < acc + p.d) return { id: p.id, u: (t - acc) / p.d, abs: t };
      acc += p.d;
    }
    return { id: "sneak", u: 0, abs: t };
  }

  function buildTree() {
    const r = mulberry32(370);
    const branches = [];
    const canopy = [];
    const pears = [];

    function addBranch(x, y, angle, len, depth, width) {
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const curve = (r() - 0.5) * len * 0.3;
      branches.push({
        x1: x,
        y1: y,
        x2,
        y2,
        cx: (x + x2) / 2 + nx * curve,
        cy: (y + y2) / 2 + ny * curve,
        w: width,
        depth,
      });

      if (depth >= 3 && y2 < -40) {
        canopy.push({
          x: x2 + (r() - 0.5) * 18,
          y: y2 + (r() - 0.5) * 14,
          rx: 15 + r() * 26,
          ry: 11 + r() * 18,
          rot: r() * Math.PI,
          shade: r(),
        });
        if (r() > 0.4) {
          pears.push(makePear(x2 + (r() - 0.5) * 16, y2 + 7 + r() * 12, r));
        }
      }

      if (depth < 7 && len > 11) {
        const splits = depth < 2 ? 2 : r() > 0.32 ? 2 : 1;
        for (let i = 0; i < splits; i++) {
          const dir = splits === 1 ? (r() < 0.5 ? -1 : 1) : i === 0 ? -1 : 1;
          addBranch(
            x2,
            y2,
            angle + dir * (0.3 + r() * 0.55),
            len * (0.62 + r() * 0.18),
            depth + 1,
            Math.max(1.35, width * 0.64)
          );
        }
        if (depth < 4 && r() > 0.5) {
          addBranch(x2, y2, angle + (r() - 0.5) * 0.45, len * 0.68, depth + 1, width * 0.55);
        }
      }
    }

    addBranch(0, 0, -Math.PI / 2, 82, 0, 17);

    for (let i = 0; i < 32; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r());
      canopy.push({
        x: Math.cos(a) * 98 * rad,
        y: -158 + Math.sin(a) * 72 * rad,
        rx: 18 + r() * 34,
        ry: 13 + r() * 24,
        rot: r() * Math.PI,
        shade: r(),
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 0.82;
      pears.push(makePear(Math.cos(a) * 78 * rad, -152 + Math.sin(a) * 56 * rad + 10, r));
    }
    return { branches, canopy, pears };
  }

  function makePear(x, y, r) {
    return {
      x,
      y,
      r: 3.2 + r() * 2.4,
      rot: r() * Math.PI,
      rotV: (r() - 0.5) * 0.12,
      fallen: false,
      held: false,
      tossing: false,
      settled: false,
      wx: 0,
      wy: 0,
      vx: 0,
      vy: 0,
    };
  }

  function resetPears() {
    for (const p of tree.pears) {
      p.fallen = false;
      p.held = false;
      p.tossing = false;
      p.settled = false;
      p.vx = 0;
      p.vy = 0;
    }
    for (const b of boys) {
      b.holding = [];
      b.didToss = false;
    }
  }

  function treeToWorld(lx, ly, sway) {
    const ca = Math.cos(sway);
    const sa = Math.sin(sway);
    return {
      x: treeX + (lx * ca - ly * sa) * treeScale,
      y: groundY + (lx * sa + ly * ca) * treeScale,
    };
  }

  function layoutWorld() {
    groundY = H * 0.845;
    treeX = W * (W < 780 ? 0.52 : 0.58);
    treeScale = Math.min(W / 1280, H / 820) * (W < 780 ? 0.92 : 1);
    moonR = 42 + 18 * treeScale;

    if (!stars.length) {
      for (let i = 0; i < 150; i++) {
        stars.push({
          x: rng(),
          y: rng() * 0.68,
          r: rng() * 1.35 + 0.25,
          a: 0.25 + rng() * 0.75,
          tw: rng() * Math.PI * 2,
          tws: 0.35 + rng() * 1.3,
          drift: 0.0015 + rng() * 0.007,
        });
      }
    }
    if (!fireflies.length) {
      for (let i = 0; i < 24; i++) {
        fireflies.push({
          x: 0.2 + rng() * 0.75,
          y: 0.38 + rng() * 0.48,
          s: 0.55 + rng() * 1.45,
          p: rng() * Math.PI * 2,
          sp: 0.0007 + rng() * 0.0016,
          blink: rng() * Math.PI * 2,
        });
      }
    }
    if (!dust.length) {
      for (let i = 0; i < 55; i++) {
        dust.push({
          x: rng(),
          y: rng(),
          r: 0.4 + rng() * 1.1,
          v: 0.004 + rng() * 0.012,
          a: 0.08 + rng() * 0.18,
        });
      }
    }

    houses = [
      { x: 0.62, w: 28, h: 18, roof: 10, lit: true },
      { x: 0.66, w: 22, h: 14, roof: 8, lit: false },
      { x: 0.705, w: 34, h: 20, roof: 12, lit: true },
      { x: 0.75, w: 18, h: 12, roof: 7, lit: false },
      { x: 0.785, w: 26, h: 16, roof: 9, lit: true },
      { x: 0.84, w: 20, h: 13, roof: 8, lit: false },
    ];

    wallStones = [];
    const wr = mulberry32(12);
    for (let i = 0; i < 22; i++) {
      wallStones.push({
        x: 0.72 + i * 0.013,
        y: wr() * 6,
        w: 10 + wr() * 14,
        h: 6 + wr() * 8,
      });
    }

    if (!boys.length) {
      const tunics = ["#3a3228", "#44392c", "#322a22", "#4a4032", "#383024"];
      boys = [
        { h: 54, lag: 0.0, slot: -38, role: "shake", tunic: tunics[0] },
        { h: 50, lag: 0.07, slot: -16, role: "shake", tunic: tunics[1] },
        { h: 48, lag: 0.13, slot: 10, role: "scoop", tunic: tunics[2] },
        { h: 46, lag: 0.2, slot: 28, role: "scoop", tunic: tunics[3] },
        { h: 51, lag: 0.1, slot: -58, role: "lookout", tunic: tunics[4] },
      ].map((b, i) => ({
        ...b,
        x: W * 0.05,
        gait: i * 1.3,
        walking: false,
        crouch: 0,
        facing: 1,
        armL: Math.PI / 2,
        armR: Math.PI / 2,
        cloakOpen: 0,
        holding: [],
        didToss: false,
      }));
    }

    pigs = [
      { xFrac: 0.8, s: 1, phase: 0.2, alert: 0 },
      { xFrac: 0.875, s: 0.86, phase: 1.7, alert: 0 },
    ];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutWorld();
  }

  function drawSky(now) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07060e");
    g.addColorStop(0.42, "#0a0916");
    g.addColorStop(0.7, "#14101c");
    g.addColorStop(1, "#1c1618");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const hz = ctx.createLinearGradient(0, H * 0.52, 0, groundY);
    hz.addColorStop(0, "rgba(0,0,0,0)");
    hz.addColorStop(0.55, "rgba(48, 36, 32, 0.12)");
    hz.addColorStop(1, "rgba(28, 22, 20, 0.35)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.52, W, H * 0.5);
  }

  function drawStars(now) {
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.001 * s.tws + s.tw);
      const x = ((s.x + now * s.drift * 0.000012) % 1) * W;
      const y = s.y * H;
      ctx.fillStyle = `rgba(232,230,222,${s.a * tw})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMoon(now) {
    const mx = W * 0.76 + moonOff.x;
    const my = H * 0.155 + moonOff.y;
    const r = moonR;

    const glow = ctx.createRadialGradient(mx, my, r * 0.15, mx, my, r * 6.2);
    glow.addColorStop(0, "rgba(232,230,220,0.28)");
    glow.addColorStop(0.1, "rgba(210,214,224,0.11)");
    glow.addColorStop(0.32, "rgba(90,100,140,0.045)");
    glow.addColorStop(1, "rgba(7,6,14,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - r * 6.2, my - r * 6.2, r * 12.4, r * 12.4);

    const disc = ctx.createRadialGradient(mx - r * 0.22, my - r * 0.22, r * 0.12, mx, my, r);
    disc.addColorStop(0, "#f4f2ea");
    disc.addColorStop(0.5, "#d9d7cd");
    disc.addColorStop(1, "#b4b2aa");
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();

    ctx.fillStyle = "rgba(88, 92, 102, 0.13)";
    ctx.beginPath();
    ctx.ellipse(mx + r * 0.18, my + r * 0.08, r * 0.34, r * 0.26, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(mx - r * 0.28, my - r * 0.12, r * 0.16, r * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(mx + r * 0.05, my - r * 0.32, r * 0.12, r * 0.1, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills() {
    ctx.fillStyle = "#0c0b14";
    ctx.beginPath();
    ctx.moveTo(0, groundY - 120 * treeScale);
    ctx.quadraticCurveTo(W * 0.25, groundY - 168 * treeScale, W * 0.48, groundY - 128 * treeScale);
    ctx.quadraticCurveTo(W * 0.7, groundY - 210 * treeScale, W, groundY - 150 * treeScale);
    ctx.lineTo(W, groundY + 40);
    ctx.lineTo(0, groundY + 40);
    ctx.fill();

    ctx.fillStyle = "#100e18";
    ctx.beginPath();
    ctx.moveTo(0, groundY - 40 * treeScale);
    ctx.quadraticCurveTo(W * 0.3, groundY - 88 * treeScale, W * 0.55, groundY - 48 * treeScale);
    ctx.quadraticCurveTo(W * 0.78, groundY - 96 * treeScale, W, groundY - 52 * treeScale);
    ctx.lineTo(W, groundY + 80);
    ctx.lineTo(0, groundY + 80);
    ctx.fill();
  }

  function drawTown() {
    const ridge = groundY - 168 * treeScale;
    for (const h of houses) {
      const x = h.x * W;
      const y = ridge + 8;
      const s = treeScale;
      ctx.fillStyle = "#16131c";
      ctx.fillRect(x, y - h.h * s, h.w * s, h.h * s);
      ctx.fillStyle = "#4a2c1c";
      ctx.beginPath();
      ctx.moveTo(x - 3 * s, y - h.h * s);
      ctx.lineTo(x + (h.w * s) / 2, y - h.h * s - h.roof * s);
      ctx.lineTo(x + h.w * s + 3 * s, y - h.h * s);
      ctx.closePath();
      ctx.fill();
      if (h.lit) {
        ctx.fillStyle = "rgba(212, 137, 58, 0.62)";
        ctx.fillRect(x + h.w * s * 0.38, y - h.h * s * 0.58, h.w * s * 0.16, h.h * s * 0.22);
      }
    }

    // distant orchard blobs
    ctx.fillStyle = "#0d1010";
    for (let i = 0; i < 5; i++) {
      const x = W * (0.48 + i * 0.07);
      const y = ridge + 18;
      ctx.beginPath();
      ctx.ellipse(x, y - 28 * treeScale, 16 * treeScale, 22 * treeScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 2 * treeScale, y - 14 * treeScale, 4 * treeScale, 16 * treeScale);
    }
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, groundY - 30, 0, H);
    g.addColorStop(0, "#141018");
    g.addColorStop(0.35, "#1a1614");
    g.addColorStop(1, "#0e0c10");
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY - 8, W, H - groundY + 8);

    ctx.strokeStyle = "rgba(201,162,39,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
  }

  function drawWall() {
    const s = treeScale;
    const baseY = groundY - 4;
    ctx.fillStyle = "#1c1816";
    for (const st of wallStones) {
      ctx.fillRect(st.x * W, baseY - 18 * s - st.y, st.w * s, st.h * s);
    }
    ctx.fillStyle = "#151210";
    ctx.fillRect(W * 0.715, baseY - 8 * s, W * 0.28, 8 * s);

    // left crumbling wall they sneak past
    ctx.fillStyle = "#181410";
    ctx.fillRect(W * 0.02, groundY - 36 * s, 90 * s, 10 * s);
    ctx.fillRect(W * 0.03, groundY - 48 * s, 22 * s, 14 * s);
    ctx.fillRect(W * 0.055, groundY - 44 * s, 28 * s, 10 * s);
    ctx.fillRect(W * 0.09, groundY - 50 * s, 18 * s, 16 * s);
  }

  function drawPear(x, y, r, rot, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.globalAlpha *= a == null ? 1 : a;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.15, r * 0.72, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.52, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,244,210,0.32)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.1, r * 0.16, r * 0.28, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a2216";
    ctx.lineWidth = Math.max(0.6, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.quadraticCurveTo(r * 0.18, -r * 1.05, r * 0.12, -r * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  function currentSway(now, shakeAmt) {
    return Math.sin(now * 0.00055) * 0.012 + Math.sin(now * 0.018) * 0.05 * shakeAmt;
  }

  function drawTree(now, sway) {
    ctx.save();
    ctx.translate(treeX, groundY);
    ctx.scale(treeScale, treeScale);
    ctx.rotate(sway);

    ctx.fillStyle = "#1a1510";
    ctx.beginPath();
    ctx.moveTo(-16, 10);
    ctx.quadraticCurveTo(-12, -42, -7, -82);
    ctx.lineTo(7, -82);
    ctx.quadraticCurveTo(13, -42, 15, 10);
    ctx.quadraticCurveTo(0, 16, -16, 10);
    ctx.fill();

    ctx.strokeStyle = "#1c1812";
    ctx.lineCap = "round";
    for (const b of tree.branches) {
      ctx.lineWidth = b.w;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.quadraticCurveTo(b.cx, b.cy, b.x2, b.y2);
      ctx.stroke();
    }

    for (const c of tree.canopy) {
      const moonlit = 10 + c.shade * 10;
      ctx.fillStyle = `rgb(${moonlit + 4},${moonlit + 12},${moonlit + 6})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, c.rot, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of tree.pears) {
      if (p.fallen || p.held || p.tossing) continue;
      drawPear(p.x, p.y, p.r, p.rot, 1);
    }
    ctx.restore();
  }

  function drawWorldPears() {
    for (const p of tree.pears) {
      if (p.held) continue;
      if (p.fallen || p.tossing) {
        drawPear(p.wx, p.wy, p.r * treeScale, p.rot, 1);
      }
    }
  }

  function drawBoy(b) {
    const h = b.h * treeScale * 1.18;
    const k = h / 54;
    ctx.save();
    ctx.translate(b.x, groundY + 1);
    ctx.scale(b.facing, 1);
    const bob = b.walking ? Math.abs(Math.sin(b.gait)) * 2.1 * treeScale : 0;
    ctx.translate(0, -bob + b.crouch * 7 * treeScale);

    const ink = "#121018";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3.1 * k;

    const hipY = -h * 0.4;
    const lSwing = b.walking ? Math.sin(b.gait) : 0;
    ctx.beginPath();
    ctx.moveTo(-3.2 * k, hipY);
    ctx.quadraticCurveTo(-3 * k + lSwing * 8 * k, hipY * 0.5, -2 * k + lSwing * 11 * k, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3.2 * k, hipY);
    ctx.quadraticCurveTo(3 * k - lSwing * 8 * k, hipY * 0.5, 2 * k - lSwing * 11 * k, 0);
    ctx.stroke();

    ctx.fillStyle = b.tunic;
    ctx.beginPath();
    ctx.moveTo(-6.6 * k, -h * 0.74);
    ctx.lineTo(6.6 * k, -h * 0.74);
    ctx.lineTo(11.8 * k, -h * 0.36);
    ctx.quadraticCurveTo(0, -h * 0.31, -11.8 * k, -h * 0.36);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(40,32,24,0.7)";
    ctx.lineWidth = 1.25 * k;
    ctx.beginPath();
    ctx.moveTo(-7 * k, -h * 0.56);
    ctx.lineTo(7 * k, -h * 0.56);
    ctx.stroke();

    ctx.strokeStyle = "rgba(210,200,180,0.2)";
    ctx.lineWidth = 1.15 * k;
    ctx.beginPath();
    ctx.moveTo(6.6 * k, -h * 0.74);
    ctx.lineTo(11.8 * k, -h * 0.36);
    ctx.stroke();

    ctx.fillStyle = "#0e0c12";
    ctx.beginPath();
    ctx.ellipse(0.3 * k, -h * 0.84, 5.15 * k, 6.15 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.5 * k, -h * 0.885, 5.55 * k, 4.35 * k, -0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.55 * k;
    const sx = -6 * k;
    const sy = -h * 0.68;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(b.armL) * 16 * k, sy + Math.sin(b.armL) * 16 * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6 * k, sy);
    ctx.lineTo(6 * k + Math.cos(b.armR) * 16 * k, sy + Math.sin(b.armR) * 16 * k);
    ctx.stroke();

    if (b.cloakOpen > 0.06) {
      const o = b.cloakOpen;
      ctx.fillStyle = `rgba(92, 78, 56, ${0.32 + o * 0.28})`;
      ctx.beginPath();
      ctx.moveTo(5 * k, -h * 0.62);
      ctx.quadraticCurveTo(22 * k * o + 10 * k, -h * 0.38, 17 * k, -h * 0.04);
      ctx.quadraticCurveTo(8 * k, -h * 0.2, 3 * k, -h * 0.42);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < b.holding.length; i++) {
        drawPear(10 * k + (i % 2) * 5 * k, -h * 0.26 + Math.floor(i / 2) * 6 * k, 2.5 * k, 0.2 * i, 1);
      }
    }
    ctx.restore();
  }

  function drawPig(p, now) {
    const s = treeScale * 1.15 * p.s;
    const x = p.xFrac * W;
    const sniff = Math.sin(now * 0.003 + p.phase) * (4 - p.alert * 3);
    const look = p.alert * -0.35;
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(s, s);
    ctx.fillStyle = "#1a1412";
    ctx.beginPath();
    ctx.ellipse(0, -10, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(16, -13 + sniff * 0.25 + look * 4, 8, 6.6, 0.15 + look, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(23, -12 + sniff * 0.3 + look * 4, 4.4, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(14, -20 + look * 2, 3.2, 4.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(18, -19 + look * 2, 2.6, 3.6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-12, -4, 3.2, 8);
    ctx.fillRect(-2, -4, 3.2, 8);
    ctx.fillRect(6, -4, 3.2, 8);
    ctx.fillRect(14, -4, 3.2, 7);
    ctx.strokeStyle = "#1a1412";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-17, -10);
    ctx.quadraticCurveTo(-24, -16, -20, -6);
    ctx.stroke();
    ctx.restore();
  }

  function drawFireflies(now) {
    for (const f of fireflies) {
      const x = (f.x + Math.sin(now * f.sp + f.p) * 0.04) * W;
      const y = (f.y + Math.cos(now * f.sp * 0.8 + f.p) * 0.03) * H;
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.0022 + f.blink));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 7 * f.s);
      g.addColorStop(0, `rgba(232, 170, 70, ${0.85 * pulse})`);
      g.addColorStop(0.35, `rgba(212, 137, 58, ${0.28 * pulse})`);
      g.addColorStop(1, "rgba(212,137,58,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 7 * f.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDust(now) {
    ctx.fillStyle = "rgba(216, 203, 180, 0.14)";
    for (const d of dust) {
      const x = ((d.x + now * d.v * 0.00002) % 1) * W;
      const y = ((d.y + now * d.v * 0.000008) % 1) * H * 0.9;
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFallingLeaves(now) {
    for (const lf of leaves) {
      lf.x += lf.vx;
      lf.y += lf.vy;
      lf.rot += lf.vr;
      lf.life -= 1;
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.globalAlpha = clamp(lf.life / 80, 0, 0.55);
      ctx.fillStyle = "#1a2218";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 * treeScale, 3 * treeScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = leaves.length - 1; i >= 0; i--) {
      if (leaves[i].life < 0 || leaves[i].y > groundY + 20) leaves.splice(i, 1);
    }
  }

  function dropPear(p, sway, now) {
    const w = treeToWorld(p.x, p.y, sway);
    p.fallen = true;
    p.settled = false;
    p.wx = w.x;
    p.wy = w.y;
    p.vx = (Math.random() - 0.5) * 2.4;
    p.vy = -0.4 + Math.random() * 0.8;
  }

  function launchHeld(b) {
    const target = W * (0.8 + Math.random() * 0.08);
    for (const p of b.holding) {
      p.held = false;
      p.tossing = true;
      p.settled = false;
      p.wx = b.x + 14 * treeScale * b.facing;
      p.wy = groundY - 30 * treeScale;
      p.vx = (target - p.wx) / 42;
      p.vy = -5.2 - Math.random() * 2.2;
      p.rotV = (Math.random() - 0.5) * 0.22;
    }
    b.holding = [];
  }

  function updateBoys(phase, now, dt) {
    const startX = W * 0.07;
    const gather = (i) => treeX + boys[i].slot * treeScale;
    const tossX = (i) => W * 0.73 + boys[i].slot * 0.35 * treeScale;

    for (let i = 0; i < boys.length; i++) {
      const b = boys[i];
      const u = clamp((phase.u - b.lag) / (1 - b.lag * 0.55), 0, 1);
      const e = ease(u);
      b.walking = false;
      b.cloakOpen *= 0.86;
      b.facing = 1;

      if (phase.id === "sneak") {
        b.x = lerp(startX + b.slot * 0.25, gather(i), e);
        b.walking = u < 0.97;
        b.crouch = 0.55;
        b.armL = Math.PI * 0.55 + Math.sin(b.gait) * 0.4;
        b.armR = Math.PI * 0.55 - Math.sin(b.gait) * 0.4;
      } else if (phase.id === "shake") {
        b.x = gather(i);
        if (b.role === "lookout") {
          b.crouch = 0.12;
          b.armL = Math.PI * 0.5;
          b.armR = -0.55;
          b.facing = -1;
        } else {
          b.x += Math.sin(now * 0.021 + i) * 3.2 * treeScale;
          b.crouch = 0.12;
          b.armL = -1.35 + Math.sin(now * 0.032 + i) * 0.22;
          b.armR = -1.2 + Math.sin(now * 0.032 + i + 1) * 0.22;
        }
      } else if (phase.id === "scoop") {
        b.x = gather(i);
        const scooper = b.role === "scoop" || i === 0;
        b.crouch = scooper ? 0.72 : 0.32;
        b.cloakOpen = scooper ? 0.9 : 0.12;
        b.armL = scooper ? 1.15 : Math.PI * 0.5;
        b.armR = 0.55 + Math.sin(now * 0.008 + i) * 0.45;
        if (scooper) {
          for (const p of tree.pears) {
            if (p.fallen && p.settled && !p.held && !p.tossing && b.holding.length < 5) {
              if (Math.abs(b.x - p.wx) < 46 * treeScale) {
                p.held = true;
                p.settled = false;
                b.holding.push(p);
              }
            }
          }
        }
      } else if (phase.id === "toss") {
        b.x = lerp(gather(i), tossX(i), e);
        b.walking = u < 0.62;
        b.crouch = 0.15;
        const throwT = (u - 0.32) / 0.18;
        if (throwT > 0 && throwT < 1) {
          b.walking = false;
          b.armR = lerp(1.15, -2.35, ease(throwT));
          b.armL = 0.8;
          b.cloakOpen = 0.45;
        } else {
          b.armL = Math.PI * 0.5 + Math.sin(b.gait) * 0.4;
          b.armR = Math.PI * 0.5 - Math.sin(b.gait) * 0.4;
          b.cloakOpen = u < 0.4 ? 0.55 : 0.08;
        }
        if (u > 0.4 && !b.didToss && b.holding.length) {
          launchHeld(b);
          b.didToss = true;
        }
      } else {
        b.x = lerp(tossX(i), startX + b.slot * 0.25, e);
        b.walking = true;
        b.facing = -1;
        b.crouch = 0.42;
        b.didToss = false;
        b.armL = Math.PI * 0.55 + Math.sin(b.gait) * 0.35;
        b.armR = Math.PI * 0.55 - Math.sin(b.gait) * 0.35;
      }

      if (b.walking) b.gait += dt * 0.0092 * (b.crouch > 0.3 ? 0.78 : 1);
    }
  }

  function updatePears(dt, now, sway, shakeAmt) {
    const step = dt / 16.67;
    if (shakeAmt > 0.18) {
      for (const p of tree.pears) {
        if (!p.fallen && !p.held && Math.random() < 0.011 * shakeAmt * step) {
          dropPear(p, sway, now);
        }
      }
      if (Math.random() < 0.08 * shakeAmt) {
        const w = treeToWorld((Math.random() - 0.5) * 80, -140 - Math.random() * 40, sway);
        leaves.push({
          x: w.x,
          y: w.y,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 0.4 + Math.random() * 0.6,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.08,
          life: 90 + Math.random() * 50,
        });
      }
    }

    for (const p of tree.pears) {
      if (p.held) continue;
      if (!(p.fallen || p.tossing)) continue;
      if (p.settled && !p.tossing) continue;
      p.vy += 0.21 * step;
      p.wx += p.vx * step;
      p.wy += p.vy * step;
      p.rot += (p.rotV || 0.04) * step;
      const floor = groundY - p.r * treeScale;
      if (p.wy >= floor) {
        p.wy = floor;
        p.vy *= -0.28;
        p.vx *= 0.7;
        if (Math.abs(p.vy) < 0.42) {
          p.settled = true;
          p.tossing = false;
          p.vy = 0;
          p.vx *= 0.25;
        }
      }
    }

    for (const pig of pigs) {
      let near = 0;
      for (const p of tree.pears) {
        if ((p.fallen || p.tossing) && Math.abs(p.wx - pig.xFrac * W) < 50 && p.wy > groundY - 40) {
          near = 1;
          break;
        }
      }
      pig.alert += (near - pig.alert) * 0.06;
    }
  }

  function drawForegroundWall() {
    const s = treeScale;
    ctx.fillStyle = "rgba(18, 14, 12, 0.72)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, groundY + 28 * s);
    ctx.lineTo(W * 0.18, groundY + 18 * s);
    ctx.lineTo(W * 0.22, H);
    ctx.closePath();
    ctx.fill();
  }

  function frame(ts) {
    if (!startTime) startTime = ts;
    const now = ts - startTime;
    let dt = ts - lastT;
    lastT = ts;
    if (dt > 40) dt = 40;

    moonOff.x += (moonTgt.x - moonOff.x) * 0.04;
    moonOff.y += (moonTgt.y - moonOff.y) * 0.04;

    const phase = phaseAt(now);
    if (phase.abs < lastAbs) resetPears();
    lastAbs = phase.abs;

    let shakeAmt = extraShake;
    if (phase.id === "shake") {
      shakeAmt = Math.max(shakeAmt, 0.45 + 0.55 * Math.sin(phase.u * Math.PI));
    }
    extraShake *= 0.96;
    const sway = currentSway(now, shakeAmt);

    updateBoys(phase, now, dt);
    updatePears(dt, now, sway, shakeAmt);

    drawSky(now);
    drawStars(now);
    drawMoon(now);
    drawHills();
    drawTown();
    drawGround();
    drawWall();
    drawTree(now, sway);
    for (const pig of pigs) drawPig(pig, now);
    drawWorldPears();
    for (const b of boys) drawBoy(b);
    drawFallingLeaves(now);
    drawFireflies(now);
    drawDust(now);
    drawForegroundWall();

    requestAnimationFrame(frame);
  }

  function hitTree(x, y) {
    const cx = treeX;
    const cy = groundY - 155 * treeScale;
    const dx = x - cx;
    const dy = y - cy;
    const r = 140 * treeScale;
    return dx * dx + dy * dy < r * r;
  }

  canvas.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX / W;
    pointer.y = e.clientY / H;
    moonTgt.x = (pointer.x - 0.5) * 52;
    moonTgt.y = (pointer.y - 0.5) * 30;
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (hitTree(e.clientX, e.clientY)) extraShake = 1;
  });

  function bindStills() {
    const box = document.querySelector(".lightbox");
    const img = box.querySelector("img");
    const cap = box.querySelector("figcaption");
    const close = box.querySelector(".lightbox-close");
    const figure = box.querySelector("figure");

    document.querySelectorAll(".still").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        img.src = btn.dataset.src;
        img.alt = btn.querySelector("img").alt;
        cap.textContent = btn.dataset.caption;
        box.hidden = false;
      });
    });

    function hide() {
      box.hidden = true;
    }
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      hide();
    });
    box.addEventListener("click", hide);
    figure.addEventListener("click", (e) => e.stopPropagation());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
  }

  tree = buildTree();
  resize();
  window.addEventListener("resize", resize);
  bindStills();
  requestAnimationFrame(frame);
})();
