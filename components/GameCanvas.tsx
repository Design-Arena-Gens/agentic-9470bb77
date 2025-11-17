"use client";

import React, { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };

type Enemy = {
  id: number;
  pos: Vec;
  vel: Vec;
  hp: number;
  speed: number;
};

type Bullet = {
  id: number;
  pos: Vec;
  vel: Vec;
  ttl: number;
};

type Wall = {
  id: number;
  pos: Vec;
  radius: number;
  hp: number;
  maxHp: number;
};

const WIDTH = 900;
const HEIGHT = 600;
const CORE_POS = { x: WIDTH / 2, y: HEIGHT / 2 };
const CORE_RADIUS = 26;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function length(v: Vec) { return Math.hypot(v.x, v.y); }
function normalize(v: Vec): Vec {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len };
}
function add(a: Vec, b: Vec): Vec { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a: Vec, b: Vec): Vec { return { x: a.x - b.x, y: a.y - b.y }; }
function mul(v: Vec, s: number): Vec { return { x: v.x * s, y: v.y * s }; }

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isBuilding, setIsBuilding] = useState(true);
  const [gold, setGold] = useState(120);
  const [wave, setWave] = useState(0);
  const [score, setScore] = useState(0);
  const [coreHp, setCoreHp] = useState(100);
  const [running, setRunning] = useState(false);

  const wallsRef = useRef<Wall[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const nextIdRef = useRef(1);
  const lastSpawnRef = useRef(0);

  // Build config
  const WALL_COST = 15;
  const WALL_RADIUS = 24;

  // Tower config
  const fireCooldownRef = useRef(0);
  const FIRE_COOLDOWN = 0.25; // seconds
  const BULLET_SPEED = 500;

  // Timing
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const step = (t: number) => {
      if (lastTimeRef.current == null) lastTimeRef.current = t;
      const dt = Math.min(0.05, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;

      update(dt);
      draw(ctx);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startAttack() {
    if (running) return;
    setWave((w) => w + 1);
    setIsBuilding(false);
    setRunning(true);
    lastSpawnRef.current = 0;
  }

  function resetGame() {
    setIsBuilding(true);
    setGold(120);
    setWave(0);
    setScore(0);
    setCoreHp(100);
    setRunning(false);
    wallsRef.current = [];
    enemiesRef.current = [];
    bulletsRef.current = [];
    nextIdRef.current = 1;
  }

  function placeWall(x: number, y: number) {
    if (!isBuilding) return;
    if (gold < WALL_COST) return;
    const pos = { x, y };
    // Prevent placing too close to core
    if (Math.hypot(pos.x - CORE_POS.x, pos.y - CORE_POS.y) < CORE_RADIUS + 40) {
      return;
    }
    // Prevent overlap with other walls
    for (const w of wallsRef.current) {
      if (Math.hypot(pos.x - w.pos.x, pos.y - w.pos.y) < w.radius + WALL_RADIUS + 6) return;
    }
    const id = nextIdRef.current++;
    const wall: Wall = { id, pos, radius: WALL_RADIUS, hp: 60, maxHp: 60 };
    wallsRef.current = [...wallsRef.current, wall];
    setGold((g) => g - WALL_COST);
  }

  function spawnEnemy(dt: number) {
    lastSpawnRef.current += dt;
    const targetCount = Math.min(18, 6 + wave * 4);
    const spawnEvery = Math.max(0.35, 1.2 - wave * 0.08);
    const alive = enemiesRef.current.length;
    if (!running) return;
    if (alive >= targetCount) return;
    if (lastSpawnRef.current < spawnEvery) return;

    lastSpawnRef.current = 0;
    const side = Math.floor(rand(0, 4));
    const margin = 40;
    let x = 0, y = 0;
    if (side === 0) { x = rand(-margin, WIDTH + margin); y = -margin; }
    else if (side === 1) { x = WIDTH + margin; y = rand(-margin, HEIGHT + margin); }
    else if (side === 2) { x = rand(-margin, WIDTH + margin); y = HEIGHT + margin; }
    else { x = -margin; y = rand(-margin, HEIGHT + margin); }

    const id = nextIdRef.current++;
    const speed = rand(30, 50) + wave * 4;
    const hp = 20 + wave * 6;
    enemiesRef.current = [...enemiesRef.current, { id, pos: { x, y }, vel: { x: 0, y: 0 }, hp, speed }];
  }

  function update(dt: number) {
    // Spawning
    spawnEnemy(dt);

    // Enemies: seek core, collide with walls, damage
    const newEnemies: Enemy[] = [];
    for (const e of enemiesRef.current) {
      const toCore = sub(CORE_POS, e.pos);
      const dir = normalize(toCore);
      e.vel = mul(dir, e.speed);
      // Apply wall pushback and damage
      for (const w of wallsRef.current) {
        const d = sub(e.pos, w.pos);
        const dist = length(d);
        const overlap = w.radius + 8 - dist;
        if (overlap > 0) {
          // Push enemy outward
          const pushDir = normalize(d);
          e.pos = add(e.pos, mul(pushDir, overlap * 0.6));
          // Damage wall slowly
          w.hp -= 10 * dt;
        }
      }
      // Move
      e.pos = add(e.pos, mul(e.vel, dt));

      // Core damage
      const toCoreNew = sub(CORE_POS, e.pos);
      if (length(toCoreNew) < CORE_RADIUS + 8) {
        setCoreHp((hp) => Math.max(0, hp - 12 * dt));
        // keep enemy circling core slightly
        const tangent: Vec = { x: -toCoreNew.y, y: toCoreNew.x };
        e.pos = add(e.pos, mul(normalize(tangent), 30 * dt));
      }

      if (e.hp > 0) newEnemies.push(e);
      else setScore((s) => s + 10);
    }
    enemiesRef.current = newEnemies;

    // Remove destroyed walls, award tiny gold
    const keptWalls: Wall[] = [];
    for (const w of wallsRef.current) {
      if (w.hp > 0) keptWalls.push(w);
      else setGold((g) => g + 2);
    }
    wallsRef.current = keptWalls;

    // Tower fires at nearest enemy
    fireCooldownRef.current -= dt;
    if (running && fireCooldownRef.current <= 0 && enemiesRef.current.length > 0) {
      fireCooldownRef.current = FIRE_COOLDOWN;
      let nearest: Enemy | null = null;
      let best = Infinity;
      for (const e of enemiesRef.current) {
        const d = length(sub(e.pos, CORE_POS));
        if (d < best) { best = d; nearest = e; }
      }
      if (nearest) {
        const dir = normalize(sub(nearest.pos, CORE_POS));
        const vel = mul(dir, BULLET_SPEED);
        const id = nextIdRef.current++;
        bulletsRef.current = [
          ...bulletsRef.current,
          { id, pos: { ...CORE_POS }, vel, ttl: 1.6 },
        ];
      }
    }

    // Update bullets
    const newBullets: Bullet[] = [];
    for (const b of bulletsRef.current) {
      b.ttl -= dt;
      b.pos = add(b.pos, mul(b.vel, dt));
      // Collide with enemies
      for (const e of enemiesRef.current) {
        if (length(sub(e.pos, b.pos)) < 10) {
          e.hp -= 18;
          b.ttl = 0;
          setScore((s) => s + 2);
          break;
        }
      }
      if (b.ttl > 0) newBullets.push(b);
    }
    bulletsRef.current = newBullets;

    // Check end of wave
    if (running && enemiesRef.current.length === 0 && lastSpawnRef.current > 1.2) {
      // Wave cleared
      setRunning(false);
      setIsBuilding(true);
      setGold((g) => g + 30 + wave * 10);
      setScore((s) => s + 50);
    }
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, "#0e1329");
    grad.addColorStop(1, "#0b1022");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Stars/grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
    }

    // Core
    ctx.save();
    ctx.beginPath();
    ctx.arc(CORE_POS.x, CORE_POS.y, CORE_RADIUS, 0, Math.PI * 2);
    const coreGrad = ctx.createRadialGradient(CORE_POS.x, CORE_POS.y, 8, CORE_POS.x, CORE_POS.y, CORE_RADIUS);
    coreGrad.addColorStop(0, "#6ee7ff");
    coreGrad.addColorStop(1, "#2b3a7a");
    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(174, 203, 250, 0.9)";
    ctx.stroke();
    ctx.restore();

    // Core HP bar
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(CORE_POS.x - 52, CORE_POS.y - CORE_RADIUS - 18, 104, 8);
    ctx.fillStyle = coreHp > 40 ? "#4ade80" : coreHp > 20 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(CORE_POS.x - 52, CORE_POS.y - CORE_RADIUS - 18, 104 * (coreHp / 100), 8);

    // Walls
    for (const w of wallsRef.current) {
      const pct = Math.max(0, w.hp / w.maxHp);
      ctx.beginPath();
      ctx.arc(w.pos.x, w.pos.y, w.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167, 139, 250, ${0.25 + 0.4 * pct})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(110, 231, 255, ${0.7})`;
      ctx.stroke();
      // hp ring
      ctx.beginPath();
      ctx.arc(w.pos.x, w.pos.y, w.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.strokeStyle = pct > 0.5 ? "#6ee7ff" : pct > 0.25 ? "#f59e0b" : "#ef4444";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Enemies
    for (const e of enemiesRef.current) {
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }

    // Bullets
    for (const b of bulletsRef.current) {
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#6ee7ff";
      ctx.fill();
    }

    // Overlay text
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "14px ui-sans-serif, system-ui";
    ctx.fillText(`Wave ${wave}  |  Gold ${gold}  |  Score ${score}`, 16, 24);
    if (isBuilding) {
      ctx.fillStyle = "rgba(174, 203, 250, 0.9)";
      ctx.fillText("Build mode: click to place walls", 16, 44);
    }

    if (coreHp <= 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 36px ui-sans-serif, system-ui";
      ctx.fillText("Castle Fallen", WIDTH / 2 - 120, HEIGHT / 2 - 12);
      ctx.fillStyle = "#a9afc7";
      ctx.font = "16px ui-sans-serif, system-ui";
      ctx.fillText("Press Reset to try again", WIDTH / 2 - 112, HEIGHT / 2 + 16);
    }
  }

  function handlePointer(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    let clientX = 0, clientY = 0;
    // @ts-ignore touch support
    const touch = e.touches && e.touches[0];
    if (touch) { clientX = touch.clientX; clientY = touch.clientY; }
    else {
      const me = e as React.MouseEvent<HTMLCanvasElement>;
      clientX = me.clientX; clientY = me.clientY;
    }
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    const y = ((clientY - rect.top) / rect.height) * HEIGHT;
    placeWall(x, y);
  }

  useEffect(() => {
    if (coreHp <= 0) setRunning(false);
  }, [coreHp]);

  return (
    <div>
      <div className="controls">
        <button className="button" onClick={() => setIsBuilding(true)} disabled={isBuilding || coreHp <= 0}>Build Mode</button>
        <button className="button primary" onClick={startAttack} disabled={!isBuilding || coreHp <= 0}>Start Attack</button>
        <button className="button danger" onClick={resetGame}>Reset</button>
        <span className="stat">Gold: {gold}</span>
        <span className="stat">Wave: {wave}</span>
        <span className="stat">Core HP: {Math.round(coreHp)}</span>
        <span className="stat">Score: {score}</span>
      </div>
      <div className="canvas-shell">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{ width: "100%", height: "auto", display: "block" }}
          onClick={handlePointer}
          onTouchStart={handlePointer}
        />
      </div>
      <div className="info">
        <div>
          - Build walls for {WALL_COST} gold each by clicking the battlefield.
        </div>
        <div>
          - Start the attack to spawn enemies. The core turret auto-fires.
        </div>
        <div>
          - Enemies damage walls when colliding; defend the glowing core.
        </div>
      </div>
    </div>
  );
}
