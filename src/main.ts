import './style.css';
import { type Difficulty, type GameMode } from './game/data';
import { GameSession } from './game/logic';

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('アプリのマウント先が見つかりません');
const app: HTMLDivElement = appElement;

type Point = { x: number; y: number };
type Projectile = { progress: number; wobble: number; hue: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number };

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
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const frequencies = { hit: 440, miss: 110, finish: 180, damage: 80, clear: 660 };
    oscillator.type = kind === 'miss' || kind === 'damage' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(frequencies[kind], this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind] * (kind === 'miss' ? 0.65 : 1.7), this.context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, this.context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + (kind === 'clear' ? 0.5 : 0.16));
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + (kind === 'clear' ? 0.5 : 0.17));
  }
}

const storedMuted = localStorage.getItem('type-breakers-muted') === 'true';
const sound = new SoundBox(storedMuted);

function titleScreen(): void {
  app.innerHTML = `
    <main class="title-screen">
      <div class="title-stars" aria-hidden="true"></div>
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
  private shake = 0;
  private feedback = '';
  private feedbackTimer = 0;
  private previousStage = 1;
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
          <div class="pause-overlay hidden" id="pause-overlay"><span>PAUSED</span><small>Escで再開</small></div>
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
    const result = this.session.input(event.key);
    if (result === 'miss') {
      this.feedback = 'MISS';
      this.feedbackTimer = 0.35;
      this.shake = 0.12;
      sound.blip('miss');
    } else if (result === 'progress') {
      this.projectiles.push({ progress: 0, wobble: Math.random() * Math.PI, hue: 172 + Math.random() * 50 });
      this.burstAtEnemy(3, 176 + Math.random() * 38);
      this.feedback = 'HIT';
      this.feedbackTimer = 0.18;
      sound.blip('hit');
    } else if (result === 'complete') {
      this.projectiles.push({ progress: 0, wobble: 0, hue: 44 });
      this.burstAtEnemy(34, 42);
      this.feedback = 'BREAK';
      this.feedbackTimer = 0.7;
      this.shake = 0.22;
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

  private updateEffects(delta: number): void {
    this.feedbackTimer = Math.max(0, this.feedbackTimer - delta);
    this.shake = Math.max(0, this.shake - delta * 0.9);
    this.projectiles = this.projectiles.map((projectile) => ({ ...projectile, progress: projectile.progress + delta * 2.8 })).filter((projectile) => projectile.progress < 1);
    this.particles = this.particles.map((particle) => ({
      ...particle,
      x: particle.x + particle.vx * delta,
      y: particle.y + particle.vy * delta,
      vy: particle.vy + 20 * delta,
      life: particle.life - delta,
    })).filter((particle) => particle.life > 0);
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
    this.drawParticles(ctx);
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number): void {
    const stage = this.session.stageInfo;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    const palettes: Record<string, [string, string, string]> = {
      grassland: ['#102f31', '#174c47', '#0a171f'], forest: ['#0e2930', '#173c3b', '#08151e'], cave: ['#18254a', '#2a2860', '#090e24'], castle: ['#321e36', '#4d2940', '#100d20'], throne: ['#241337', '#522255', '#10091b'],
    };
    const colors = palettes[stage.theme];
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(0.55, colors[1]); gradient.addColorStop(1, colors[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 83 + 24) % width;
      const y = (i * 47 + 12) % (height * 0.52);
      const pulse = 1 + Math.sin(seconds * 1.8 + i) * 0.25;
      ctx.fillStyle = stage.tint;
      ctx.fillRect(x, y, pulse, pulse);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = stage.tint;
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 1) {
      ctx.beginPath(); ctx.moveTo(width / 2 + i * width * 0.08, height * 0.42); ctx.lineTo(width / 2 + i * width * 0.34, height); ctx.stroke();
    }
    for (let i = 0; i < 8; i += 1) {
      const y = height * (0.45 + i * i * 0.0075);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(width / 2, height * 0.43, 10, width / 2, height * 0.43, height * 0.7);
    glow.addColorStop(0, `${stage.tint}22`); glow.addColorStop(1, '#00000000');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, width: number, height: number, seconds: number): void {
    const enemy = this.session.enemy;
    const distance = enemy.distance;
    const scale = 0.24 + distance * 0.82;
    const size = Math.min(width, height) * (enemy.isBoss ? 0.25 : 0.17) * scale;
    const x = width / 2;
    const y = height * (0.34 + distance * 0.08) + Math.sin(seconds * 2.5) * size * 0.04;
    ctx.save();
    ctx.globalAlpha = 0.25 + distance * 0.2;
    ctx.fillStyle = '#050812';
    ctx.beginPath(); ctx.ellipse(x, height * 0.65 + distance * height * 0.17, size * 0.9, size * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (enemy.hitFlash > 0) ctx.shadowColor = '#ffffff'; else ctx.shadowColor = this.session.stageInfo.tint;
    ctx.shadowBlur = (enemy.hitFlash > 0 ? 30 : 12) * scale;
    drawMonster(ctx, x, y, size, this.session.stageInfo.tint, enemy.isBoss, enemy.hitFlash, this.session.stage);
    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const enemy = this.session.enemy;
    const distance = enemy.distance;
    const size = Math.min(width, height) * (enemy.isBoss ? 0.25 : 0.17) * (0.24 + distance * 0.82);
    const target: Point = { x: width / 2, y: height * (0.34 + distance * 0.08) };
    const origin: Point = { x: width / 2, y: height * 0.82 };
    for (const projectile of this.projectiles) {
      const eased = 1 - (1 - projectile.progress) ** 3;
      const x = origin.x + (target.x - origin.x) * eased + Math.sin(projectile.progress * 12 + projectile.wobble) * 10 * (1 - projectile.progress);
      const y = origin.y + (target.y - origin.y) * eased;
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
      ctx.beginPath(); ctx.arc(target.x, target.y, size * (0.9 + enemy.hitFlash * 0.35), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = `hsl(${particle.hue} 100% 70%)`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore();
    }
  }

  private burstAtEnemy(count: number, hue: number): void {
    const width = this.canvas?.clientWidth ?? 0;
    const height = this.canvas?.clientHeight ?? 0;
    const distance = this.session.enemy.distance;
    const size = Math.min(width, height) * (this.session.enemy.isBoss ? 0.25 : 0.17) * (0.24 + distance * 0.82);
    const center = { x: width / 2, y: height * (0.34 + distance * 0.08) };
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * (count > 10 ? 120 : 70);
      const life = 0.25 + Math.random() * (count > 10 ? 0.55 : 0.25);
      this.particles.push({ x: center.x + (Math.random() - 0.5) * size, y: center.y + (Math.random() - 0.5) * size, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 1 + Math.random() * 3, hue: hue + Math.random() * 25 });
    }
  }

  private updateHud(): void {
    const enemy = this.session.enemy;
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
    }
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

function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, boss: boolean, hit: number, stage: number): void {
  const body = boss ? size * 1.18 : size;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(performance.now() / 480) * 0.025);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = hit > 0 ? '#efffff' : color;
  ctx.strokeStyle = '#d7fff5'; ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  if (boss) {
    ctx.moveTo(0, -body * 0.72); ctx.lineTo(-body * 0.48, -body * 0.42); ctx.lineTo(-body * 0.68, body * 0.35); ctx.lineTo(-body * 0.25, body * 0.72); ctx.lineTo(body * 0.25, body * 0.72); ctx.lineTo(body * 0.68, body * 0.35); ctx.lineTo(body * 0.48, -body * 0.42); ctx.closePath();
  } else {
    ctx.ellipse(0, 0, body * 0.6, body * 0.68, 0, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#08131f';
  ctx.beginPath(); ctx.arc(-body * 0.22, -body * 0.13, body * 0.085, 0, Math.PI * 2); ctx.arc(body * 0.22, -body * 0.13, body * 0.085, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#08131f'; ctx.lineWidth = Math.max(1, body * 0.04);
  ctx.beginPath(); ctx.arc(0, body * 0.12, body * 0.2, 0.12, Math.PI - 0.12); ctx.stroke();
  ctx.fillStyle = stage === 4 || stage === 5 ? '#ffdf8b' : '#e9fff8';
  ctx.beginPath(); ctx.arc(-body * 0.22, -body * 0.13, body * 0.035, 0, Math.PI * 2); ctx.arc(body * 0.22, -body * 0.13, body * 0.035, 0, Math.PI * 2); ctx.fill();
  if (boss) {
    ctx.strokeStyle = '#ffe39b'; ctx.lineWidth = Math.max(1, body * 0.035);
    ctx.beginPath(); ctx.moveTo(-body * 0.35, -body * 0.5); ctx.lineTo(-body * 0.65, -body * 0.92); ctx.lineTo(-body * 0.1, -body * 0.58); ctx.moveTo(body * 0.35, -body * 0.5); ctx.lineTo(body * 0.65, -body * 0.92); ctx.lineTo(body * 0.1, -body * 0.58); ctx.stroke();
  }
  ctx.restore();
}

function setText(selector: string, text: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = text;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

titleScreen();
