// ============================================================
//  SUNSET GAMES '28 — a one-button track & field meet
//  Inspired by the 1983 arcade classic "Track & Field".
//  Every screen and every event uses ONE input: the SPACE bar.
// ============================================================

// ---------- screen ----------
const W = 320, H = 180;          // tiny "arcade" resolution, scaled up to fit the window
const PPM = 8;                   // pixels per meter in the side-view events
const FONT = 'Press Start 2P';
const SOLO = 141;                // y of the athlete's feet in single-lane events
const LANES = [120, 129, 138, 147]; // y of the runners' feet in each race lane (you're in the nearest one)
const HOLD_TO_PICK = 0.6;        // seconds to hold space to choose a menu item
const HI_KEY = 'sunsetGames28.hi';
let g;                           // low-res buffer that everything is drawn into
let ready = false;               // true once the font is loaded and art is built

// ---------- application state ----------
// title -> menu -> intro -> play -> result -> (intro ... ) -> over -> title
let state = 'title';
let stateT = 0;                  // seconds spent in the current state
let ev = null;                   // the event being played (an AthleticEvent subclass)
let run = null;                  // which events we're playing, attempt number, results
let menuIndex = 0, menuHoldStart = null;
let hiScore = 0, hype = 0, attractX = 0;
let confetti = [];

// ---------- the one button ----------
let spaceDown = false;
let pressOwner = null;           // the state a press began in, so a release can't leak into the next screen
const now = () => performance.now() / 1000;

window.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (e.repeat || spaceDown) return;   // ignore the OS key-repeat while holding
  spaceDown = true;
  initAudio();
  if (!ready) return;
  pressOwner = state;
  onPress();
});

window.addEventListener('keyup', e => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  spaceDown = false;
  const owner = pressOwner;
  pressOwner = null;
  if (owner === state) onRelease();
});

// ============================================================
//  EVENTS
// ============================================================

const EVENTS = [
  { id: 'dash', name: '100M DASH', verb: 'MASH',
    how: ['MASH SPACE TO RUN.', 'PRESS BEFORE "GO!" AND', 'IT\'S A FALSE START.'],
    lowerBetter: true, low: 14.0, gold: 10.2, score: { A: 25.4347, B: 18, C: 1.81 } },
  { id: 'long', name: 'LONG JUMP', verb: 'MASH, THEN HOLD',
    how: ['MASH SPACE TO SPRINT.', 'HOLD SPACE IN THE YELLOW.', 'LET GO NEAR 45 DEGREES.'],
    lowerBetter: false, field: true, low: 7.3, gold: 8.8, score: { A: 0.14354, B: 220, C: 1.4, cm: true } },
  { id: 'javelin', name: 'JAVELIN', verb: 'TAP, TAP',
    how: ['YOUR RUN-UP IS AUTOMATIC.', 'TAP 1: LOCK YOUR POWER.', 'TAP 2: THROW AT THE ANGLE.', 'DON\'T CROSS THE LINE!'],
    lowerBetter: false, field: true, low: 75, gold: 94, score: { A: 10.14, B: 7, C: 1.08 } },
  { id: 'hurdles', name: '110M HURDLES', verb: 'HOLD, RELEASE',
    how: ['HOLD SPACE TO RUN.', 'RELEASE SPACE TO JUMP.', 'PRESS AGAIN TO KEEP GOING.'],
    lowerBetter: true, low: 18.0, gold: 14.0, score: { A: 5.74352, B: 28.5, C: 1.92 } },
  { id: 'hammer', name: 'HAMMER THROW', verb: 'ONE TAP',
    how: ['SPINNING IS AUTOMATIC.', 'EVERY TURN GETS FASTER.', 'TAP TO LET GO WHILE THE', 'HAMMER IS IN THE ZONE.'],
    lowerBetter: false, field: true, low: 63, gold: 82, score: { A: 11.4, B: 7, C: 1.05 } },   // not a decathlon event: made-up constants in the same style
];

// The three CPU athletes you compete against. Their marks are rolled fresh for each event.
const RIVALS = [
  { name: 'R.SATO', nat: 'JPN', pal: 'rival', col: '#3dd6d0' },
  { name: 'M.DIALLO', nat: 'SEN', pal: 'rival2', col: '#ffd23f' },
  { name: 'L.BRANDT', nat: 'GER', pal: 'rival3', col: '#b388ff' },
];
const YOU = { name: 'YOU', nat: 'USA', pal: 'player', col: '#ff3d7f' };
const PLACE_MEDAL = ['GOLD', 'SILVER', 'BRONZE'];

// One strong, one middle and one weaker rival, shuffled so a different athlete leads each event.
// skill 0 = a weak mark (def.low), 1 = a world-class mark (def.gold)
function rollField(def) {
  const skills = shuffle([random(0.8, 1.05), random(0.45, 0.8), random(0.15, 0.5)]);
  return RIVALS.map((r, i) => {
    const level = lerp(def.low, def.gold, skills[i]);
    if (!def.field) return { ...r, mark: round2(level) };
    // field events: the rivals take 3 attempts too. Each round they get a bit better or worse,
    // and sometimes they foul (null). Their best attempt counts, just like yours.
    const attempts = [];
    let form = level * random(0.92, 0.99);
    for (let k = 0; k < 3; k++) {
      attempts.push(random() < 0.15 ? null : round2(form));
      form = Math.min(level * 1.04, form * random(0.95, 1.07));
    }
    if (attempts.every(a => a === null)) attempts[2] = round2(level);
    return { ...r, attempts, mark: bestOf(def, attempts) };
  });
}
const round2 = x => Math.round(x * 100) / 100;
function bestOf(def, marks) {
  return marks.reduce((b, m) => m === null ? b : b === null || better(def, m, b) ? m : b, null);
}
// the field as it stands after round n: everyone's best so far, plus what they did in round n
function fieldAt(def, field, n) {
  return field.map(r => r.attempts ? { ...r, mark: bestOf(def, r.attempts.slice(0, n)), round: r.attempts[n - 1] } : r);
}
// everyone sorted by mark, best first; no mark (fouls, false starts) goes to the bottom
function standings(def, field, yourMark) {
  const rows = [...field, { ...YOU, mark: yourMark, you: true }];
  rows.sort((a, b) => a.mark === null ? 1 : b.mark === null ? -1 : (a.mark === b.mark ? (a.you ? -1 : 1) : (better(def, a.mark, b.mark) ? -1 : 1)));
  return rows;
}
function leader(def, field) { return standings(def, field, null)[0]; }

const MENU = [
  { label: 'THE GAMES', sub: 'ALL 5 EVENTS IN A ROW', ids: EVENTS.map(e => e.id), mode: 'games' },
  ...EVENTS.map(e => ({ label: e.name, sub: 'PRACTICE: ' + e.verb, ids: [e.id], mode: 'practice' })),
];

const MEDAL_COL = { GOLD: '#ffd23f', SILVER: '#d9d9e6', BRONZE: '#d0814a' };

function fmt(def, m) { return m === null ? '--' : m.toFixed(2) + (def.lowerBetter ? 'S' : 'M'); }
function better(def, a, b) { return def.lowerBetter ? a <= b : a >= b; }
// Decathlon-style scoring tables: about 1000 points for a world-class mark, 0 for no mark.
//   races:            A * (B - seconds) ^ C
//   jumps and throws: A * (distance - B) ^ C   (long jump is measured in centimeters)
function points(def, m) {
  if (m === null) return 0;
  const { A, B, C, cm } = def.score;
  const x = def.lowerBetter ? B - m : (cm ? m * 100 : m) - B;
  return x > 0 ? Math.floor(A * Math.pow(x, C)) : 0;
}
// running totals for you and the rivals over the events finished so far, best first
function overall(results) {
  const rows = [...RIVALS.map((r, i) => ({ ...r, pts: results.reduce((a, e) => a + points(e.def, e.field[i].mark), 0) })),
                { ...YOU, you: true, pts: results.reduce((a, e) => a + e.pts, 0) }];
  return rows.sort((a, b) => b.pts - a.pts || (a.you ? -1 : b.you ? 1 : 0));
}
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function wx(m, cam) { return Math.round(m * PPM - cam); }   // world meters -> screen x

// ============================================================
//  SOUND (tiny Web Audio beeps, no library needed)
// ============================================================

let actx = null;
function initAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}
function tone(f, dur, type = 'square', vol = 0.05, f2 = null) {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.1, freq = 1200) {
  if (!actx) return;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), gn = actx.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7; gn.gain.value = vol;
  src.connect(f).connect(gn).connect(actx.destination);
  src.start();
}
const sfx = {
  step: () => tone(140 + Math.random() * 60, 0.04, 'square', 0.03),
  blip: () => tone(660, 0.06, 'square', 0.05),
  select: () => { tone(523, 0.08); setTimeout(() => tone(784, 0.14), 80); },
  beep: () => tone(440, 0.15, 'square', 0.06),
  go: () => tone(880, 0.35, 'square', 0.07),
  jump: () => tone(260, 0.2, 'square', 0.05, 620),
  land: () => noise(0.25, 0.3, 500),
  hit: () => { noise(0.15, 0.3, 900); tone(120, 0.15, 'sawtooth', 0.05); },
  foul: () => tone(220, 0.5, 'sawtooth', 0.06, 80),
  cheer: () => noise(1.8, 0.2, 1800),
  whoosh: () => noise(0.4, 0.15, 2500),
  turn: () => tone(90, 0.1, 'triangle', 0.1),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25), i * 150)),
};

