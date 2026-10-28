import './style.css';
import { type Difficulty, type GameMode } from './game/data';
import { GameSession } from './game/logic';

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('アプリのマウント先が見つかりません');
const app: HTMLDivElement = appElement;

type Point = { x: number; y: number };
type Projectile = { progress: number; wobble: number; hue: number; target: Point };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number };
type Slash = { life: number; maxLife: number; angle: number; size: number; hue: number; x: number; y: number };

const enemySprites = {
  beast: new Image(),
  boss: new Image(),
};
enemySprites.beast.src = new URL('enemies/abyss-beast.png', document.baseURI).toString();
enemySprites.boss.src = new URL('enemies/obsidian-warlord.png', document.baseURI).toString();

class SoundBox {
  private context?: AudioContext;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  blip(kind: 'hit' | 'miss' | 'finish' | 'damage' | 'clear'): void {
    if (this.muted) return;
    this.context ??= new AudioContext();
    const profiles: Record<typeof kind, Array<[number, number, OscillatorType, number, number]>> = {
      hit: [[520, 1040, 'triangle', 0.045, 0.085], [170, 95, 'sine', 0.025, 0.07]],
      miss: [[130, 72, 'sawtooth', 0.05, 0.16]],
      finish: [[190, 48, 'sawtooth', 0.075, 0.34], [460, 920, 'triangle', 0.055, 0.24], [92, 42, 'sine', 0.06, 0.3]],
      damage: [[90, 38, 'sawtooth', 0.065, 0.28]],
      clear: [[440, 880, 'triangle', 0.06, 0.48], [660, 1320, 'sine', 0.035, 0.52]],
    };
    for (const [startHz, endHz, wave, volume, duration] of profiles[kind]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(startHz, this.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(endHz, this.context.currentTime + duration);
      gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, this.context.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration + 0.01);
    }
  }
}

const storedMuted = localStorage.getItem('type-breakers-muted') === 'true';
const sound = new SoundBox(storedMuted);

function titleScreen(): void {
  app.innerHTML = `
    <main class="title-screen">
      <div class="title-stars" aria-hidden="true"></div>
      <svg class="title-castle" viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="title-ember-moon">
            <stop offset="0" stop-color="#d85c43" stop-opacity=".62" />
            <stop offset=".42" stop-color="#8e2934" stop-opacity=".26" />
            <stop offset="1" stop-color="#53172a" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="title-castle-stone" x1="0" x2="1" y1="0" y2="0">
            <stop stop-color="#0b080e" />
            <stop offset=".5" stop-color="#21131b" />
            <stop offset="1" stop-color="#0a070d" />
          </linearGradient>
        </defs>
        <circle cx="720" cy="335" r="310" fill="url(#title-ember-moon)" />
        <path d="M0 820V468h66V355h35v-62l49 55 48-55v64h38v126h82v-54h46v54h26v-91h55v91h550v-91h55v91h26v-54h46v54h82V357h38v-64h35v62l49-55 48 55v113h66v352Z" fill="#0b080e" />
        <path d="M437 820V476c0-130 126-232 283-232s283 102 283 232v344" fill="#0a070d" stroke="#60313a" stroke-width="5" />
        <path d="M477 820V485c0-109 108-196 243-196s243 87 243 196v335" fill="none" stroke="#341a25" stroke-width="3" />
        <path d="M405 820V474c0-145 140-258 315-258s315 113 315 258v346" fill="none" stroke="#351b25" stroke-width="2" />
        <g fill="#d85b3a" opacity=".55">
          <path d="M159 403h13v66h-13zM213 403h13v66h-13zM1214 403h13v66h-13zM1268 403h13v66h-13z" />
          <path d="M338 538l17-31 17 31-17 20zM1068 538l17-31 17 31-17 20z" />
        </g>
        <path d="M0 716h1440v104H0z" fill="url(#title-castle-stone)" opacity=".64" />
      </svg>
      <section class="title-copy">
        <p class="eyebrow">KEYBOARD ACTION / 01</p>
        <h1>TYPE<span>BREAKERS</span></h1>
        <p class="title-lead">言葉を、弾丸に。</p>
        <p class="title-description">迫り来るモンスターの名前を、ローマ字で撃ち抜け。</p>
      </section>
      <section class="launch-panel" aria-label="ゲーム設定">
        <div class="launch-row">
          <label>モード <select id="mode-select"><option value="story">ストーリーモード</option><option value="endless">エンドレスモード</option></select></label>
          <label>難易度 <select id="difficulty-select"><option value="easy">初級</option><option value="normal" selected>中級</option><option value="hard">上級</option></select></label>
        </div>
        <button class="primary-button" id="start-button">戦闘開始 <span>ENTER</span></button>
        <div class="launch-footnote"><span>操作</span> 英字キーで入力　/　Escで一時停止</div>
      </section>
      <section class="title-notes">
        <div><strong>正しい一打</strong><span>敵へ攻撃を発射</span></div>
        <div><strong>全文入力</strong><span>フィニッシュブロー</span></div>
        <div><strong>敵の接近</strong><span>HPを1失う</span></div>
      </section>
      <button class="sound-button title-sound" id="title-sound" aria-label="サウンド設定">${sound.isMuted ? '音声OFF' : '音声ON'}</button>
    </main>
  `;
  const start = (): void => {
    window.onkeydown = null;
    const mode = (document.querySelector<HTMLSelectElement>('#mode-select')?.value ?? 'story') as GameMode;
    const difficulty = (document.querySelector<HTMLSelectElement>('#difficulty-select')?.value ?? 'normal') as Difficulty;
    new GameView(mode, difficulty).mount();
  };
  document.querySelector<HTMLButtonElement>('#start-button')?.addEventListener('click', start);
  document.querySelector<HTMLButtonElement>('#title-sound')?.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted);
    localStorage.setItem('type-breakers-muted', String(sound.isMuted));
    titleScreen();
  });
  window.onkeydown = (event) => {
    if (event.key === 'Enter') start();
  };
}

