/*
  Waterbender Side Scroller
  - Beginner-friendly single-file game loop.
  - Everything is written with plain JS + canvas.
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  healthText: document.getElementById('healthText'),
  healthBar: document.getElementById('healthBar'),
  waveText: document.getElementById('waveText'),
  levelText: document.getElementById('levelText'),
  scoreText: document.getElementById('scoreText'),
  overlay: document.getElementById('overlay'),
  overlayCard: document.getElementById('overlayCard')
};

const world = { width: 4200, groundY: 590, gravity: 1700, cameraX: 0 };
const keys = new Set();
const mouse = { x: 0, y: 0, down: false, draggingOrb: false, lastX: 0, lastY: 0 };

const state = {
  time: 0,
  score: 0,
  wave: 1,
  level: 1,
  bossLevel: 10,
  betweenWaves: false,
  gameOver: false,
  particles: [],
  structures: [],
  waterSources: [],
  hearts: [],
  enemies: [],
  projectiles: [],
  enemyProjectiles: [],
  nextSpawnIn: 1,
  enemiesToSpawn: 0
};

const player = {
  x: 130,
  y: world.groundY - 80,
  w: 40,
  h: 80,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  health: 100,
  maxHealth: 100,
  speed: 320,
  jumpPower: 680,
  meleeCd: 0,
  waveCd: 0,
  regenTimer: 0,
  upgrades: {
    maxOrb: 100,
    whipBonus: 0,
    unlockWave: true,
    freezeDuration: 1.8,
    punchPower: 12
  }
};

const orb = {
  x: player.x + 45,
  y: player.y + 32,
  vx: 0,
  vy: 0,
  radius: 20,
  mass: 1,
  maxRadius: 20,
  minRadius: 6,
  dragging: false,
  iceMode: false,
  regenRate: 12,
  lastSpeed: 0,
  tether: 180 // orb cannot go super far from player
};

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function setupWave(wave) {
  // Structures appear/disappear every wave.
  state.structures = [];
  const count = Math.min(3 + Math.floor(wave / 2), 7); // less frequent
  for (let i = 0; i < count; i++) {
    const type = Math.random() < 0.6 ? 'box' : 'arch';
    const w = type === 'box' ? rand(90, 160) : rand(120, 190);
    const h = type === 'box' ? rand(45, 85) : rand(55, 100); // jumpable
    state.structures.push({ x: rand(400, world.width - 350), y: world.groundY - h, w, h, type });
  }

  state.waterSources = [];
  state.hearts = [];
  for (let i = 0; i < 3; i++) state.waterSources.push(spawnPickup('water'));
  for (let i = 0; i < 2; i++) state.hearts.push(spawnPickup('heart'));

  state.enemies = [];
  state.enemyProjectiles = [];
  state.projectiles = [];
  state.enemiesToSpawn = 2 + Math.floor(wave * 1.2); // limited per wave
  state.nextSpawnIn = 0.5;
}

function spawnPickup(type) {
  // Avoid spawning near enemies/obstacles/player.
  for (let i = 0; i < 80; i++) {
    const x = rand(350, world.width - 150);
    const y = world.groundY - 24;
    const nearStructure = state.structures.some(s => dist(x, y, s.x + s.w / 2, s.y + s.h / 2) < 120);
    const nearEnemy = state.enemies.some(e => dist(x, y, e.x, e.y) < 140);
    const nearPlayer = dist(x, y, player.x, player.y) < 180;
    if (!nearStructure && !nearEnemy && !nearPlayer) return { x, y, r: type === 'heart' ? 13 : 16, type };
  }
  return { x: rand(350, world.width - 150), y: world.groundY - 24, r: 12, type };
}

function spawnEnemy() {
  for (let i = 0; i < 100; i++) {
    const x = rand(player.x + 500, Math.min(world.width - 100, player.x + 1200));
    const y = world.groundY - 74;
    const nearStructure = state.structures.some(s => dist(x, y, s.x + s.w / 2, s.y + s.h / 2) < 130);
    if (!nearStructure) {
      const size = rand(32, 50);
      const behaviorPool = ['patrol', 'jumper', 'evasive'];
      const behavior = behaviorPool[Math.floor(Math.random() * behaviorPool.length)];
      state.enemies.push({
        x, y, w: size * 0.7, h: size,
        vx: rand(-30, 30), vy: 0,
        health: 38 + state.wave * 7,
        maxHealth: 38 + state.wave * 7,
        speed: rand(70, 130) + state.wave * 6,
        behavior,
        patrolDir: Math.random() < 0.5 ? -1 : 1,
        jumpCd: rand(1.2, 2.8),
        shootCd: rand(1.5, 3.5),
        frozen: 0
      });
      return;
    }
  }
}

function spawnDragonBoss() {
  const boss = {
    x: player.x + 900,
    y: 220,
    w: 240,
    h: 120,
    vx: -70,
    vy: 0,
    health: 550 + state.wave * 30,
    maxHealth: 550 + state.wave * 30,
    behavior: 'bossDragon',
    weakpoints: [
      { xOff: -70, yOff: -10, r: 18, hp: 65 },
      { xOff: -10, yOff: -28, r: 18, hp: 65 },
      { xOff: 60, yOff: 2, r: 18, hp: 65 }
    ],
    fireCd: 2.2,
    frozen: 0
  };
  state.enemies.push(boss);
}

function doLevelUpMenu() {
  state.betweenWaves = true;
  ui.overlay.classList.remove('hidden');
  ui.overlayCard.innerHTML = `<h2>Wave ${state.wave - 1} cleared! Choose an upgrade:</h2>`;

  const options = [
    { t: '+20 Max Health', fn: () => { player.maxHealth += 20; player.health += 20; } },
    { t: 'Orb Power + (faster damage scaling)', fn: () => { player.upgrades.whipBonus += 0.35; } },
    { t: 'Freeze Duration +0.7s', fn: () => { player.upgrades.freezeDuration += 0.7; } },
    { t: 'Punch/Kick Damage +6', fn: () => { player.upgrades.punchPower += 6; } }
  ];

  options.forEach(opt => {
    const b = document.createElement('button');
    b.textContent = opt.t;
    b.onclick = () => {
      opt.fn();
      player.levelUp = (player.levelUp || 0) + 1;
      state.level += 1;
      state.betweenWaves = false;
      ui.overlay.classList.add('hidden');
      setupWave(state.wave);
    };
    ui.overlayCard.appendChild(b);
  });
}

function gameOverMenu() {
  state.gameOver = true;
  ui.overlay.classList.remove('hidden');
  ui.overlayCard.innerHTML = `<h2>Game Over</h2><p>Final score: ${Math.floor(state.score)}</p>`;
  const b = document.createElement('button');
  b.textContent = 'Restart';
  b.onclick = () => location.reload();
  ui.overlayCard.appendChild(b);
}

function handleInput(dt) {
  const left = keys.has('KeyA');
  const right = keys.has('KeyD');

  if (left) { player.vx = -player.speed; player.facing = -1; }
  else if (right) { player.vx = player.speed; player.facing = 1; }
  else player.vx *= 0.75;

  // Jump works even while dragging ice.
  if ((keys.has('KeyW') || keys.has('Space')) && player.onGround) {
    player.vy = -player.jumpPower;
    player.onGround = false;
  }

  // Basic melee when not dragging the orb.
  player.meleeCd -= dt;
  if (mouse.down && !mouse.draggingOrb && player.meleeCd <= 0) {
    player.meleeCd = 0.35;
    const hitbox = { x: player.x + (player.facing > 0 ? 20 : -50), y: player.y + 20, w: 50, h: 35 };
    state.enemies.forEach(e => {
      const eb = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
      if (rectsOverlap(hitbox, eb)) {
        e.health -= player.upgrades.punchPower;
        e.vx += player.facing * 150;
      }
    });
  }

  if (keys.has('KeyQ') && player.upgrades.unlockWave && player.waveCd <= 0) {
    // Water wave short-range push attack.
    player.waveCd = 1.8;
    const arcX = player.x + player.facing * 55;
    const arcY = player.y + 45;
    state.particles.push({ type: 'wave', x: arcX, y: arcY, r: 28, life: 0.35, facing: player.facing });
    state.enemies.forEach(e => {
      if (dist(arcX, arcY, e.x, e.y) < 120) {
        e.vx += player.facing * 380;
        e.vy -= 180;
        e.health -= 10;
      }
    });
  }
  player.waveCd -= dt;
}

function updateOrb(dt) {
  const anchorX = player.x + player.facing * 35;
  const anchorY = player.y + 35;

  if (mouse.draggingOrb) {
    orb.dragging = true;
    orb.iceMode = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const targetX = mouse.x + world.cameraX;
    const targetY = mouse.y;

    // Keep orb in tether range from player.
    let dx = targetX - anchorX;
    let dy = targetY - anchorY;
    const d = Math.hypot(dx, dy) || 1;
    if (d > orb.tether) {
      dx = (dx / d) * orb.tether;
      dy = (dy / d) * orb.tether;
    }
    const desiredX = anchorX + dx;
    const desiredY = clamp(anchorY + dy, 40, world.groundY - orb.radius);

    orb.vx = (desiredX - orb.x) * 18;
    orb.vy = (desiredY - orb.y) * 18;
    orb.lastSpeed = Math.hypot(orb.vx, orb.vy);
    orb.x += (desiredX - orb.x) * 0.45;
    orb.y += (desiredY - orb.y) * 0.45;

    // Whip damage based on speed, not holding still.
    state.enemies.forEach(e => {
      const near = dist(orb.x, orb.y, e.x, e.y) < orb.radius + Math.max(e.w, e.h) * 0.35;
      if (near && orb.lastSpeed > 220) {
        const dmg = (orb.lastSpeed / 280) * (5 + player.upgrades.whipBonus * 4);
        e.health -= dmg * dt * 18;
        e.vx += (orb.vx > 0 ? 1 : -1) * 45;
        orb.radius = Math.max(orb.minRadius, orb.radius - 0.012 * orb.lastSpeed * dt); // damage shrinks orb
        for (let i = 0; i < 2; i++) state.particles.push({ type: orb.iceMode ? 'ice' : 'water', x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-120, 20), life: 0.4 });
      }
    });

    // Slamming downward creates push burst.
    if (orb.vy > 320 && orb.y > world.groundY - 80) {
      state.enemies.forEach(e => {
        if (dist(orb.x, orb.y, e.x, e.y) < 110) {
          e.vy -= 280;
          e.vx += (e.x < orb.x ? -1 : 1) * 180;
        }
      });
    }
  } else {
    orb.dragging = false;
    orb.iceMode = false;

    // Free orb physics when not dragging.
    orb.vy += world.gravity * dt;
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;

    // Tether pull.
    let dx = orb.x - anchorX;
    let dy = orb.y - anchorY;
    const d = Math.hypot(dx, dy) || 1;
    if (d > orb.tether) {
      const pull = (d - orb.tether) * 8;
      orb.vx -= (dx / d) * pull;
      orb.vy -= (dy / d) * pull;
    }

    if (orb.y > world.groundY - orb.radius) {
      orb.y = world.groundY - orb.radius;
      orb.vy *= -0.35;
      orb.vx *= 0.86;
    }

    // Natural return drift near player.
    orb.vx += (anchorX - orb.x) * dt * 4;
    orb.vy += (anchorY - orb.y) * dt * 4;
    orb.vx *= 0.985;
    orb.vy *= 0.985;
  }

  // Water regeneration by touching water sources.
  state.waterSources.forEach(s => {
    if (dist(orb.x, orb.y, s.x, s.y) < orb.radius + s.r) {
      orb.radius = Math.min(orb.maxRadius, orb.radius + orb.regenRate * dt);
      for (let i = 0; i < 2; i++) state.particles.push({ type: 'water', x: s.x, y: s.y, vx: rand(-30, 30), vy: rand(-90, -20), life: 0.5 });
    }
  });

  // Block/reflect enemy fire with water.
  state.enemyProjectiles.forEach(p => {
    if (!p.dead && dist(p.x, p.y, orb.x, orb.y) < orb.radius + p.r + 4) {
      p.dead = true;
      state.projectiles.push({ x: p.x, y: p.y, vx: -p.vx * 1.1, vy: -Math.abs(p.vy * 0.2), r: 7, ice: false, fromReflect: true });
    }
  });
}

function launchFromOrb() {
  if (!orb.dragging) return;
  const speed = Math.hypot(orb.vx, orb.vy);
  const dirX = speed > 5 ? orb.vx / speed : player.facing;
  const dirY = speed > 5 ? orb.vy / speed : -0.1;
  const isIce = keys.has('ShiftLeft') || keys.has('ShiftRight');

  // Fast ice becomes triangular ice shard.
  const isShard = isIce && speed > 340;
  state.projectiles.push({
    x: orb.x,
    y: orb.y,
    vx: dirX * (isShard ? 700 : 540),
    vy: dirY * (isShard ? 700 : 540),
    r: isShard ? 13 : orb.radius * 0.7,
    ice: isIce,
    isShard,
    life: 1.8
  });

  orb.radius = Math.max(orb.minRadius, orb.radius * 0.82);
  mouse.draggingOrb = false;
}

function updatePlayer(dt) {
  player.vy += world.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 20, world.width - 20);

  player.onGround = false;
  if (player.y + player.h > world.groundY) {
    player.y = world.groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  const pRect = { x: player.x - player.w / 2, y: player.y, w: player.w, h: player.h };
  for (const s of state.structures) {
    if (rectsOverlap(pRect, s)) {
      const fromTop = pRect.y + pRect.h - player.vy * dt <= s.y + 10;
      if (fromTop) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else {
        if (player.vx > 0) player.x = s.x - player.w / 2;
        if (player.vx < 0) player.x = s.x + s.w + player.w / 2;
      }
    }
  }

  // Collect hearts for health regen.
  state.hearts = state.hearts.filter(h => {
    if (dist(player.x, player.y + 30, h.x, h.y) < 34) {
      player.health = Math.min(player.maxHealth, player.health + 28);
      state.particles.push({ type: 'heal', x: h.x, y: h.y, vx: 0, vy: -40, life: 0.7 });
      return false;
    }
    return true;
  });

  player.regenTimer += dt;
  if (player.regenTimer > 1.8) {
    player.regenTimer = 0;
    player.health = Math.min(player.maxHealth, player.health + 0.7);
  }
}

function updateEnemies(dt) {
  state.nextSpawnIn -= dt;
  if (!state.betweenWaves && state.nextSpawnIn <= 0 && state.enemiesToSpawn > 0) {
    state.enemiesToSpawn--;
    spawnEnemy();
    state.nextSpawnIn = rand(1.0, 2.2);
  }

  if (state.wave % state.bossLevel === 0 && state.enemiesToSpawn === 0 && !state.enemies.some(e => e.behavior === 'bossDragon')) {
    spawnDragonBoss();
  }

  for (const e of state.enemies) {
    if (e.frozen > 0) { e.frozen -= dt; continue; }

    if (e.behavior === 'patrol') {
      e.vx += e.patrolDir * e.speed * 0.6 * dt;
      if (Math.abs(e.vx) > e.speed) e.vx = e.speed * Math.sign(e.vx);
      if (Math.random() < 0.005) e.patrolDir *= -1;
    } else if (e.behavior === 'jumper') {
      const dir = Math.sign(player.x - e.x) || 1;
      e.vx += dir * e.speed * dt * 0.8;
      e.jumpCd -= dt;
      if (e.jumpCd <= 0 && e.y + e.h / 2 >= world.groundY - 2) {
        e.vy = -rand(420, 560);
        e.jumpCd = rand(1.2, 2.4);
      }
    } else if (e.behavior === 'evasive') {
      const away = Math.sign(e.x - orb.x) || 1;
      const toward = Math.sign(player.x - e.x) || 1;
      e.vx += (Math.random() < 0.45 ? away : toward) * e.speed * dt * 0.9;
    } else if (e.behavior === 'bossDragon') {
      e.x += e.vx * dt;
      if (e.x < player.x + 400 || e.x > player.x + 1200) e.vx *= -1;
      e.y = 220 + Math.sin(state.time * 1.2) * 45;
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = 1.2;
        state.enemyProjectiles.push({ x: e.x - 100, y: e.y + 20, vx: -280, vy: rand(-30, 30), r: 11, life: 6, fire: true });
      }
      continue;
    }

    e.vy += world.gravity * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= 0.95;

    if (e.y + e.h / 2 > world.groundY) { e.y = world.groundY - e.h / 2; e.vy = 0; }

    // Simple obstacle avoidance so AI doesn't run into boxes forever.
    for (const s of state.structures) {
      const eb = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
      if (rectsOverlap(eb, s)) {
        if (e.x < s.x + s.w / 2) e.x = s.x - e.w / 2 - 1;
        else e.x = s.x + s.w + e.w / 2 + 1;
        e.vx *= -0.3;
        if (Math.random() < 0.5 && e.vy === 0) e.vy = -430;
      }
    }

    if (dist(player.x, player.y, e.x, e.y) < 45) {
      player.health -= 12 * dt;
    }
  }

  // Projectile updates.
  state.projectiles.forEach(p => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += world.gravity * 0.2 * dt;

    for (const e of state.enemies) {
      if (e.behavior === 'bossDragon') {
        for (const wp of e.weakpoints) {
          if (wp.hp > 0 && dist(p.x, p.y, e.x + wp.xOff, e.y + wp.yOff) < p.r + wp.r) {
            wp.hp -= p.ice ? 24 : 15;
            e.health -= p.ice ? 13 : 9;
            p.life = -1;
          }
        }
      }
      if (p.life > 0 && dist(p.x, p.y, e.x, e.y) < p.r + Math.max(e.w, e.h) * 0.35) {
        const dmg = p.isShard ? 28 : p.ice ? 15 : 11;
        e.health -= dmg;
        if (p.ice) e.frozen = Math.max(e.frozen, player.upgrades.freezeDuration);
        e.vx += Math.sign(p.vx) * 220;
        p.life = -1;
      }
    }

    // Structures block or redirect water attacks.
    for (const s of state.structures) {
      if (p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h) {
        p.vx *= -0.5;
        p.vy *= -0.5;
        p.life -= 0.6;
      }
    }
  });
  state.projectiles = state.projectiles.filter(p => p.life > 0);

  state.enemyProjectiles.forEach(p => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (dist(p.x, p.y, player.x, player.y + 20) < p.r + 24) {
      player.health -= 14;
      p.dead = true;
    }
  });
  state.enemyProjectiles = state.enemyProjectiles.filter(p => p.life > 0 && !p.dead);

  const before = state.enemies.length;
  state.enemies = state.enemies.filter(e => e.health > 0);
  const defeated = before - state.enemies.length;
  if (defeated > 0) {
    state.score += defeated * 35;
    if (Math.random() < 0.45) state.hearts.push(spawnPickup('heart'));
  }

  if (!state.betweenWaves && !state.gameOver && state.enemiesToSpawn <= 0 && state.enemies.length === 0) {
    state.wave++;
    doLevelUpMenu();
  }
}

function updateParticles(dt) {
  state.particles.forEach(p => {
    p.life -= dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
    p.vy = (p.vy || 0) + 240 * dt;
    if (p.type === 'wave') p.r += 240 * dt;
  });
  state.particles = state.particles.filter(p => p.life > 0);
}

function drawPlayer() {
  const walk = Math.sin(state.time * 10 + player.x * 0.02) * 6;
  const x = player.x - world.cameraX;

  ctx.fillStyle = '#2b87e6';
  ctx.fillRect(x - 12, player.y + 20, 24, 34); // torso
  ctx.fillRect(x - 16 + walk * 0.2, player.y + 52, 10, 26); // leg
  ctx.fillRect(x + 6 - walk * 0.2, player.y + 52, 10, 26); // leg
  ctx.fillRect(x - 22, player.y + 24, 10, 9); // arm
  ctx.fillRect(x + 12, player.y + 24, 10, 9); // arm
  ctx.beginPath(); ctx.arc(x, player.y + 12, 11, 0, Math.PI * 2); ctx.fill();

  // Tiny kick/punch indicator.
  if (player.meleeCd > 0.18) {
    ctx.fillStyle = '#9dd9ff';
    ctx.fillRect(x + player.facing * 20, player.y + 28, 16 * player.facing, 5);
  }
}

function drawEnemy(e) {
  const x = e.x - world.cameraX;
  if (e.behavior === 'bossDragon') {
    ctx.fillStyle = '#b63d2a';
    ctx.fillRect(x - e.w / 2, e.y - e.h / 2, e.w, e.h);
    ctx.fillStyle = '#d8603f';
    ctx.fillRect(x - e.w / 2 - 40, e.y - 20, 40, 16);
    e.weakpoints.forEach(wp => {
      if (wp.hp <= 0) return;
      ctx.fillStyle = '#ffef9e';
      ctx.beginPath(); ctx.arc(x + wp.xOff, e.y + wp.yOff, wp.r, 0, Math.PI * 2); ctx.fill();
    });
    return;
  }

  const frozenTint = e.frozen > 0 ? '#9de4ff' : '#e34848';
  ctx.fillStyle = frozenTint;
  ctx.fillRect(x - e.w / 2, e.y - e.h / 2, e.w, e.h);
  ctx.fillRect(x - e.w / 2 - 6, e.y - e.h / 2 + 10, 6, 9);
  ctx.fillRect(x + e.w / 2, e.y - e.h / 2 + 10, 6, 9);
}

function drawOrb() {
  const x = orb.x - world.cameraX;
  const pulse = Math.sin(state.time * 7) * 2;
  ctx.beginPath();
  ctx.fillStyle = orb.iceMode ? 'rgba(170,235,255,0.9)' : 'rgba(64,187,255,0.88)';
  ctx.arc(x, orb.y, orb.radius + pulse * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cff5ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw a watery tether to player.
  ctx.beginPath();
  ctx.moveTo(player.x - world.cameraX + player.facing * 10, player.y + 36);
  ctx.quadraticCurveTo((x + player.x - world.cameraX) / 2, (orb.y + player.y) / 2 - 20, x, orb.y);
  ctx.strokeStyle = 'rgba(124,220,255,0.55)';
  ctx.stroke();
}

function drawWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  world.cameraX = clamp(player.x - canvas.width * 0.35, 0, world.width - canvas.width);

  // Ground
  ctx.fillStyle = '#49708f';
  ctx.fillRect(0, world.groundY, canvas.width, canvas.height - world.groundY);

  // Structures
  state.structures.forEach(s => {
    const x = s.x - world.cameraX;
    ctx.fillStyle = s.type === 'arch' ? '#746f82' : '#6f5e50';
    ctx.fillRect(x, s.y, s.w, s.h);
    if (s.type === 'arch') {
      ctx.clearRect(x + s.w * 0.33, s.y + s.h * 0.28, s.w * 0.34, s.h * 0.72);
    }
  });

  // Pickups.
  state.waterSources.forEach(s => {
    const x = s.x - world.cameraX;
    ctx.fillStyle = 'rgba(80,196,255,0.75)';
    ctx.beginPath(); ctx.arc(x, s.y, s.r + Math.sin(state.time * 4) * 2, 0, Math.PI * 2); ctx.fill();
  });
  state.hearts.forEach(h => {
    const x = h.x - world.cameraX;
    ctx.fillStyle = '#ff7da4';
    ctx.beginPath(); ctx.arc(x - 5, h.y - 2, 6, 0, Math.PI * 2); ctx.arc(x + 5, h.y - 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 11, h.y); ctx.lineTo(x + 11, h.y); ctx.lineTo(x, h.y + 15); ctx.fill();
  });

  drawPlayer();
  state.enemies.forEach(drawEnemy);

  // Projectiles.
  state.projectiles.forEach(p => {
    const x = p.x - world.cameraX;
    ctx.fillStyle = p.ice ? '#c3f5ff' : '#65c8ff';
    if (p.isShard) {
      // triangular ice shard
      ctx.beginPath();
      ctx.moveTo(x + p.r, p.y);
      ctx.lineTo(x - p.r * 0.6, p.y - p.r * 0.7);
      ctx.lineTo(x - p.r * 0.6, p.y + p.r * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  state.enemyProjectiles.forEach(p => {
    const x = p.x - world.cameraX;
    ctx.fillStyle = '#ff7a2a';
    ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  });

  drawOrb();

  // Particles.
  state.particles.forEach(p => {
    const x = p.x - world.cameraX;
    if (p.type === 'wave') {
      ctx.strokeStyle = `rgba(110, 206, 255, ${p.life * 2})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, p.y, p.r, Math.PI * (0.4 - 0.2 * p.facing), Math.PI * (1.6 - 0.2 * p.facing));
      ctx.stroke();
      return;
    }
    const colors = { water: '#72ceff', ice: '#dcf7ff', heal: '#9effba' };
    ctx.fillStyle = colors[p.type] || '#fff';
    ctx.fillRect(x, p.y, 3, 3);
  });
}

function updateUI() {
  ui.healthText.textContent = Math.round(player.health);
  ui.healthBar.style.width = `${clamp((player.health / player.maxHealth) * 100, 0, 100)}%`;
  ui.waveText.textContent = state.wave;
  ui.levelText.textContent = state.level;
  ui.scoreText.textContent = Math.floor(state.score);
}

let lastTs = performance.now();
function loop(ts) {
  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;
  state.time += dt;

  if (!state.gameOver && !state.betweenWaves) {
    handleInput(dt);
    updatePlayer(dt);
    updateOrb(dt);
    updateEnemies(dt);
    updateParticles(dt);
    if (player.health <= 0) gameOverMenu();
  }

  drawWorld();
  updateUI();
  requestAnimationFrame(loop);
}

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.lastX = mouse.x;
  mouse.lastY = mouse.y;
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', () => {
  mouse.down = true;
  const ox = orb.x - world.cameraX;
  if (dist(mouse.x, mouse.y, ox, orb.y) < orb.radius + 20) mouse.draggingOrb = true;
});
window.addEventListener('mouseup', () => {
  if (mouse.draggingOrb) launchFromOrb();
  mouse.down = false;
});
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup', e => keys.delete(e.code));

setupWave(1);
requestAnimationFrame(loop);