// ============================================================
//  PIXEL ART
// ============================================================

// 12 x 18 sprites. h=hair s=skin p=singlet w=bib b=shorts k=shoes
const FRAMES = {
  stand: [
    '.....hhh....', '....hhhhs...', '....hhsss...', '.....sss....', '......s.....', '....ppppp...',
    '...sppppps..', '...spwwwps..', '...sppppps..', '...s.ppp.s..', '....bbbbb...', '....bbbbb...',
    '....ss.ss...', '....s...s...', '....s...s...', '....s...s...', '....s...s...', '...kk..kk...'],
  runA: [
    '......hhh...', '.....hhhhs..', '.....hhsss..', '......sss...', '.......s....', '.....ppppp..',
    '....pppppps.', '...s.pwwp.s.', '..s..pppp...', '.....pppp...', '.....bbbbb..', '....bbb.bb..',
    '..sss....s..', '.ss......s..', 'kk.......s..', '.........s..', '.........s..', '........kkk.'],
  runB: [
    '......hhh...', '.....hhhhs..', '.....hhsss..', '......sss...', '.......s....', '.....ppppp..',
    '....spppps..', '....spwwps..', '.....pppp...', '.....pppp...', '.....bbbbb..', '.....bbbbbs.',
    '......s...s.', '......s...s.', '......s..kk.', '......s.....', '......s.....', '.....kkk....'],
  runC: [
    '......hhh...', '.....hhhhs..', '.....hhsss..', '......sss...', '.......s....', '.....ppppp..',
    '....spppppp.', '...s.pwwp..s', '.....pppp...', '.....pppp...', '.....bbbbb..', '....bb..bbb.',
    '....s.....ss', '...s......s.', '..s.......s.', '..s......kk.', '.s..........', 'kk..........'],
  jump: [
    '......hhh...', '.....hhhhs..', '.....hhsss..', '......sss.s.', '.......s.s..', '.....ppppp..',
    '....sppppp..', '...s.pwwp...', '..s..pppp...', '.....pppp...', '.....bbbbbb.', '.....bbbbbss',
    '...........s', '...........s', '..........kk', '............', '............', '............'],
  crouch: [
    '............', '............', '............', '............', '............', '............',
    '............', '.......hhh..', '......hhhhs.', '......hhsss.', '..ppppppss..', '.ppppwwps...',
    'bbpppppps...', 'bbbs...s....', '.s.s...s....', '.s..s..s....', 's...s..s....', 'kk..kk.ss...'],
  throw: [
    '.....hhh....', '....hhhhs...', '....hhsss...', '.....sss....', '......s.....', '....ppppp...',
    '...sppppps..', '..s.pwwwp.s.', '.s..ppppp..s', '....ppppp...', '....bbbbb...', '...bbb.bbb..',
    '..ss.....ss.', '.ss.......s.', '.s.........s', 's..........s', 's..........s', 'kk........kk'],
};
const PALETTES = {
  player: { h: '#2b1b17', s: '#b97a4a', p: '#ff3d7f', w: '#ffffff', b: '#1d2b53', k: '#ffffff' },
  rival:  { h: '#111111', s: '#e8b98a', p: '#3dd6d0', w: '#1d2b53', b: '#f4efe6', k: '#ffd23f' },
  rival2: { h: '#1a1a1a', s: '#6b4226', p: '#ffd23f', w: '#2e8b57', b: '#2e8b57', k: '#ffffff' },
  rival3: { h: '#e8c15a', s: '#f1c9a5', p: '#b388ff', w: '#ffffff', b: '#111111', k: '#ff3d7f' },
};
const RUN_CYCLE = ['runA', 'runB', 'runC', 'runB'];
let sprites = {};
let skyG, skylineG, palmsG, crowdA, crowdB, boardsG;

function buildSprites() {
  for (const pk in PALETTES) {
    sprites[pk] = {};
    for (const fk in FRAMES) {
      const rows = FRAMES[fk];
      const img = createImage(12, rows.length);
      img.loadPixels();
      rows.forEach((row, y) => {
        for (let x = 0; x < 12; x++) {
          const ch = row[x];
          if (ch && ch !== '.') img.set(x, y, color(PALETTES[pk][ch]));
        }
      });
      img.updatePixels();
      sprites[pk][fk] = img;
    }
  }
}

function drawSprite(pal, frame, x, footY) {
  const img = sprites[pal][frame];
  g.image(img, Math.round(x - 6), Math.round(footY - img.height));
}
function runFrame(anim, v) { return v < 0.3 ? 'stand' : RUN_CYCLE[Math.floor(anim) % 4]; }
function shadow(x, footY) { g.fill(0, 0, 0, 70); g.rect(Math.round(x - 5), footY - 1, 10, 2); }

function makeLayer(w, h) {
  const l = createGraphics(w, h);
  l.pixelDensity(1); l.noSmooth(); l.noStroke(); l.textFont(FONT);
  return l;
}

// The stadium backdrop is drawn once into layers, then scrolled with parallax.
function buildBackdrop() {
  randomSeed(2028);

  // sunset sky, synthwave sun, and hills
  skyG = makeLayer(W, 100);
  const bands = ['#1b0b3a', '#2d0f57', '#4a1470', '#6f1b7f', '#9b2283', '#c42d7e', '#e8456f', '#f76b5e', '#fb9553', '#fdb95c'];
  bands.forEach((c, i) => { skyG.fill(c); skyG.rect(0, i * 8, W, 8); });
  for (let i = 1; i < bands.length; i++) {          // checker-dither the seams like old hardware
    skyG.fill(bands[i]);
    for (let x = i % 2; x < W; x += 2) skyG.rect(x, i * 8 - 1, 1, 1);
  }
  const sunX = 236, sunY = 78, r = 30;
  for (let y = -r; y <= 0; y++) {
    if (y > -18 && (-y) % 5 < (y > -8 ? 2 : 1)) continue;   // the classic striped sun
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    skyG.fill(lerpColor(color('#fff27a'), color('#ff5f8f'), (y + r) / r));
    skyG.rect(sunX - hw, sunY + y, hw * 2, 1);
  }
  skyG.fill('#4b1a6b');
  for (let x = 0; x < W; x++) {
    const h = 12 + 6 * Math.sin(x * 0.03) + 4 * Math.sin(x * 0.071 + 1);
    skyG.rect(x, Math.round(80 - h), 1, 30);
  }

  // downtown skyline
  skylineG = makeLayer(400, 90);
  for (let x = 0; x < 400;) {
    const w = Math.min(Math.floor(random(10, 26)), 400 - x);
    const tall = random() < 0.15;
    const h = Math.floor(tall ? random(44, 54) : random(14, 38));
    const top = 86 - h;
    skylineG.fill('#2a0f45');
    skylineG.rect(x, top, w, h);
    if (tall) skylineG.rect(x + Math.floor(w / 2), top - 6, 1, 6);
    for (let y = top + 3; y < 80; y += 4) {
      for (let x2 = x + 2; x2 < x + w - 2; x2 += 3) {
        if (random() < 0.25) { skylineG.fill(random() < 0.8 ? '#ffcf6b' : '#ff7ab0'); skylineG.rect(x2, y, 1, 1); }
      }
    }
    x += w + Math.floor(random(0, 4));
  }

  // palm trees
  palmsG = makeLayer(300, 90);
  [[30, 52], [150, 62], [235, 46]].forEach(([x, h]) => palm(palmsG, x, h));

  // grandstand with a crowd (two frames so they can jump when excited)
  const crowd = [];
  const shirts = ['#ff3d7f', '#ffd23f', '#3dd6d0', '#ffffff', '#fb9553', '#7cff6b', '#5b8cff'];
  const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a21'];
  for (let row = 0; row < 5; row++) {
    crowd[row] = [];
    for (let x = 1 + (row % 2); x < 238; x += 3) {
      const aisle = (x % 80) < 5;
      crowd[row].push(aisle || random() < 0.12 ? null : { x, shirt: random(shirts), skin: random(skins) });
    }
  }
  crowdA = buildStands(crowd, false);
  crowdB = buildStands(crowd, true);

  // advertising boards
  const ads = [['SUNSET GAMES', '#ff3d7f', '#ffffff'], ['LOS ANGELES', '#1d2b53', '#ffd23f'], ['2028', '#ffd23f', '#1d2b53'],
               ['ONE BUTTON', '#3dd6d0', '#1d2b53'], ['GO FOR GOLD', '#fb9553', '#ffffff']];
  const widths = ads.map(a => a[0].length * 8 + 16);
  boardsG = makeLayer(widths.reduce((a, b) => a + b, 0), 10);
  boardsG.textSize(8);
  let bx = 0;
  ads.forEach(([t, bg, fg], i) => {
    boardsG.fill(bg); boardsG.rect(bx, 0, widths[i], 10);
    boardsG.fill('#0d0221'); boardsG.rect(bx, 0, 1, 10);
    boardsG.fill(fg); boardsG.text(t, bx + 8, 9);
    bx += widths[i];
  });
}

