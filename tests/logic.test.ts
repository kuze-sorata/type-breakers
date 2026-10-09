import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/logic';

function finishEnemy(session: GameSession): void {
  const route = session.enemy.typing.candidates[0];
  for (const key of route) session.input(key);
}

function letEnemyReachPlayer(session: GameSession): void {
  const steps = Math.ceil(session.enemy.maxTime / 0.1) + 2;
  for (let index = 0; index < steps; index += 1) session.tick(0.1);
}

describe('GameSession', () => {
  it('takes damage when an enemy reaches the player and ends at zero HP', () => {
    const session = new GameSession({ mode: 'endless', difficulty: 'easy', muted: true });
    expect(session.hp).toBe(5);
    for (let index = 0; index < 4; index += 1) {
      letEnemyReachPlayer(session);
      expect(session.hp).toBe(4 - index);
      expect(session.ended).toBe(false);
    }
    letEnemyReachPlayer(session);
    expect(session.hp).toBe(0);
    expect(session.ended).toBe(true);
    expect(session.cleared).toBe(false);
  });

  it('advances the story after eight regular enemies and one boss', () => {
    const session = new GameSession({ mode: 'story', difficulty: 'easy', muted: true });
    for (let index = 0; index < 8; index += 1) finishEnemy(session);
    expect(session.stage).toBe(1);
    expect(session.wave).toBe(9);
    expect(session.enemy.isBoss).toBe(true);
    finishEnemy(session);
    expect(session.stage).toBe(2);
    expect(session.wave).toBe(1);
    expect(session.hp).toBe(5);
  });

  it('pauses both timer and input progression', () => {
    const session = new GameSession({ mode: 'endless', difficulty: 'easy', muted: true });
    const before = session.enemy.elapsed;
    session.togglePause();
    session.tick(2);
    expect(session.enemy.elapsed).toBe(before);
    expect(session.input('x')).toBe('already-complete');
    session.togglePause();
    session.tick(0.2);
    expect(session.enemy.elapsed).toBeGreaterThan(before);
  });
});
