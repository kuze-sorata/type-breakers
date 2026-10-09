import { type Difficulty, type GameMode, type Prompt, promptsForDifficulty, STAGES } from './data';
import { TypingEngine } from './typing';

export interface Enemy {
  prompt: Prompt;
  typing: TypingEngine;
  isBoss: boolean;
  stage: number;
  wave: number;
  distance: number;
  hpRatio: number;
  maxTime: number;
  elapsed: number;
  hitFlash: number;
}

export interface GameStats {
  score: number;
  defeated: number;
  correct: number;
  judged: number;
  misses: number;
  combo: number;
  maxCombo: number;
  elapsed: number;
}

export interface SessionOptions {
  mode: GameMode;
  difficulty: Difficulty;
  muted: boolean;
}

const SPEED: Record<Difficulty, number> = { easy: 18, normal: 14, hard: 10 };

export class GameSession {
  readonly options: SessionOptions;
  readonly stats: GameStats = { score: 0, defeated: 0, correct: 0, judged: 0, misses: 0, combo: 0, maxCombo: 0, elapsed: 0 };
  hp = 5;
  stage = 1;
  wave = 1;
  paused = false;
  ended = false;
  cleared = false;
  enemy: Enemy;
  private deck: Prompt[] = [];
  private used = new Set<string>();

  constructor(options: SessionOptions) {
    this.options = options;
    this.enemy = this.spawnEnemy();
  }

  get stageInfo() {
    return STAGES[this.stage - 1];
  }

  get isBossWave(): boolean {
    return this.options.mode === 'story' ? this.wave === 9 : this.wave % 10 === 0;
  }

  get stageProgress(): number {
    if (this.options.mode === 'endless') return ((this.wave - 1) % 10) / 10;
    return ((this.stage - 1) * 9 + this.wave - 1) / 45;
  }

  tick(deltaSeconds: number): void {
    if (this.paused || this.ended) return;
    const delta = Math.min(deltaSeconds, 0.1);
    this.stats.elapsed += delta;
    this.enemy.elapsed += delta;
    this.enemy.distance = Math.min(1, this.enemy.elapsed / this.enemy.maxTime);
    this.enemy.hitFlash = Math.max(0, this.enemy.hitFlash - delta * 5);
    if (this.enemy.distance >= 1) this.takeDamage();
  }

  input(key: string): 'progress' | 'complete' | 'miss' | 'already-complete' {
    if (this.paused || this.ended) return 'already-complete';
    const result = this.enemy.typing.input(key);
    if (result === 'miss') {
      this.stats.misses += 1;
      this.stats.judged += 1;
      this.stats.combo = 0;
      return result;
    }
    if (result === 'progress' || result === 'complete') {
      this.stats.correct += 1;
      this.stats.judged += 1;
      this.stats.combo += 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      this.enemy.hitFlash = 1;
      this.enemy.hpRatio = Math.max(0, 1 - this.enemy.typing.progressRatio);
      if (result === 'complete') this.defeatEnemy();
    }
    return result;
  }

  togglePause(): boolean {
    if (this.ended) return false;
    this.paused = !this.paused;
    return this.paused;
  }

  private takeDamage(): void {
    this.hp = Math.max(0, this.hp - 1);
    this.stats.combo = 0;
    if (this.hp === 0) {
      this.ended = true;
      this.cleared = false;
      return;
    }
    this.enemy = this.spawnEnemy();
  }

  private defeatEnemy(): void {
    const urgencyBonus = Math.max(0, Math.round((this.enemy.maxTime - this.enemy.elapsed) * 10));
    const comboBonus = Math.max(1, this.stats.combo) * (this.enemy.isBoss ? 8 : 3);
    this.stats.score += (this.enemy.isBoss ? 500 : 100) + urgencyBonus + comboBonus;
    this.stats.defeated += 1;
    if (this.options.mode === 'story' && this.enemy.isBoss) {
      if (this.stage === STAGES.length) {
        this.ended = true;
        this.cleared = true;
        return;
      }
      this.stage += 1;
      this.wave = 1;
      this.hp = Math.min(5, this.hp + 1);
    } else {
      this.wave += 1;
      if (this.options.mode === 'story' && this.wave > 9) this.wave = 9;
      if (this.options.mode === 'endless' && this.wave % 10 === 1) this.hp = Math.min(5, this.hp + 1);
    }
    this.enemy = this.spawnEnemy();
  }

  private nextPrompt(): Prompt {
    if (this.deck.length === 0) this.deck = [...promptsForDifficulty(this.options.difficulty)].sort(() => Math.random() - 0.5);
    let prompt = this.deck.pop();
    while (prompt && this.used.has(prompt.id) && this.deck.length > 0) prompt = this.deck.pop();
    if (!prompt) {
      this.used.clear();
      this.deck = [...promptsForDifficulty(this.options.difficulty)].sort(() => Math.random() - 0.5);
      prompt = this.deck.pop();
    }
    if (!prompt) throw new Error('問題データがありません');
    this.used.add(prompt.id);
    return prompt;
  }

  private spawnEnemy(): Enemy {
    const prompt = this.nextPrompt();
    const isBoss = this.isBossWave;
    const stageSpeedup = this.options.mode === 'story' ? Math.max(0, this.stage - 1) * 0.08 : Math.min(0.38, Math.floor(this.wave / 10) * 0.04);
    const baseTime = SPEED[this.options.difficulty] * (1 - stageSpeedup);
    return {
      prompt,
      typing: new TypingEngine(prompt.reading),
      isBoss,
      stage: this.stage,
      wave: this.wave,
      distance: 0,
      hpRatio: 1,
      maxTime: baseTime * (isBoss ? 1.65 : 1),
      elapsed: 0,
      hitFlash: 0,
    };
  }
}