function palm(l, x, h) {
  l.fill('#1a0830');
  for (let i = 0; i < h; i++) l.rect(x + Math.round(Math.sin(i / h * 1.6) * 3), 86 - i, 2, 1);
  const tx = x + 3, ty = 86 - h;
  [-2.9, -2.4, -1.9, -1.3, -0.8, -0.3, 0.2].forEach(a => {
    for (let k = 0; k < 10; k++) l.rect(Math.round(tx + Math.cos(a) * k * 1.2), Math.round(ty + Math.sin(a) * k * 0.6 + k * k * 0.07), 2, 1);
  });
}

function buildStands(crowd, jumping) {
  const s = makeLayer(240, 26);
  s.fill('#2b0f4d'); s.rect(0, 0, 240, 26);
  s.fill('#ffd23f'); s.rect(0, 0, 240, 1);
  for (let x = 0; x < 240; x += 80) { s.fill('#3d1868'); s.rect(x, 1, 5, 25); }
  crowd.forEach((row, r) => {
    const y = 2 + r * 5;
    s.fill(r % 2 ? '#4a2270' : '#5b2a86'); s.rect(0, y + 4, 240, 1);
    row.forEach((p, i) => {
      if (!p) return;
      const up = jumping && (i + r) % 2 === 0 ? 1 : 0;
      s.fill(p.shirt); s.rect(p.x, y + 2 - up, 2, 2);
      s.fill(p.skin); s.rect(p.x, y - up, 2, 2);
    });
  });
  return s;
}

function tile(img, offset, y) {
  const w = img.width;
  for (let x = -(((offset % w) + w) % w); x < W; x += w) g.image(img, Math.floor(x), y);
}

// sky + city + palms + crowd + ad boards, scrolling at different speeds
function drawBackdrop(cam) {
  g.image(skyG, 0, 0);
  tile(skylineG, cam * 0.1, 0);
  tile(palmsG, cam * 0.3, 0);
  const cheering = hype > 0.15 && Math.floor(millis() / 120) % 2 === 0;
  tile(cheering ? crowdB : crowdA, cam * 0.5, 74);
  tile(boardsG, cam, 98);
}

function drawGrass(cam, top = 150) {
  g.fill('#2f8f46'); g.rect(0, top, W, H - top);
  g.fill('#37a352');
  const off = ((cam % 48) + 48) % 48;
  for (let x = -off; x < W; x += 48) g.rect(Math.round(x), top, 24, H - top);
}

// the 4-lane race track
function drawTrackBase(cam) {
  g.fill('#c2452d'); g.rect(0, 108, W, 42);
  g.fill('#b03a24');
  for (let y = 113; y < 149; y += 5) g.rect(0, y, W, 1);
  g.fill('#f4efe6');
  g.rect(0, 108, W, 1);
  LANES.forEach(y => g.rect(0, y + 2, W, 1));
  drawGrass(cam);
}

// a single runway across the infield grass (long jump and javelin), ending at endM meters
const RUNWAY_TOP = 133, RUNWAY_BOT = 148;
function drawRunway(cam, endM) {
  g.fill('#c2452d'); g.rect(0, 108, W, 2);   // the edge of the race track behind the infield
  drawGrass(cam, 110);
  const end = Math.min(W, wx(endM, cam));
  if (end <= 0) return;
  g.fill('#c2452d'); g.rect(0, RUNWAY_TOP, end, RUNWAY_BOT - RUNWAY_TOP);
  g.fill('#b03a24'); g.rect(0, RUNWAY_TOP + 5, end, 1); g.rect(0, RUNWAY_TOP + 10, end, 1);
  g.fill('#f4efe6'); g.rect(0, RUNWAY_TOP, end, 1); g.rect(0, RUNWAY_BOT - 1, end, 1);
}

function drawTicks(cam, from, to, labels = true) {
  const first = Math.max(from, Math.floor(cam / PPM / 10) * 10);
  for (let m = first; m <= to && m * PPM - cam < W + 10; m += 10) {
    const sx = wx(m, cam);
    g.fill('#f4efe6'); g.rect(sx, 109, 1, 4);
    if (labels && m > 0) txt(String(m % 1000), sx + 3, 120, '#f6c1b0');
  }
}

function drawLine(cam, m, checkered) {
  const sx = wx(m, cam);
  if (sx < -6 || sx > W + 6) return;
  if (!checkered) { g.fill('#f4efe6'); g.rect(sx, 108, 2, 42); return; }
  for (let y = 108; y < 150; y += 2) {
    g.fill(((y / 2) % 2) ? '#111' : '#fff'); g.rect(sx, y, 2, 2);
    g.fill(((y / 2) % 2) ? '#fff' : '#111'); g.rect(sx + 2, y, 2, 2);
  }
}

function drawHurdle(sx, footY, down) {
  if (sx < -12 || sx > W + 12) return;
  if (!down) {
    g.fill('#bbbbbb'); g.rect(sx - 2, footY - 1, 5, 1); g.rect(sx + 1, footY - 2, 5, 1);
    g.fill('#eeeeee'); g.rect(sx, footY - 12, 1, 12); g.rect(sx + 4, footY - 13, 1, 11);
    g.fill('#ff3d7f'); g.rect(sx - 1, footY - 15, 7, 3);
    g.fill('#ffffff'); g.rect(sx + 1, footY - 15, 2, 3);
  } else {
    g.fill('#eeeeee'); g.rect(sx - 1, footY - 2, 12, 1);
    g.fill('#ff3d7f'); g.rect(sx + 10, footY - 4, 3, 4);
  }
}

// ============================================================
//  UI HELPERS
// ============================================================

function txt(s, x, y, col = '#fff', align = 'left', size = 8) {
  g.textSize(size);
  g.textAlign(align === 'center' ? CENTER : align === 'right' ? RIGHT : LEFT, BASELINE);
  g.fill(0); g.text(s, Math.round(x) + 1, Math.round(y) + 1);
  g.fill(col); g.text(s, Math.round(x), Math.round(y));
}
function blink(rate = 2) { return Math.floor(millis() / (500 / rate)) % 2 === 0; }
function panel(x, y, w, h) {
  g.fill('#ff3d7f'); g.rect(x - 2, y - 2, w + 4, h + 4);
  g.fill('#ffd23f'); g.rect(x - 1, y - 1, w + 2, h + 2);
  g.fill('#140829'); g.rect(x, y, w, h);
}
function meter(label, frac, x, y, segs = 24) {
  txt(label, x, y + 8);
  const bx = x + label.length * 8 + 4, lit = Math.round(constrain(frac, 0, 1) * segs);
  for (let i = 0; i < segs; i++) {
    const c = i < segs * 0.5 ? '#7cff6b' : i < segs * 0.8 ? '#ffd23f' : '#ff3d7f';
    g.fill(i < lit ? c : '#103a20'); g.rect(bx + i * 5, y, 4, 8);
  }
}
function gauge(cx, cy, degrees, r = 16, label = true) {
  g.fill(0, 0, 0, 90); g.arc(cx, cy, r * 2, r * 2, -Math.PI / 2, 0, PIE);
  g.fill(124, 255, 107, 150); g.arc(cx, cy, r * 2, r * 2, -rad(55), -rad(35), PIE);   // the sweet spot
  g.noFill(); g.stroke('#f4efe6'); g.strokeWeight(1);
  g.arc(cx, cy, r * 2, r * 2, -Math.PI / 2, 0);
  g.line(cx, cy, cx + r, cy); g.line(cx, cy, cx, cy - r);
  g.stroke('#ff3d7f'); g.line(cx, cy, cx + Math.cos(rad(degrees)) * r, cy - Math.sin(rad(degrees)) * r);
  g.noStroke();
  if (label) txt(Math.round(degrees) + '', cx - 6, cy, '#fff', 'right');
}
function drawFlag(sx, groundY, col, tall = 14) {
  if (sx < -10 || sx > W + 10) return;
  g.fill('#ffffff'); g.rect(sx, groundY - tall, 1, tall);
  g.fill(col); g.rect(sx + 1, groundY - tall, 6, 4);
}
function drawMedal(x, y, type) {
  g.fill('#ff3d7f'); g.rect(x - 3, y - 9, 2, 5);
  g.fill('#3dd6d0'); g.rect(x + 1, y - 9, 2, 5);
  g.fill(MEDAL_COL[type]); g.circle(x, y - 1, 9);
  g.fill(0, 0, 0, 50); g.circle(x, y - 1, 5);
}
function drawJavelin(sx, sy, a, len = 13) {
  const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
  g.strokeWeight(3); g.stroke('#140829'); g.line(sx - dx, sy - dy, sx + dx, sy + dy);   // dark outline so it reads against the sky
  g.strokeWeight(1); g.stroke('#ffffff'); g.line(sx - dx, sy - dy, sx + dx, sy + dy);
  g.stroke('#ffd23f'); g.line(sx + dx * 0.6, sy + dy * 0.6, sx + dx, sy + dy);
  g.noStroke();
}
function hint(s, col = '#ffd23f') { if (blink(3)) txt(s, W / 2, 38, col, 'center'); }

