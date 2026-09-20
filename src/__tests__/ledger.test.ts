import { describe, it, expect, afterEach } from 'vitest';
import { Ledger } from '../ledger.js';
import { KVStore } from '../store.js';
import { unlinkSync } from 'node:fs';

const tmpFile = `${__dirname}/../.tmp-test-ledger.json`;

afterEach(async () => {
  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }
});

describe('Ledger', () => {
  it('add() returns event with ts', async () => {
    const store = new KVStore(tmpFile);
    const ledger = new Ledger(store);
    const event = await ledger.add({
      tool: 'test',
      inputTokens: 100,
      savedTokens: 50,
      note: 'test',
    });
    expect(event.ts).toBeTruthy();
    expect(event.tool).toBe('test');
  });

  it('report() returns empty events and 0 total for fresh store', async () => {
    const store = new KVStore(tmpFile);
    const ledger = new Ledger(store);
    const report = await ledger.report();
    expect(report.events).toEqual([]);
    expect(report.totalSavedTokens).toBe(0);
  });

  it('Multiple add() calls accumulate totalSavedTokens', async () => {
    const store = new KVStore(tmpFile);
    const ledger = new Ledger(store);
    await ledger.add({ tool: 'a', inputTokens: 10, savedTokens: 5, note: '' });
    await ledger.add({ tool: 'b', inputTokens: 20, savedTokens: 10, note: '' });
    const report = await ledger.report();
    expect(report.totalSavedTokens).toBe(15);
  });

  it('Events capped at 200 (add 201, check length is 200)', async () => {
    const store = new KVStore(tmpFile);
    const ledger = new Ledger(store);
    for (let i = 0; i < 201; i++) {
      await ledger.add({ tool: `t${i}`, inputTokens: 1, savedTokens: 1, note: '' });
    }
    const report = await ledger.report();
    expect(report.events.length).toBe(200);
  });

  it('add() with savedTokens adds to totalSavedTokens', async () => {
    const store = new KVStore(tmpFile);
    const ledger = new Ledger(store);
    await ledger.add({ tool: 'x', inputTokens: 50, savedTokens: 25, note: 'saved' });
    const report = await ledger.report();
    expect(report.totalSavedTokens).toBe(25);
  });
});