class GameView {
  private readonly session: GameSession;
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private lastTime = performance.now();
  private animation = 0;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private slashes: Slash[] = [];
  private shake = 0;
  private impactFlash = 0;
  private feedback = '';
  private feedbackTimer = 0;
  private previousStage = 1;
  private previousEnemyKey = '';
  private onKeyDown = (event: KeyboardEvent): void => this.handleKey(event);
  private onResize = (): void => this.resizeCanvas();

  constructor(mode: GameMode, difficulty: Difficulty) {
    this.session = new GameSession({ mode, difficulty, muted: sound.isMuted });
  }

  mount(): void {
    app.innerHTML = `
      <main class="game-shell">
        <header class="hud">
          <div class="hud-brand"><span class="hud-mark"></span><span>TYPE BREAKERS</span></div>
          <div class="hud-stage"><small>STAGE ${this.session.stage}</small><strong id="stage-name">${this.session.stageInfo.name}</strong></div>
          <div class="hud-stat"><small>スコア</small><strong id="score">0</strong></div>
          <div class="hud-stat"><small>コンボ</small><strong id="combo">0</strong></div>
          <div class="hud-health"><small>耐久</small><div id="health" class="health-pips"></div></div>
          <button class="hud-button" id="pause-button">一時停止</button>
        </header>
        <div class="stage-track"><span id="stage-track-fill"></span></div>
        <section class="arena-frame">
          <canvas id="arena" aria-label="モンスターとの戦闘画面"></canvas>
          <div class="arena-corner top-left">${this.session.options.mode === 'story' ? 'STORY RUN' : 'ENDLESS RUN'}</div>
          <div class="arena-corner top-right" id="wave-label">WAVE 01 / 09</div>
          <div class="arena-message" id="arena-message"></div>
          <div class="pause-overlay hidden" id="pause-overlay">
            <span>PAUSED</span>
            <small>Escで再開</small>
            <button class="pause-home-button" id="pause-home-button">タイトルへ戻る</button>
          </div>
        </section>
        <section class="typing-console">
          <div class="target-meta"><span id="enemy-caption">接近中の敵</span><span id="distance-label">距離 100%</span></div>
          <div class="target-text" id="target-text"></div>
          <div class="roman-line"><span class="roman-prefix" id="roman-prefix"></span><span class="roman-next" id="roman-next"></span></div>
          <div class="typing-footer"><span id="typing-status">入力を開始してください</span><span id="miss-counter">ミス 0</span></div>
        </section>
      </main>
    `;
    this.canvas = document.querySelector<HTMLCanvasElement>('#arena') as HTMLCanvasElement;
    this.context = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    document.querySelector<HTMLButtonElement>('#pause-button')?.addEventListener('click', () => this.togglePause());
    document.querySelector<HTMLButtonElement>('#pause-home-button')?.addEventListener('click', () => this.returnToTitle());
    this.resizeCanvas();
    this.updateHud();
    this.animation = requestAnimationFrame((time) => this.loop(time));
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private loop(time: number): void {
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!this.session.ended) this.session.tick(delta);
    this.updateEffects(delta);
    this.draw(time / 1000);
    this.updateHud();
    if (this.session.ended) {
      this.showResult();
      return;
    }
    this.animation = requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.togglePause();
      return;
    }
    if (this.session.paused || this.session.ended || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
    event.preventDefault();
    const impactPoint = this.enemyEffectPoint();
    const impactSize = this.enemyEffectSize();
    const wasBoss = this.session.enemy.isBoss;
    const result = this.session.input(event.key);
    if (result === 'miss') {
      this.feedback = 'MISS';
      this.feedbackTimer = 0.35;
      this.shake = 0.12;
      sound.blip('miss');
    } else if (result === 'progress') {
      this.projectiles.push({ progress: 0, wobble: Math.random() * Math.PI, hue: 172 + Math.random() * 50, target: impactPoint });
      this.burstAtEnemy(7, 176 + Math.random() * 38, impactPoint, impactSize);
      this.slashes.push({ life: 0.18, maxLife: 0.18, angle: Math.random() * Math.PI, size: impactSize * 0.9, hue: 178 + Math.random() * 45, ...impactPoint });
      this.feedback = 'HIT';
      this.feedbackTimer = 0.18;
      this.shake = Math.max(this.shake, this.session.stats.combo % 10 === 0 ? 0.11 : 0.065);
      sound.blip('hit');
    } else if (result === 'complete') {
      this.projectiles.push({ progress: 0, wobble: 0, hue: 44, target: impactPoint });
      this.burstAtEnemy(wasBoss ? 110 : 68, 42, impactPoint, impactSize);
      for (let index = 0; index < 3; index += 1) {
        this.slashes.push({ life: 0.42 + index * 0.06, maxLife: 0.42 + index * 0.06, angle: Math.PI * index / 3 + Math.random() * 0.3, size: impactSize * (1.2 + index * 0.18), hue: index === 0 ? 45 : 180, ...impactPoint });
      }
      this.feedback = wasBoss ? 'OVERBREAK' : 'BREAK';
      this.feedbackTimer = wasBoss ? 1.05 : 0.72;
      this.shake = wasBoss ? 0.42 : 0.27;
      this.impactFlash = wasBoss ? 0.36 : 0.2;
      sound.blip('finish');
    }
  }