// ============================================================
//  ATHLETIC EVENTS
//  Each event is a class with the same shape:
//    press() / release()  - the one button
//    update(dt)           - physics
//    draw()               - pixels
//    finish(mark, note)   - ends the attempt (mark = null means no mark)
// ============================================================

class AthleticEvent {
  constructor(def, field) {
    this.def = def;
    this.field = field;   // the three rivals and the marks they'll post in this event
    this.best = null;     // your best mark from earlier attempts (field events)
    this.t = 0;
    this.done = false;
    this.doneT = 0;
    this.mark = null;
    this.note = '';
    this.holding = false;
  }
  press() { this.holding = true; }
  release() { this.holding = false; }
  update(dt) { this.t += dt; }
  hudValue() { return ''; }
  finish(mark, note = '') {
    if (this.done) return;
    this.done = true; this.doneT = this.t; this.mark = mark; this.note = note;
    if (mark !== null && (this.best === null || better(this.def, mark, this.best))) { hype = 1; sfx.cheer(); }
    else if (note) sfx.foul();
  }
}

// ----- shared by the two races: countdown, false starts, rivals in lanes, finish line -----
const RACE_ACCEL = 4;   // how hard the CPU runners accelerate (m/s per second)
// the top speed that makes a runner who accelerates at RACE_ACCEL finish exactly in time T
function topSpeedFor(T, L) {
  const d = T * T - 2 * L / RACE_ACCEL;
  return d > 0 ? RACE_ACCEL * (T - Math.sqrt(d)) : L / T * 1.2;
}
class Race extends AthleticEvent {
  constructor(def, field, length) {
    super(def, field);
    this.length = length;
    this.phase = 'marks'; this.phaseT = 0;
    this.setDur = random(0.8, 1.8);
    this.x = 0; this.v = 0; this.anim = 0; this.h = 0;
    this.time = 0;
    this.hurdleXs = [];
    // rivals take lanes 1-3 and run at a pace that crosses the line exactly on their rolled time
    this.runners = field.map((r, i) => ({ ...r, lane: LANES[i], x: 0, v: 0, anim: random(4), h: 0, airT: -1, top: topSpeedFor(r.mark, length) }));
  }
  press() {
    super.press();
    if (this.phase === 'marks' || this.phase === 'set') this.falseStart();
  }
  // pressing before GO ends this attempt (it uses up one of your 3 tries)
  falseStart() {
    this.holding = false;
    this.phase = 'false';
    this.finish(null, 'FALSE START!');
  }
  update(dt) {
    super.update(dt);
    this.phaseT += dt;
    if (this.phase === 'marks' && this.phaseT > 1.4) { this.phase = 'set'; this.phaseT = 0; sfx.beep(); }
    else if (this.phase === 'set' && this.phaseT > this.setDur) { this.phase = 'go'; this.phaseT = 0; sfx.go(); }
    if (this.phase !== 'go') return;
    if (!this.done) {
      this.time += dt;
      if (this.time > 30) this.finish(null, 'DID NOT FINISH');
    }
    for (const r of this.runners) {
      r.v = Math.min(r.top, r.v + RACE_ACCEL * dt);
      r.x += r.v * dt;
      r.anim += r.v * dt * 0.9;
      // CPU runners clear every hurdle perfectly
      if (r.airT < 0) {
        const next = this.hurdleXs.find(hx => hx > r.x);
        if (next !== undefined && next - r.x < 2.3) r.airT = 0;
      } else {
        r.airT += dt;
        const f = r.airT / AIR;
        r.h = 4 * 1.3 * f * (1 - f);
        if (f >= 1) { r.airT = -1; r.h = 0; }
      }
    }
  }
  move(dt) {
    this.x += this.v * dt;
    this.anim += this.v * dt * 0.9;
    if (!this.done && this.x >= this.length) {
      const over = (this.x - this.length) / Math.max(this.v, 0.1);   // exact moment we crossed
      this.finish(this.time - over);
    }
  }
  hudValue() { return (this.done && this.mark !== null ? this.mark : this.time).toFixed(2) + 'S'; }
  cam() { return Math.max(-110, this.x * PPM - 110); }
  pose(anim, v, h, stumble) {
    if (this.phase === 'marks' || this.phase === 'set') return 'crouch';
    if (this.phase !== 'go') return 'stand';
    if (h > 0.05) return 'jump';
    if (stumble) return 'throw';
    return runFrame(anim, v);
  }
  drawRace(cam, playerHurdles, stumble) {
    drawBackdrop(cam);
    drawTrackBase(cam);
    drawTicks(cam, 0, this.length, this.hurdleXs.length === 0);
    drawLine(cam, 0, false);
    drawLine(cam, this.length, true);
    // back lanes first so nearer runners overlap them
    for (const r of this.runners) {
      this.hurdleXs.forEach(hx => drawHurdle(wx(hx, cam), r.lane, false));
      shadow(wx(r.x, cam), r.lane);
      drawSprite(r.pal, this.pose(r.anim, r.v, r.h), wx(r.x, cam), r.lane - r.h * PPM);
    }
    const you = LANES[3];
    playerHurdles.forEach(hd => drawHurdle(wx(hd.x, cam), you, hd.down));
    shadow(wx(this.x, cam), you);
    drawSprite('player', this.pose(this.anim, this.v, this.h, stumble), wx(this.x, cam), you - this.h * PPM);
    if (this.phase === 'marks' || this.phase === 'set') txt('YOU>', wx(this.x, cam) - 8, you - 1, '#ff3d7f', 'right');
  }
  drawCountdown() {
    if (this.phase === 'marks') txt('ON YOUR MARKS', W / 2, 66, '#fff', 'center');
    else if (this.phase === 'set') txt('SET...', W / 2, 70, '#ffd23f', 'center', 16);
    else if (this.phase === 'go' && this.phaseT < 0.8) txt('GO!', W / 2, 76, '#7cff6b', 'center', 24);
  }
}

// ----- 100M DASH: mash to run -----
class Dash extends Race {
  constructor(def, field) { super(def, field, 100); }
  press() {
    super.press();
    if (this.phase === 'go' && !this.done) { this.v = Math.min(12.5, this.v + 1.65); sfx.step(); }
  }
  update(dt) {
    super.update(dt);
    if (this.phase !== 'go') return;
    this.v -= this.v * (this.done ? 1.6 : 1.2) * dt;   // you slow down unless you keep mashing
    this.move(dt);
  }
  draw() {
    this.drawRace(this.cam(), [], false);
    meter('SPEED', this.v / 11.5, 8, 158);
    if (this.phase === 'go' && !this.done && this.phaseT > 0.8) hint('MASH SPACE!');
    this.drawCountdown();
  }
}

// ----- 110M HURDLES: hold to run, release to jump -----
const AIR = 0.55;    // seconds in the air per hurdle jump
class Hurdles extends Race {
  constructor(def, field) {
    super(def, field, 110);
    this.hurdleXs = Array.from({ length: 10 }, (_, i) => 13.72 + i * 9.14);
    this.hs = this.hurdleXs.map(x => ({ x, down: false }));   // your lane's hurdles can be knocked over
    this.airT = -1; this.stumble = 0;
  }
  release() {
    super.release();
    if (this.phase === 'go' && !this.done && this.airT < 0) { this.airT = 0; sfx.jump(); }
  }
  update(dt) {
    super.update(dt);
    if (this.phase !== 'go') return;
    this.stumble -= dt;
    if (this.airT < 0) {
      if (this.holding && !this.done && this.stumble <= 0) this.v = Math.min(9, this.v + 3.6 * dt);
      else this.v = Math.max(0, this.v - (this.done ? 6 : 2.5) * dt);
    } else {
      this.airT += dt;
      const f = this.airT / AIR;
      this.h = 4 * 1.3 * f * (1 - f);
      if (f >= 1) { this.airT = -1; this.h = 0; }
    }
    this.move(dt);
    for (const hd of this.hs) {
      if (!hd.down && Math.abs(this.x - hd.x) < 0.35 && this.h < 0.9) {
        hd.down = true; this.v *= 0.45; this.stumble = 0.35; sfx.hit();
      }
    }
  }
  draw() {
    this.drawRace(this.cam(), this.hs, this.stumble > 0);
    meter('SPEED', this.v / 9, 8, 158);
    if (this.phase === 'go' && !this.done && this.phaseT > 0.8) {
      const next = this.hs.find(h => h.x > this.x);
      if (next && next.x - this.x < 3.5 && this.airT < 0 && this.x < 35) hint('RELEASE TO JUMP!', '#7cff6b');
      else if (!this.holding && this.airT < 0) hint('HOLD SPACE TO RUN');
    }
    this.drawCountdown();
  }
}

