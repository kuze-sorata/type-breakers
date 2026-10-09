import { describe, expect, it } from 'vitest';
import { PROMPTS } from '../src/game/data';
import { TypingEngine } from '../src/game/typing';

function typeAll(engine: TypingEngine, text: string): string[] {
  return [...text].map((character) => engine.input(character));
}

describe('TypingEngine', () => {
  it('accepts multiple romaji routes for common kana', () => {
    for (const route of ['shi', 'si']) {
      const engine = new TypingEngine('し');
      expect(typeAll(engine, route).at(-1)).toBe('complete');
    }
    for (const route of ['chi', 'ti']) {
      const engine = new TypingEngine('ち');
      expect(typeAll(engine, route).at(-1)).toBe('complete');
    }
  });

  it('handles digraphs, sokuon, and context around n', () => {
    expect(typeAll(new TypingEngine('しゃ'), 'sya').at(-1)).toBe('complete');
    expect(typeAll(new TypingEngine('がっこう'), 'gakkou').at(-1)).toBe('complete');
    expect(typeAll(new TypingEngine('こんにちは'), 'konnichiha').at(-1)).toBe('complete');
  });

  it('rejects a wrong key without advancing progress', () => {
    const engine = new TypingEngine('し');
    expect(engine.input('x')).toBe('miss');
    expect(engine.typed).toBe('');
    expect(engine.input('s')).toBe('progress');
  });

  it('supports punctuation and exposes next choices', () => {
    const engine = new TypingEngine('きょう。');
    expect(engine.nextCharacters).toContain('k');
    typeAll(engine, 'kyou.');
    expect(engine.isComplete).toBe(true);
  });
});

describe('prompt data', () => {
  it('contains the original prompts plus about 1000 generated prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(1150);
    expect(new Set(PROMPTS.map((prompt) => prompt.id)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((prompt) => prompt.text)).size).toBe(PROMPTS.length);
  });

  it('keeps final punctuation out of the typing target', () => {
    expect(PROMPTS.every((prompt) => !/[。．.!！?？]$/u.test(prompt.text))).toBe(true);
    expect(PROMPTS.every((prompt) => !/[。．.!！?？]$/u.test(prompt.reading))).toBe(true);
  });
});