  private togglePause(): void {
    if (this.session.ended) return;
    this.session.togglePause();
    document.querySelector('#pause-overlay')?.classList.toggle('hidden', !this.session.paused);
    const button = document.querySelector<HTMLButtonElement>('#pause-button');
    if (button) button.textContent = this.session.paused ? '再開' : '一時停止';
  }

  private returnToTitle(): void {
    cancelAnimationFrame(this.animation);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    titleScreen();
  }

  private updateEffects(delta: number): void {
    this.feedbackTimer = Math.max(0, this.feedbackTimer - delta);
    this.shake = Math.max(0, this.shake - delta * 0.9);
    this.impactFlash = Math.max(0, this.impactFlash - delta * 1.7);
    this.projectiles = this.projectiles.map((projectile) => ({ ...projectile, progress: projectile.progress + delta * 2.8 })).filter((projectile) => projectile.progress < 1);
    this.particles = this.particles.map((particle) => ({
      ...particle,
      x: particle.x + particle.vx * delta,
      y: particle.y + particle.vy * delta,
      vy: particle.vy + 20 * delta,
      life: particle.life - delta,
    })).filter((particle) => particle.life > 0);
    this.slashes = this.slashes.map((slash) => ({ ...slash, life: slash.life - delta })).filter((slash) => slash.life > 0);
  }