// ----- LONG JUMP: mash to sprint, hold at the board, release at the right angle -----
// Like the arcade original, the spot where you START holding is your take-off point.
// The athlete then plants and freezes while the angle rises, so speed and angle are two separate decisions.
const TAKEOFF_ZONE = 2.5;   // meters of yellow zone before the board
class LongJump extends AthleticEvent {
  constructor(def, field) {
    super(def, field);
    this.x = -45; this.v = 0; this.anim = 0; this.h = 0;
    this.phase = 'run'; this.angle = 0; this.pressT = -9; this.pressX = this.x;
  }
  press() {
    super.press();
    if (this.phase === 'run') { this.v = Math.min(11.5, this.v + 1.65); this.pressT = this.t; this.pressX = this.x; sfx.step(); }
  }
  release() {
    super.release();
    if (this.phase === 'plant') this.takeoff();
  }
  takeoff() {
    const th = rad(this.angle);
    this.R = this.v * this.v * Math.sin(2 * th) / 9.8 * 0.68;
    this.x0 = this.x; this.fT = 0;
    this.fDur = 0.35 + this.R * 0.08;
    this.peak = Math.min(3, this.R * Math.tan(th) / 4 + 0.2);
    this.phase = 'air';
    sfx.jump();
  }
  update(dt) {
    super.update(dt);
    if (this.phase === 'run') {
      if (this.holding && this.t - this.pressT > 0.15) {
        // that press was a hold, not a mash: plant your foot where you pressed
        if (this.pressX > 0) { this.phase = 'foul'; this.finish(null, 'FOUL!'); }
        else {
          // anywhere in the yellow zone counts as a perfect take-off from the board
          this.phase = 'plant'; this.plantT = 0; sfx.blip();
          this.x = this.pressX >= -TAKEOFF_ZONE ? 0 : this.pressX;
        }
        return;
      }
      this.v -= this.v * (this.holding ? 0.25 : 1.2) * dt;
      this.x += this.v * dt;
      this.anim += this.v * dt * 0.9;
      if (!this.holding && this.x > 0.4) { this.phase = 'foul'; this.finish(null, 'FOUL!'); }
      else if (this.t > 20) { this.phase = 'foul'; this.finish(null, 'NO JUMP'); }
    } else if (this.phase === 'plant') {
      this.plantT += dt;
      this.angle = 85 * (1 - Math.abs(((this.plantT / 0.7) % 2) - 1));   // swings 0 -> 85 -> 0 while you hold
    } else if (this.phase === 'air') {
      this.fT += dt;
      const f = Math.min(1, this.fT / this.fDur);
      this.x = this.x0 + this.R * f;
      this.h = 4 * this.peak * f * (1 - f);
      if (f >= 1) {
        this.phase = 'land'; this.h = 0; sfx.land();
        this.finish(Math.max(0, Math.floor(this.x * 100) / 100));
      }
    } else if (this.phase === 'foul') {
      this.v = Math.max(0, this.v - 12 * dt);
      this.x += this.v * dt;
      this.anim += this.v * dt * 0.9;
    }
  }
  hudValue() { return this.done && this.mark !== null ? fmt(this.def, this.mark) : ''; }
  draw() {
    const cam = Math.round(this.x * PPM - 120);
    drawBackdrop(cam);
    drawRunway(cam, 0.5);
    // take-off zone: hold SPACE inside it
    g.fill(255, 210, 63, 90); g.rect(wx(-TAKEOFF_ZONE, cam), RUNWAY_TOP + 1, Math.round(TAKEOFF_ZONE * PPM), RUNWAY_BOT - RUNWAY_TOP - 2);
    // sand pit, a little wider than the runway
    const p0 = wx(0.5, cam), p1 = wx(10, cam);
    g.fill('#c9a15e'); g.rect(p0 - 1, RUNWAY_TOP - 4, p1 - p0 + 2, RUNWAY_BOT - RUNWAY_TOP + 8);
    g.fill('#e9c27a'); g.rect(p0, RUNWAY_TOP - 3, p1 - p0, RUNWAY_BOT - RUNWAY_TOP + 6);
    g.fill('#d4a85c');
    for (let m = 1; m < 10; m++) {
      const sx = wx(m, cam);
      g.rect(sx, RUNWAY_TOP - 3, 1, 3);
      if (m % 2 === 0) txt(String(m), sx - 3, RUNWAY_TOP - 6, '#f4efe6');
    }
    if (this.best !== null) { g.fill(YOU.col); g.rect(wx(this.best, cam), RUNWAY_TOP - 3, 1, RUNWAY_BOT - RUNWAY_TOP + 6); }   // your best so far
    // take-off board
    g.fill('#ffffff'); g.rect(wx(-0.2, cam), RUNWAY_TOP + 1, Math.max(2, Math.round(0.2 * PPM)), RUNWAY_BOT - RUNWAY_TOP - 2);
    g.fill('#ff3d7f'); g.rect(wx(0, cam), RUNWAY_TOP + 1, 1, RUNWAY_BOT - RUNWAY_TOP - 2);
    // the rivals' marks, and yours once you land
    this.field.forEach(r => r.mark !== null && drawFlag(wx(r.mark, cam), SOLO + 2, r.col));
    if (this.phase === 'land') drawFlag(wx(this.x, cam), SOLO + 2, YOU.col, 18);
    // athlete
    const sx = wx(this.x, cam);
    shadow(sx, SOLO);
    const frame = this.phase === 'air' ? 'jump' : this.phase === 'land' ? 'crouch' : this.phase === 'plant' ? 'runB' : runFrame(this.anim, this.v);
    drawSprite('player', frame, sx, SOLO - this.h * PPM);
    if (this.phase === 'plant') gauge(sx + 10, SOLO - 22, this.angle, 20, false);
    // HUD
    meter('SPEED', this.v / 11.5, 8, 158, 20);
    txt('ANGLE', 214, 174);
    gauge(298, 174, this.angle);
    if (this.phase === 'run') {
      if (this.x < -12) hint('MASH SPACE!');
      else hint('HOLD SPACE IN THE YELLOW!', '#7cff6b');
    } else if (this.phase === 'plant') {
      if (this.angle >= 35 && this.angle <= 55) hint('LET GO NOW!', '#7cff6b');
      else txt('LET GO IN THE GREEN...', W / 2, 38, '#fff', 'center');
    }
  }
}

const JAV_VS = 4.5;   // javelin height is exaggerated (px per meter) so it flies up into the sky
// ----- JAVELIN: automatic run-up, tap to lock power, tap to throw at the swinging angle -----
class Javelin extends AthleticEvent {
  constructor(def, field) {
    super(def, field);
    this.x = -30; this.v = 0; this.anim = 0;
    this.phase = 'run'; this.power = 0; this.angle = 12; this.lockT = 0;
    this.camX = this.x * PPM - 120;
    this.jav = null;
  }
  powerNow() { return 1 - Math.abs(((this.t * 1.6) % 2) - 1); }                    // sweeps 0 -> 1 -> 0
  angleNow() { return 90 * (1 - Math.abs((((this.t - this.lockT) * 1.4) % 2) - 1)); } // sweeps 0 -> 90 -> 0
  press() {
    super.press();
    if (this.phase === 'run') { this.power = this.powerNow(); this.lockT = this.t; this.phase = 'aim'; sfx.blip(); }
    else if (this.phase === 'aim') this.throwIt();
  }
  throwIt() {
    this.angle = this.angleNow();
    const th = rad(constrain(this.angle, 1, 89));
    const R = (35 + 65 * this.power) * Math.sin(2 * th);
    this.jav = { x0: this.x + 0.4, x: this.x + 0.4, h: 2.4, R, t: 0, T: 0.9 + R / 45,
                 peak: Math.min(22, R * Math.tan(th) / 4), a: -th, landed: false };
    this.phase = 'thrown';
    sfx.whoosh();
  }
  update(dt) {
    super.update(dt);
    if (this.phase === 'run' || this.phase === 'aim') {
      this.v = Math.min(7.5, this.v + 5 * dt);
      this.x += this.v * dt;
      this.anim += this.v * dt * 0.9;
      if (this.phase === 'aim') this.angle = this.angleNow();
      if (this.x >= 0) { this.phase = 'foul'; this.finish(null, 'FOUL!'); }
    } else {
      this.v = Math.max(0, this.v - 16 * dt);
      this.x = Math.min(this.x + this.v * dt, this.phase === 'foul' ? 1 : -0.1);
    }
    const j = this.jav;
    if (j && !j.landed) {
      j.t += dt;
      const f = Math.min(1, j.t / j.T);
      const nx = j.x0 + j.R * f;
      const nh = 2.4 * (1 - f) + 4 * j.peak * f * (1 - f);
      if (nx !== j.x || nh !== j.h) j.a = Math.atan2(-(nh - j.h) * JAV_VS, (nx - j.x) * PPM);
      j.x = nx; j.h = nh;
      if (f >= 1) { j.landed = true; sfx.land(); this.finish(Math.max(0, Math.floor(j.x * 100) / 100)); }
    }
    const target = j ? j.x * PPM - 160 : this.x * PPM - 120;
    this.camX += (target - this.camX) * Math.min(1, dt * 6);
  }
  hudValue() { return this.done && this.mark !== null ? fmt(this.def, this.mark) : ''; }
  draw() {
    const cam = Math.round(this.camX);
    drawBackdrop(cam);
    drawRunway(cam, 0);
    // distance lines on the throwing field past the foul line
    const fx = wx(0, cam);
    if (fx < W) {
      for (let m = 10; m < 120; m += 10) {
        const sx = wx(m, cam);
        if (sx < -40 || sx > W) continue;
        g.fill('#f4efe6'); g.rect(sx, 112, 1, 38); txt(String(m), sx + 3, 122, '#f4efe6');
      }
      g.fill('#ffffff'); g.rect(fx - 1, 112, 2, 38);
      if (this.best !== null) { g.fill(YOU.col); g.rect(wx(this.best, cam), 112, 1, 38); }   // your best so far
    }
    this.field.forEach(r => r.mark !== null && drawFlag(wx(r.mark, cam), SOLO + 2, r.col));
    // athlete
    const sx = wx(this.x, cam);
    shadow(sx, SOLO);
    const frame = this.phase === 'thrown' ? 'throw' : this.phase === 'foul' && this.v < 0.3 ? 'stand' : runFrame(this.anim, this.v);
    drawSprite('player', frame, sx, SOLO);
    // javelin: in hand, flying, or stuck in the grass
    const j = this.jav;
    if (!j && this.phase !== 'foul') drawJavelin(sx + 1, SOLO - 13, -rad(this.angle));
    if (j) {
      const jx = j.x * PPM - cam, jy = SOLO - 2 - j.h * JAV_VS;
      if (j.landed) drawJavelin(jx - Math.cos(j.a) * 8, SOLO - 1 - Math.sin(j.a) * 8, j.a);
      else { shadow(jx, SOLO); drawJavelin(jx, jy, j.a); }
      if (j.landed) drawFlag(Math.round(jx) + 1, SOLO + 2, YOU.col, 18);
    }
    // HUD
    meter('POWER', this.phase === 'run' ? this.powerNow() : this.power, 8, 158, 20);
    txt('ANGLE', 214, 174);
    gauge(298, 174, this.angle);
    if (this.phase === 'run') hint('TAP TO LOCK POWER!');
    else if (this.phase === 'aim') hint('TAP TO THROW!', '#7cff6b');
  }
}

