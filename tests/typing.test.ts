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
  it('contains many unique prompts across multiple sentence families', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(170);
    expect(new Set(PROMPTS.map((prompt) => prompt.id)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((prompt) => prompt.text)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((prompt) => prompt.family)).size).toBeGreaterThanOrEqual(9);
    expect(PROMPTS.every((prompt) => !prompt.id.startsWith('generated-'))).toBe(true);
  });

  it('keeps final punctuation out of the typing target', () => {
    expect(PROMPTS.every((prompt) => !/[。．.!！?？]$/u.test(prompt.text))).toBe(true);
    expect(PROMPTS.every((prompt) => !/[。．.!！?？]$/u.test(prompt.reading))).toBe(true);
  });

  it('gives every independent prompt a valid romaji route', () => {
    for (const prompt of PROMPTS) {
      const engine = new TypingEngine(prompt.reading);
      expect(typeAll(engine, engine.candidates[0]).at(-1)).toBe('complete');
    }
  });
});