  private draw(seconds: number): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.context;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 26, (Math.random() - 0.5) * this.shake * 18);
    this.drawBackground(ctx, width, height, seconds);
    this.drawProjectiles(ctx, width, height);
    this.drawEnemy(ctx, width, height, seconds);
    this.drawSlashes(ctx);
    this.drawParticles(ctx);
    if (this.impactFlash > 0) {
      ctx.fillStyle = `rgba(220, 255, 248, ${this.impactFlash * 0.28})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number): void {
    const stage = this.session.stageInfo;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#08060c');
    gradient.addColorStop(0.48, '#1a0d14');
    gradient.addColorStop(1, '#0b080d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const moon = ctx.createRadialGradient(width / 2, height * 0.3, height * 0.015, width / 2, height * 0.3, height * 0.5);
    moon.addColorStop(0, `${stage.tint}44`);
    moon.addColorStop(0.28, '#8d293522');
    moon.addColorStop(1, '#09060c00');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, width, height * 0.72);

    this.drawCastleWalls(ctx, width, height);
    this.drawCastleFloor(ctx, width, height, stage.tint, seconds);
    this.drawEmbers(ctx, width, height, stage.tint, seconds);

    const vignette = ctx.createRadialGradient(width / 2, height * 0.48, height * 0.16, width / 2, height * 0.48, width * 0.74);
    vignette.addColorStop(0, '#05040a00');
    vignette.addColorStop(1, '#050308cc');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  private drawCastleWalls(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const edge = '#59303a';
    ctx.save();

    // Distant battlements and towers establish a single castle silhouette behind every stage.
    ctx.fillStyle = '#0b080e';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.59);
    ctx.lineTo(0, height * 0.44);
    ctx.lineTo(width * 0.07, height * 0.44);
    ctx.lineTo(width * 0.07, height * 0.32);
    ctx.lineTo(width * 0.09, height * 0.32);
    ctx.lineTo(width * 0.09, height * 0.28);
    ctx.lineTo(width * 0.12, height * 0.32);
    ctx.lineTo(width * 0.15, height * 0.28);
    ctx.lineTo(width * 0.15, height * 0.32);
    ctx.lineTo(width * 0.17, height * 0.32);
    ctx.lineTo(width * 0.17, height * 0.47);
    ctx.lineTo(width * 0.29, height * 0.47);
    ctx.lineTo(width * 0.29, height * 0.42);
    ctx.lineTo(width * 0.33, height * 0.42);
    ctx.lineTo(width * 0.33, height * 0.47);
    ctx.lineTo(width * 0.67, height * 0.47);
    ctx.lineTo(width * 0.67, height * 0.42);
    ctx.lineTo(width * 0.71, height * 0.42);
    ctx.lineTo(width * 0.71, height * 0.47);
    ctx.lineTo(width * 0.83, height * 0.47);
    ctx.lineTo(width * 0.83, height * 0.32);
    ctx.lineTo(width * 0.85, height * 0.32);
    ctx.lineTo(width * 0.85, height * 0.28);
    ctx.lineTo(width * 0.88, height * 0.32);
    ctx.lineTo(width * 0.91, height * 0.28);
    ctx.lineTo(width * 0.91, height * 0.32);
    ctx.lineTo(width * 0.93, height * 0.32);
    ctx.lineTo(width * 0.93, height * 0.44);
    ctx.lineTo(width, height * 0.44);
    ctx.lineTo(width, height * 0.59);
    ctx.closePath();
    ctx.fill();

    // A tall pointed arch frames the enemy and gives the arena its demonic-castle focal point.
    ctx.fillStyle = '#0a070d';
    ctx.beginPath();
    ctx.moveTo(width * 0.31, height * 0.65);
    ctx.lineTo(width * 0.31, height * 0.37);
    ctx.quadraticCurveTo(width * 0.5, height * -0.03, width * 0.69, height * 0.37);
    ctx.lineTo(width * 0.69, height * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(2, width * 0.004);
    ctx.beginPath();
    ctx.moveTo(width * 0.285, height * 0.65);
    ctx.lineTo(width * 0.285, height * 0.36);
    ctx.quadraticCurveTo(width * 0.5, height * -0.13, width * 0.715, height * 0.36);
    ctx.lineTo(width * 0.715, height * 0.65);
    ctx.stroke();
    ctx.strokeStyle = '#311923';
    ctx.lineWidth = Math.max(1, width * 0.002);
    ctx.beginPath();
    ctx.moveTo(width * 0.33, height * 0.65);
    ctx.lineTo(width * 0.33, height * 0.38);
    ctx.quadraticCurveTo(width * 0.5, height * 0.03, width * 0.67, height * 0.38);
    ctx.lineTo(width * 0.67, height * 0.65);
    ctx.stroke();

    this.drawStonePillar(ctx, width * 0.12, height);
    this.drawStonePillar(ctx, width * 0.88, height);

    // Narrow windows and braziers punctuate the stonework with the same ember light as the enemies.
    ctx.fillStyle = '#d85b3a';
    ctx.globalAlpha = 0.45;
    for (const x of [0.105, 0.145, 0.855, 0.895]) {
      ctx.fillRect(width * x, height * 0.365, Math.max(2, width * 0.006), height * 0.052);
    }
    ctx.globalAlpha = 0.72;
    for (const x of [0.235, 0.765]) {
      const flicker = 0.85 + Math.sin(performance.now() / 145 + x * 20) * 0.15;
      ctx.beginPath();
      ctx.moveTo(width * x, height * 0.54);
      ctx.lineTo(width * x - width * 0.009 * flicker, height * 0.51);
      ctx.lineTo(width * x, height * 0.475);
      ctx.lineTo(width * x + width * 0.01 * flicker, height * 0.51);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawStonePillar(ctx: CanvasRenderingContext2D, centerX: number, height: number): void {
    const width = this.canvas.clientWidth;
    const half = width * 0.035;
    const top = height * 0.36;
    const bottom = height * 0.67;
    const gradient = ctx.createLinearGradient(centerX - half, 0, centerX + half, 0);
    gradient.addColorStop(0, '#171018');
    gradient.addColorStop(0.5, '#2a1921');
    gradient.addColorStop(1, '#0c090f');
    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - half * 0.7, top, half * 1.4, bottom - top);
    ctx.fillStyle = '#24151e';
    ctx.fillRect(centerX - half * 1.45, top - height * 0.018, half * 2.9, height * 0.025);
    ctx.fillRect(centerX - half * 1.2, bottom - height * 0.015, half * 2.4, height * 0.02);
    ctx.strokeStyle = '#59303a88';
    ctx.lineWidth = Math.max(1, width * 0.0015);
    ctx.beginPath();
    ctx.moveTo(centerX - half * 0.35, top + height * 0.025);
    ctx.lineTo(centerX - half * 0.35, bottom - height * 0.025);
    ctx.moveTo(centerX + half * 0.35, top + height * 0.025);
    ctx.lineTo(centerX + half * 0.35, bottom - height * 0.025);
    ctx.stroke();
  }

  private drawCastleFloor(ctx: CanvasRenderingContext2D, width: number, height: number, tint: string, seconds: number): void {
    const horizon = height * 0.6;
    const floor = ctx.createLinearGradient(0, horizon, 0, height);
    floor.addColorStop(0, '#211017');
    floor.addColorStop(0.4, '#160d14');
    floor.addColorStop(1, '#09070c');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.save();
    ctx.strokeStyle = 'rgba(153, 96, 79, .16)';
    ctx.lineWidth = 1;
    const rows = Array.from({ length: 9 }, (_, index) => {
      const progress = (index + 1) / 10;
      return horizon + (height - horizon) * progress ** 1.8;
    });
    rows.forEach((y, index) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      const upperY = index === 0 ? horizon : rows[index - 1];
      const blockCount = 4 + Math.floor(index / 2);
      const blockWidth = width / blockCount;
      const offset = index % 2 === 0 ? 0 : blockWidth * 0.5;
      for (let seam = -1; seam <= blockCount; seam += 1) {
        const x = seam * blockWidth + offset;
        const lean = Math.sin(seam * 2.1 + index) * width * 0.006;
        ctx.beginPath();
        ctx.moveTo(x, upperY);
        ctx.lineTo(x + lean, y);
        ctx.stroke();
      }
    });

    // A few glowing fissures connect the enemy's aura to the cracked stone beneath it.
    ctx.globalAlpha = 0.22 + Math.sin(seconds * 2.2) * 0.06;
    ctx.strokeStyle = tint;
    ctx.lineWidth = Math.max(1, width * 0.002);
    for (let index = 0; index < 3; index += 1) {
      const x = width * (0.38 + index * 0.11);
      const drift = Math.sin(seconds * 0.8 + index * 2) * width * 0.018;
      ctx.beginPath();
      ctx.moveTo(x, horizon + height * 0.12);
      ctx.lineTo(x + drift, horizon + height * 0.19);
      ctx.lineTo(x - drift * 0.4, horizon + height * 0.24);
      ctx.lineTo(x + drift * 0.3, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEmbers(ctx: CanvasRenderingContext2D, width: number, height: number, tint: string, seconds: number): void {
    ctx.save();
    for (let index = 0; index < 18; index += 1) {
      const phase = (seconds * (12 + index % 5) + index * 47) % (height * 0.72);
      const x = (index * width * 0.137 + Math.sin(seconds * 0.7 + index) * 18 + width) % width;
      const y = height * 0.68 - phase;
      const pulse = 0.35 + (Math.sin(seconds * 2 + index * 1.7) + 1) * 0.24;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = index % 4 === 0 ? '#ffb45e' : tint;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, index % 3 === 0 ? 1.8 : 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number): void {
    const enemy = this.session.enemy;
    const distance = enemy.distance;
    const scale = 0.24 + distance * 0.82;
    const size = Math.min(width, height) * (enemy.isBoss ? 0.25 : 0.17) * scale;
    const x = width / 2;
    const y = height * (0.34 + distance * 0.08) + Math.sin(seconds * 2.5) * size * 0.04;
    const sprite = enemy.isBoss ? enemySprites.boss : enemySprites.beast;
    const spriteHeight = size * (enemy.isBoss ? 2.6 : 3);
    ctx.save();
    ctx.globalAlpha = 0.25 + distance * 0.2;
    ctx.fillStyle = '#050812';
    ctx.beginPath(); ctx.ellipse(x, y + spriteHeight * 0.43, size * 0.9, size * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (enemy.hitFlash > 0) ctx.shadowColor = '#ffffff'; else ctx.shadowColor = this.session.stageInfo.tint;
    ctx.shadowBlur = (enemy.hitFlash > 0 ? 44 : 24) * scale;
    if (sprite.complete && sprite.naturalWidth > 0) {
      const spriteWidth = spriteHeight * (sprite.naturalWidth / sprite.naturalHeight);
      const aura = ctx.createRadialGradient(x, y, size * 0.08, x, y, spriteHeight * 0.64);
      aura.addColorStop(0, `${this.session.stageInfo.tint}55`);
      aura.addColorStop(1, `${this.session.stageInfo.tint}00`);
      ctx.shadowBlur = 0;
      ctx.fillStyle = aura;
      ctx.fillRect(x - spriteWidth * 0.7, y - spriteHeight * 0.7, spriteWidth * 1.4, spriteHeight * 1.4);
      ctx.globalAlpha = 0.82 + distance * 0.18;
      if (enemy.hitFlash > 0) {
        ctx.filter = `brightness(${1 + enemy.hitFlash * 2}) saturate(${1 + enemy.hitFlash})`;
      }
      ctx.drawImage(sprite, x - spriteWidth / 2, y - spriteHeight / 2, spriteWidth, spriteHeight);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const enemy = this.session.enemy;
    const distance = enemy.distance;
    const size = Math.min(width, height) * (enemy.isBoss ? 0.25 : 0.17) * (0.24 + distance * 0.82);
    const origin: Point = { x: width / 2, y: height * 0.82 };
    for (const projectile of this.projectiles) {
      const eased = 1 - (1 - projectile.progress) ** 3;
      const x = origin.x + (projectile.target.x - origin.x) * eased + Math.sin(projectile.progress * 12 + projectile.wobble) * 10 * (1 - projectile.progress);
      const y = origin.y + (projectile.target.y - origin.y) * eased;
      ctx.save();
      ctx.globalAlpha = 0.2 + (1 - projectile.progress) * 0.8;
      ctx.strokeStyle = `hsl(${projectile.hue} 100% 70%)`;
      ctx.lineWidth = 2 + (1 - projectile.progress) * 3;
      ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, y + 3); ctx.stroke();
      ctx.fillStyle = `hsl(${projectile.hue} 100% 72%)`;
      ctx.shadowColor = `hsl(${projectile.hue} 100% 62%)`; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, y, 4 + (1 - projectile.progress) * 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (enemy.hitFlash > 0) {
      ctx.save(); ctx.globalAlpha = enemy.hitFlash * 0.45; ctx.strokeStyle = '#dffffc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(width / 2, height * (0.34 + distance * 0.08), size * (0.9 + enemy.hitFlash * 0.35), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = `hsl(${particle.hue} 100% 70%)`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore();
    }
  }

  private drawSlashes(ctx: CanvasRenderingContext2D): void {
    for (const slash of this.slashes) {
      const progress = 1 - slash.life / slash.maxLife;
      ctx.save();
      ctx.translate(slash.x, slash.y);
      ctx.rotate(slash.angle);
      ctx.globalAlpha = Math.max(0, 1 - progress) * 0.9;
      ctx.strokeStyle = `hsl(${slash.hue} 100% ${slash.hue === 45 ? 72 : 78}%)`;
      ctx.lineWidth = Math.max(2, slash.size * 0.045 * (1 - progress * 0.55));
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = slash.size * 0.16;
      ctx.beginPath();
      ctx.ellipse(0, 0, slash.size * (0.34 + progress * 0.72), slash.size * (0.11 + progress * 0.08), 0, Math.PI * 1.08, Math.PI * 1.88);
      ctx.stroke();
      ctx.restore();
    }
  }

  private enemyEffectSize(): number {
    const width = this.canvas?.clientWidth ?? 0;
    const height = this.canvas?.clientHeight ?? 0;
    const enemy = this.session.enemy;
    return Math.min(width, height) * (enemy.isBoss ? 0.25 : 0.17) * (0.24 + enemy.distance * 0.82);
  }

  private enemyEffectPoint(): Point {
    const height = this.canvas?.clientHeight ?? 0;
    return { x: (this.canvas?.clientWidth ?? 0) / 2, y: height * (0.34 + this.session.enemy.distance * 0.08) };
  }

  private burstAtEnemy(count: number, hue: number, center: Point, size: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 28 + Math.random() * (count > 20 ? 260 : 110);
      const life = 0.22 + Math.random() * (count > 20 ? 0.78 : 0.32);
      this.particles.push({ x: center.x + (Math.random() - 0.5) * size * 0.8, y: center.y + (Math.random() - 0.5) * size * 0.8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: (1 + Math.random() * 4) * (count > 20 ? 1.35 : 1), hue: hue + Math.random() * 25 });
    }
  }

  private updateHud(): void {
    const enemy = this.session.enemy;
    const enemyKey = `${this.session.stage}:${this.session.wave}`;
    setText('#stage-name', this.session.stageInfo.name);
    setText('#score', this.session.stats.score.toLocaleString('ja-JP'));
    setText('#combo', String(this.session.stats.combo));
    setText('#wave-label', this.session.options.mode === 'story' ? `WAVE ${String(this.session.wave).padStart(2, '0')} / 09` : `WAVE ${String(this.session.wave).padStart(2, '0')}`);
    setText('#distance-label', `距離 ${Math.max(0, Math.round((1 - enemy.distance) * 100))}%`);
    setText('#miss-counter', `ミス ${this.session.stats.misses}`);
    setText('#typing-status', this.feedbackTimer > 0 ? this.feedback : '入力を開始してください');
    const targetText = document.querySelector<HTMLDivElement>('#target-text');
    if (targetText) {
      const displayText = enemy.prompt.text.replace(/[。．.!！?？]+$/u, '');
      const displayReading = enemy.prompt.reading.replace(/[。．.!！?？]+$/u, '');
      targetText.innerHTML = `<ruby class="target-ruby"><rb>${escapeHtml(displayText)}</rb><rt>${escapeHtml(displayReading)}</rt></ruby> <span class="target-category">${escapeHtml(enemy.prompt.category)}</span>`;
    }
    setText('#roman-prefix', enemy.typing.typed);
    const nextChars = enemy.typing.nextCharacters;
    setText('#roman-next', nextChars.length > 0 ? nextChars.join(' / ') : '撃破');
    const fill = document.querySelector<HTMLElement>('#stage-track-fill');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, this.session.stageProgress * 100))}%`;
    const health = document.querySelector<HTMLDivElement>('#health');
    if (health) health.innerHTML = Array.from({ length: 5 }, (_, index) => `<span class="health-pip ${index < this.session.hp ? 'alive' : ''}"></span>`).join('');
    document.querySelector('#arena-message')?.classList.toggle('visible', this.feedbackTimer > 0);
    if (this.previousStage !== this.session.stage) {
      this.previousStage = this.session.stage;
      this.feedback = `STAGE ${this.session.stage}`;
      this.feedbackTimer = 1.2;
      this.shake = 0.1;
    } else if (this.previousEnemyKey && this.previousEnemyKey !== enemyKey && enemy.isBoss) {
      this.feedback = 'BOSS APPROACHES';
      this.feedbackTimer = 1.35;
      this.shake = Math.max(this.shake, 0.14);
    }
    this.previousEnemyKey = enemyKey;
  }

  private showResult(): void {
    cancelAnimationFrame(this.animation);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    if (this.session.cleared) sound.blip('clear');
    const accuracy = this.session.stats.judged === 0 ? 100 : Math.round((this.session.stats.correct / this.session.stats.judged) * 100);
    const rank = accuracy >= 95 && this.session.stats.maxCombo >= 30 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : 'C';
    const highScoreKey = `type-breakers-high-${this.session.options.mode}`;
    const oldHigh = Number(localStorage.getItem(highScoreKey) ?? 0);
    const isNewHigh = this.session.stats.score > oldHigh;
    if (isNewHigh) localStorage.setItem(highScoreKey, String(this.session.stats.score));
    app.innerHTML = `
      <main class="result-screen ${this.session.cleared ? 'clear' : 'gameover'}">
        <div class="result-orbit" aria-hidden="true"></div>
        <section class="result-card">
          <p class="eyebrow">${this.session.cleared ? 'RUN COMPLETE' : 'SIGNAL LOST'}</p>
          <h1>${this.session.cleared ? 'BREAK THROUGH' : 'GAME OVER'}</h1>
          <p class="result-lead">${this.session.cleared ? 'すべての境界を撃ち抜いた。' : '敵の接近を許してしまった。'}</p>
          <div class="rank-line"><span>RANK</span><strong>${rank}</strong>${isNewHigh ? '<em>NEW BEST</em>' : ''}</div>
          <div class="result-grid">
            <div><span>スコア</span><strong>${this.session.stats.score.toLocaleString('ja-JP')}</strong></div>
            <div><span>撃破数</span><strong>${this.session.stats.defeated}</strong></div>
            <div><span>正確率</span><strong>${accuracy}%</strong></div>
            <div><span>最大コンボ</span><strong>${this.session.stats.maxCombo}</strong></div>
          </div>
          <div class="result-actions"><button class="primary-button" id="retry-button">もう一度挑戦</button><button class="text-button" id="back-button">タイトルへ戻る</button></div>
        </section>
      </main>
    `;
    document.querySelector<HTMLButtonElement>('#retry-button')?.addEventListener('click', () => new GameView(this.session.options.mode, this.session.options.difficulty).mount());
    document.querySelector<HTMLButtonElement>('#back-button')?.addEventListener('click', titleScreen);
  }
}

function setText(selector: string, text: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = text;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

titleScreen();