// ----- HAMMER THROW (seen from above): automatic spin, one tap to let go -----
const HP = 3, HCX = 160, HCY = 138;   // px per meter and circle position for the top-down view
const SECTOR = 30;                     // half-width of the legal landing zone, in degrees
const BALL_PX = 15;                    // drawn radius of the hammer wire
const MAX_TURNS = 7;
class Hammer extends AthleticEvent {
  constructor(def, field) {
    super(def, field);
    this.phase = 'ready'; this.a = Math.PI / 2; this.w = 1.6; this.spun = 0;
    this.ball = null; this.cam = 0; this.lastTurn = 0;
  }
  get turns() { return Math.floor(this.spun / (Math.PI * 2)); }
  inZone() { return Math.abs(deg(angDiff(this.a, -Math.PI / 2))) <= SECTOR; }
  press() {
    super.press();
    if (this.phase === 'spin') this.letGo(false);
  }
  letGo(lostBalance) {
    const off = deg(angDiff(this.a, -Math.PI / 2));
    const legal = !lostBalance && Math.abs(off) <= SECTOR;
    let dist = 11.5 * this.w * (1 - 0.35 * (off / SECTOR) ** 2);
    if (!legal) dist = Math.abs(off) > 90 ? 5.5 : 11.5 * this.w * 0.8;
    const dx = Math.cos(this.a), dy = -Math.sin(this.a);   // world y points up the field
    const r0 = BALL_PX / HP;
    this.ball = { sx: dx * r0, sy: dy * r0, ex: dx * dist, ey: dy * dist, x: dx * r0, y: dy * r0, h: 0,
                  t: 0, T: 0.8 + dist / 35, peak: dist * 0.18, legal, dist, lostBalance };
    this.phase = 'flight';
    sfx.whoosh();
  }
  update(dt) {
    super.update(dt);
    if (this.phase === 'ready') {
      this.a -= this.w * dt;                       // a couple of slow warm-up swings
      if (this.t > 1.8) this.phase = 'spin';
    } else if (this.phase === 'spin') {
      this.w = Math.min(7.2, 2.5 + 0.75 * this.spun / (Math.PI * 2));   // faster every turn
      this.a -= this.w * dt;
      this.spun += this.w * dt;
      if (this.turns > this.lastTurn) { this.lastTurn = this.turns; sfx.turn(); }
      if (this.turns >= MAX_TURNS) this.letGo(true);
    } else if (this.phase === 'flight') {
      const b = this.ball;
      b.t += dt;
      const f = Math.min(1, b.t / b.T);
      b.x = lerp(b.sx, b.ex, f); b.y = lerp(b.sy, b.ey, f);
      b.h = 4 * b.peak * f * (1 - f);
      if (f >= 1) {
        this.phase = 'landed'; sfx.land();
        if (b.legal) this.finish(Math.floor(b.dist * 100) / 100);
        else this.finish(null, b.lostBalance ? 'LOST BALANCE' : 'FOUL!');
      }
    }
    const target = this.ball ? Math.max(0, this.ball.y - 22) : 0;
    this.cam += (target - this.cam) * Math.min(1, dt * 5);
  }
  hudValue() { return this.done && this.mark !== null ? fmt(this.def, this.mark) : ''; }
  draw() {
    const cam = this.cam;
    const sy = wy => HCY - (wy - cam) * HP;
    // mowed grass
    for (let m = Math.floor(cam / 5) * 5 - 5; m < cam + 70; m += 5) {
      g.fill(Math.abs(Math.round(m / 5)) % 2 ? '#2f8f46' : '#37a352');
      const y0 = Math.round(sy(m + 5)), y1 = Math.round(sy(m));
      g.rect(0, y0, W, y1 - y0);
    }
    const cx = HCX, cy = Math.round(sy(0)), s = rad(SECTOR), up = -Math.PI / 2;
    // sector lines and distance arcs
    g.stroke(244, 239, 230); g.strokeWeight(1);
    g.line(cx, cy, cx + Math.cos(up - s) * 400, cy + Math.sin(up - s) * 400);
    g.line(cx, cy, cx + Math.cos(up + s) * 400, cy + Math.sin(up + s) * 400);
    g.noFill(); g.stroke(244, 239, 230, 120);
    for (let d = 10; d <= 100; d += 10) g.arc(cx, cy, d * HP * 2, d * HP * 2, up - s, up + s);
    g.noStroke();
    for (let d = 10; d <= 100; d += 10) {
      const lx = cx + Math.cos(up + s) * d * HP + 4, ly = cy + Math.sin(up + s) * d * HP + 4;
      if (ly > 26 && ly < H) txt(String(d), lx, ly, '#f4efe6');
    }
    // your best so far, and the rivals' marks
    if (this.best !== null) { g.noFill(); g.stroke(YOU.col); g.arc(cx, cy, this.best * HP * 2, this.best * HP * 2, up - s, up + s); g.noStroke(); }
    this.field.forEach((r, i) => {
      if (r.mark === null) return;
      const a = up + rad([-14, 4, 18][i]);
      drawFlag(Math.round(cx + Math.cos(a) * r.mark * HP), Math.round(cy + Math.sin(a) * r.mark * HP), r.col, 10);
    });
    // release zone wedge — lights up when the hammer is in it
    const lit = this.phase === 'spin' && this.inZone();
    g.fill(255, 210, 63, lit ? 140 : 50);
    g.arc(cx, cy, 56, 56, up - s, up + s, PIE);
    // throwing circle and safety cage
    g.fill('#bdb6c9'); g.circle(cx, cy, 18);
    g.fill('#a39bb3'); g.circle(cx, cy, 14);
    g.fill('#d9d9e6');
    for (let a = up + rad(40); a < up + Math.PI * 2 - rad(40); a += 0.1) g.rect(Math.round(cx + Math.cos(a) * 21), Math.round(cy + Math.sin(a) * 21), 1, 1);
    // athlete from above
    g.push();
    g.translate(cx, cy);
    g.rotate(this.a);
    g.fill(PALETTES.player.p); g.rect(-2, -5, 5, 10);
    g.fill(PALETTES.player.s); g.rect(2, -4, 4, 2); g.rect(2, 2, 4, 2);
    g.fill(PALETTES.player.h); g.circle(0, 0, 6);
    if (!this.ball) {
      g.stroke('#9a9a9a'); g.strokeWeight(1); g.line(6, 0, BALL_PX, 0); g.noStroke();
      g.fill('#2a2a2a'); g.circle(BALL_PX, 0, 5);
    }
    g.pop();
    // hammer in flight: shadow on the ground, ball above it
    const b = this.ball;
    if (b) {
      const bx = cx + b.x * HP, by = sy(b.y);
      g.fill(0, 0, 0, 80); g.ellipse(bx, by, 5, 3);
      g.fill('#2a2a2a'); g.circle(bx, by - b.h * HP * 0.5, 5 + b.h * 0.08);
      if (this.phase === 'landed' && b.legal) drawFlag(Math.round(bx), Math.round(by), YOU.col, 12);
    }
    // HUD
    meter('SPEED', (this.w - 1.5) / 5.7, 8, 166, 12);
    const turn = Math.min(this.turns + 1, MAX_TURNS);
    txt('TURN ' + turn + '/' + MAX_TURNS, 312, 174, turn >= 6 && blink(4) ? '#ff3d7f' : '#fff', 'right');
    if (this.phase === 'ready') txt('GET READY...', W / 2, 38, '#fff', 'center');
    else if (this.phase === 'spin') {
      if (this.turns >= 5) hint('LET GO OR YOU\'LL FALL!', '#ff3d7f');
      else if (this.turns < 2) hint('TAP IN THE YELLOW ZONE!');
      else txt('MORE TURNS = MORE SPEED', W / 2, 38, '#fff', 'center');
    }
  }
}

const EVENT_CLASSES = { dash: Dash, long: LongJump, javelin: Javelin, hurdles: Hurdles, hammer: Hammer };

// ============================================================
//  FLOW BETWEEN STATES
// ============================================================

function goto(s) { state = s; stateT = 0; }
function curDef() { return EVENTS.find(e => e.id === run.ids[run.idx]); }

function onPress() {
  if (state === 'title') { sfx.select(); menuIndex = 0; goto('menu'); }
  else if (state === 'menu') menuHoldStart = now();
  else if (state === 'intro') { if (stateT > 0.4) startEvent(); }
  else if (state === 'play') ev.press();
  else if (state === 'result') { if (stateT > 1) nextAfterResult(); }
  else if (state === 'over') { if (stateT > 1.5) { sfx.blip(); run = null; ev = null; goto('title'); } }
}

function onRelease() {
  if (state === 'menu' && menuHoldStart !== null) {      // a short tap moves to the next item
    menuHoldStart = null;
    menuIndex = (menuIndex + 1) % MENU.length;
    sfx.blip();
  } else if (state === 'play') ev.release();
}

function chooseMenu() {
  const item = MENU[menuIndex];
  run = { ids: item.ids, mode: item.mode, idx: 0, attempt: 1, results: [], last: null };
  sfx.select();
  newEvent();
}

// the rivals post their marks once per event, so all 3 of your attempts chase the same targets
function newEvent() {
  run.field = rollField(curDef());
  run.best = null;
  goto('intro');
}

function startEvent() {
  ev = new EVENT_CLASSES[curDef().id](curDef(), fieldAt(curDef(), run.field, run.attempt));
  ev.best = run.best;
  sfx.blip();
  goto('play');
}

// Field events: always 3 attempts, and your best one counts.
// Races: one race counts. A false start uses up one of your 3 starts and you line up again.
function endAttempt() {
  const def = ev.def, m = ev.mark;
  const pb = m !== null && (run.best === null || better(def, m, run.best));
  if (pb) run.best = m;
  const table = standings(def, fieldAt(def, run.field, run.attempt), run.best);
  const place = run.best !== null ? table.findIndex(r => r.you) + 1 : null;
  run.last = { mark: run.best, attemptMark: m, note: ev.note, pb, table, place,
               medal: place ? PLACE_MEDAL[place - 1] || null : null, pts: points(def, run.best) };
  goto('result');
}

function eventOver() { return run.attempt >= 3 || (!curDef().field && run.last.attemptMark !== null); }

function nextAfterResult() {
  if (!eventOver()) { run.attempt++; goto('intro'); return; }
  // no mark at all = 0 points; either way the Games carry on to the next event
  run.results.push({ def: curDef(), ...run.last, field: run.field });
  run.idx++; run.attempt = 1;
  if (run.idx >= run.ids.length) finishRun(); else newEvent();
}

// you win by finishing in the top 3 on total points
function finishRun() {
  run.standings = overall(run.results);
  run.rank = run.standings.findIndex(r => r.you) + 1;
  run.medal = PLACE_MEDAL[run.rank - 1] || null;
  const win = run.win = run.medal !== null;
  run.total = run.results.reduce((a, r) => a + r.pts, 0);
  if (run.mode === 'games' && run.total > hiScore) {
    hiScore = run.total; run.newHi = true;
    try { localStorage.setItem(HI_KEY, hiScore); } catch (e) {}
  }
  if (win) {
    hype = 1; sfx.fanfare(); setTimeout(sfx.cheer, 500);
    confetti = Array.from({ length: 90 }, () => ({ x: random(W), y: random(-H, 0), vy: random(20, 50), vx: random(-10, 10),
      c: random(['#ff3d7f', '#ffd23f', '#3dd6d0', '#ffffff', '#fb9553']) }));
  } else confetti = [];
  goto('over');
}

// ============================================================
//  SCREENS
// ============================================================

function drawAttract() {
  const cam = attractX * PPM - 140;
  drawBackdrop(cam);
  drawTrackBase(cam);
  drawTicks(cam, 0, 1e9);
  const anim = attractX * 1.1;
  [...RIVALS, YOU].forEach((r, i) => {
    const x = attractX + [-1.5, 0.8, -0.6, 0][i];
    shadow(wx(x, cam), LANES[i]); drawSprite(r.pal, runFrame(anim + i, 6), wx(x, cam), LANES[i]);
  });
}

function drawTitle() {
  drawAttract();
  txt('HI ' + String(hiScore).padStart(5, '0'), W - 6, 12, '#fff', 'right');
  txt('SUNSET GAMES', W / 2 + 2, 42, '#ff3d7f', 'center', 16);
  txt('SUNSET GAMES', W / 2, 40, '#ffd23f', 'center', 16);
  txt('LOS ANGELES  2028', W / 2, 54, '#fff', 'center');
  txt('ONE-BUTTON TRACK & FIELD', W / 2, 68, '#3dd6d0', 'center');
  if (blink(1.5)) txt('PRESS SPACE', W / 2, 172, '#fff', 'center');
}

function drawMenu() {
  drawAttract();
  panel(44, 24, 232, 140);
  txt('CHOOSE YOUR EVENT', W / 2, 38, '#ffd23f', 'center');
  MENU.forEach((m, i) => {
    const y = 56 + i * 13, sel = i === menuIndex;
    if (sel) { g.fill('#ff3d7f'); g.rect(52, y - 10, 216, 12); }
    txt((sel ? '> ' : '  ') + m.label, 60, y, sel ? '#fff' : '#b9a8d9');
  });
  txt(MENU[menuIndex].sub, W / 2, 140, '#3dd6d0', 'center');
  txt('TAP: NEXT   HOLD: CHOOSE', W / 2, 153, '#fff', 'center');
  // hold-to-choose progress bar
  const frac = menuHoldStart !== null && spaceDown ? Math.min(1, (now() - menuHoldStart) / HOLD_TO_PICK) : 0;
  g.fill('#2b0f4d'); g.rect(60, 157, 200, 4);
  g.fill('#7cff6b'); g.rect(60, 157, Math.round(200 * frac), 4);
}

function drawIntro() {
  const def = curDef();
  drawAttract();
  panel(36, 24, 248, 140);
  txt(run.mode === 'games' ? 'EVENT ' + (run.idx + 1) + ' OF ' + run.ids.length : 'PRACTICE', W / 2, 38, '#3dd6d0', 'center');
  txt(def.name, W / 2, 58, '#ffd23f', 'center', 16);
  def.how.forEach((line, i) => txt(line, W / 2, 76 + i * 11, '#fff', 'center'));
  const top = leader(def, fieldAt(def, run.field, run.attempt));
  if (def.field) txt(run.best !== null ? 'YOUR BEST SO FAR: ' + fmt(def, run.best) : 'BEST OF 3 ATTEMPTS COUNTS', W / 2, 121, run.best !== null ? YOU.col : '#3dd6d0', 'center');
  else txt('ONE RACE - 3 STARTS ALLOWED', W / 2, 121, '#3dd6d0', 'center');
  txt('LEADER: ' + top.name + ' ' + fmt(def, top.mark), W / 2, 132, top.col, 'center');
  txt(def.field ? 'ATTEMPT' : 'START', 112, 145, '#fff');
  for (let i = 0; i < 3; i++) {
    g.fill(i < run.attempt - 1 ? '#5a3a7a' : i === run.attempt - 1 ? '#ffd23f' : '#fff');
    g.rect(176 + i * 12, 138, 8, 8);
  }
  if (stateT > 0.4 && blink(1.5)) txt('PRESS SPACE WHEN READY', W / 2, 158, '#fff', 'center');
}

function drawHUD() {
  const def = ev.def;
  g.fill(13, 2, 33, 210); g.rect(0, 0, W, 23);
  txt(def.name, 6, 10, '#ffd23f');
  txt((def.field ? 'ATTEMPT ' : 'START ') + run.attempt + '/3', W - 6, 10, '#fff', 'right');
  if (def.field) txt('BEST ' + fmt(def, run.best), 6, 20, YOU.col);
  const top = leader(def, ev.field);
  txt('LEAD ' + fmt(def, top.mark), W / 2 + 12, 20, top.col, 'center');
  const v = ev.hudValue();
  if (v) txt(v, W - 6, 20, '#fff', 'right');
  if (state === 'play' && ev.done) {
    const pb = ev.mark !== null && (run.best === null || better(def, ev.mark, run.best));
    txt(ev.note || fmt(def, ev.mark), W / 2, 70, ev.note ? '#ff3d7f' : pb ? '#ffd23f' : '#fff', 'center', 16);
  }
}

function ordinal(n) { return n + (['ST', 'ND', 'RD'][n - 1] || 'TH'); }

function drawResult() {
  const def = ev.def, r = run.last, over = eventOver();
  panel(36, 22, 248, 146);
  txt(def.name + (def.field ? ' - ROUND ' + run.attempt : ' RESULTS'), W / 2, 34, '#3dd6d0', 'center');
  // scoreboard: everyone's best so far. Field events also show what each athlete did this round.
  if (def.field) { txt('ROUND ' + run.attempt, 206, 45, '#b9a8d9', 'right'); txt('BEST', 274, 45, '#b9a8d9', 'right'); }
  r.table.forEach((row, i) => {
    const y = 56 + i * 12;
    if (row.you) { g.fill('#ff3d7f'); g.rect(42, y - 10, 236, 12); }
    txt(row.mark === null ? '-' : String(i + 1), 48, y, '#fff');
    g.fill(row.col); g.rect(62, y - 7, 6, 6);
    txt(row.name, 74, y, '#fff');
    if (def.field) {
      const rm = row.you ? r.attemptMark : row.round;
      const improved = rm !== null && rm === row.mark;   // this round is their best so far
      txt(rm === null ? 'X' : fmt(def, rm), 206, y, rm === null ? (row.you ? '#fff' : '#ff3d7f') : improved ? (row.you ? '#fff' : '#7cff6b') : '#b9a8d9', 'right');
    } else txt(row.nat, 178, y, row.you ? '#fff' : '#b9a8d9');
    txt(fmt(def, row.mark), 274, y, row.you ? '#fff' : '#ffd23f', 'right');
  });
  // what just happened
  const thisOne = r.note || fmt(def, r.attemptMark);
  if (def.field) txt('YOUR ATTEMPT: ' + thisOne + (r.pb && run.attempt > 1 ? ' NEW BEST!' : ''), W / 2, 107, r.note ? '#ff3d7f' : r.pb ? '#7cff6b' : '#fff', 'center');
  else if (r.note) txt(r.note, W / 2, 107, '#ff3d7f', 'center');
  if (over) {
    if (r.medal) { drawMedal(W / 2 - 90, 121, r.medal); txt(ordinal(r.place) + ' PLACE: ' + r.medal + '!', W / 2 + 8, 121, MEDAL_COL[r.medal], 'center'); }
    else if (r.place) txt('4TH PLACE: NO MEDAL', W / 2, 121, '#b9a8d9', 'center');
    else txt('NO MARK', W / 2, 121, '#ff3d7f', 'center');
    txt('+' + r.pts + ' PTS', W / 2, 134, r.pts ? '#7cff6b' : '#ff3d7f', 'center');
    if (run.mode === 'games') {
      // where you stand overall once this event's points are in
      const after = overall([...run.results, { def, ...r, field: run.field }]);
      const pos = after.findIndex(x => x.you) + 1;
      txt('OVERALL: ' + ordinal(pos) + '  ' + after[pos - 1].pts + ' PTS', W / 2, 147, '#3dd6d0', 'center');
    }
  } else {
    const left = 3 - run.attempt;
    if (def.field) {
      txt(left + (left === 1 ? ' ATTEMPT' : ' ATTEMPTS') + ' LEFT', W / 2, 121, '#ffd23f', 'center');
      txt(run.best !== null ? 'TRY TO BEAT YOUR ' + fmt(def, run.best) : 'GET A MARK ON THE BOARD!', W / 2, 134, '#fff', 'center');
    } else {
      txt(left + (left === 1 ? ' START' : ' STARTS') + ' LEFT', W / 2, 121, '#ffd23f', 'center');
      txt('WAIT FOR "GO!"', W / 2, 134, '#fff', 'center');
    }
  }
  if (stateT > 1 && blink(1.5)) {
    const more = run.idx + 1 < run.ids.length;
    const next = !over ? (def.field ? 'PRESS SPACE: NEXT ATTEMPT' : 'PRESS SPACE: RESTART') : more ? 'PRESS SPACE: NEXT EVENT' : 'PRESS SPACE: FINAL RESULTS';
    txt(next, W / 2, 160, '#fff', 'center');
  }
}

function drawOver() {
  drawAttract();
  for (const p of confetti) { g.fill(p.c); g.rect(Math.round(p.x), Math.round(p.y), 2, 2); }
  panel(24, 12, 272, 160);
  const title = run.win ? (run.mode === 'games' ? 'CLOSING CEREMONY' : 'MEDAL WON!') : 'GAME OVER';
  txt(title, W / 2, 26, run.win ? '#ffd23f' : '#ff3d7f', 'center');
  const sub = run.medal ? 'YOU WIN ' + run.medal + '!' : ordinal(run.rank) + ' PLACE: NO MEDAL';
  if (run.medal) drawMedal(W / 2 - 64, 40, run.medal);
  txt(sub, W / 2 + (run.medal ? 8 : 0), 40, run.medal ? MEDAL_COL[run.medal] : '#fff', 'center');
  // your events
  run.results.forEach((r, i) => {
    const y = 56 + i * 10;
    txt(r.def.name, 32, y, '#fff');
    txt(r.mark !== null ? fmt(r.def, r.mark) : 'NO MARK', 220, y, r.mark !== null ? '#ffd23f' : '#ff3d7f', 'right');
    txt(String(r.pts), 284, y, '#3dd6d0', 'right');
  });
  // overall standings on points
  const y0 = 62 + run.results.length * 10;
  g.fill('#5a3a7a'); g.rect(32, y0 - 7, 256, 1);
  txt('FINAL STANDINGS', 32, y0 + 4, '#b9a8d9');
  if (run.mode === 'games') txt(run.newHi ? 'NEW HI!' : 'HI ' + hiScore, 284, y0 + 4, run.newHi ? '#7cff6b' : '#b9a8d9', 'right');
  run.standings.forEach((row, i) => {
    const y = y0 + 15 + i * 10;
    if (row.you) { g.fill('#ff3d7f'); g.rect(30, y - 8, 260, 10); }
    txt(String(i + 1), 34, y, '#fff');
    g.fill(row.col); g.rect(48, y - 7, 6, 6);
    txt(row.name, 60, y, '#fff');
    txt(row.nat, 160, y, row.you ? '#fff' : '#b9a8d9');
    txt(row.pts + ' PTS', 284, y, '#fff', 'right');
  });
  if (stateT > 1.5 && blink(1.5)) txt('PRESS SPACE TO PLAY AGAIN', W / 2, 169, '#fff', 'center');
}

// ============================================================
//  P5
// ============================================================

function setup() {
  pixelDensity(1);
  createCanvas(W, H);
  fitCanvas();
  g = createGraphics(W, H);
  g.pixelDensity(1); g.noSmooth(); g.noStroke(); g.textFont(FONT);
  try { hiScore = Number(localStorage.getItem(HI_KEY)) || 0; } catch (e) {}
  // wait for the pixel font so the ad boards are drawn with it (give up after 2s if offline)
  const font = document.fonts ? document.fonts.load(`8px "${FONT}"`).catch(() => {}) : Promise.resolve();
  Promise.race([font, new Promise(r => setTimeout(r, 2000))]).then(() => {
    buildSprites();
    buildBackdrop();
    ready = true;
  });
}

function fitCanvas() {
  const s = Math.max(1, Math.floor(Math.min(windowWidth / W, windowHeight / H)));
  resizeCanvas(W * s, H * s);
  noSmooth();
}
function windowResized() { fitCanvas(); }

function update(dt) {
  stateT += dt;
  hype = Math.max(0, hype - dt * 0.3);
  attractX += 5.5 * dt;
  if (state === 'menu' && menuHoldStart !== null && spaceDown && now() - menuHoldStart > HOLD_TO_PICK) {
    menuHoldStart = null; pressOwner = null;   // swallow the release so it doesn't count as a tap
    chooseMenu();
  }
  if ((state === 'play' || state === 'result') && ev) ev.update(dt);
  if (state === 'play' && ev.done && ev.t - ev.doneT > 1.8) endAttempt();
  if (state === 'over') {
    for (const p of confetti) { p.y += p.vy * dt; p.x += p.vx * dt; if (p.y > H) { p.y = -4; p.x = random(W); } }
  }
}

function draw() {
  background('#0d0221');
  if (!ready) return;
  update(Math.min(deltaTime / 1000, 0.05));
  g.clear();
  if (state === 'title') drawTitle();
  else if (state === 'menu') drawMenu();
  else if (state === 'intro') drawIntro();
  else if (state === 'play' || state === 'result') {
    ev.draw();
    drawHUD();
    if (state === 'result') drawResult();
  } else if (state === 'over') drawOver();
  image(g, 0, 0, width, height);
}
