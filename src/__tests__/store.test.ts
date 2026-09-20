import { describe, it, expect, afterEach } from 'vitest';
import { KVStore } from '../store.js';
import { unlinkSync } from 'node:fs';

const tmpFile = `${__dirname}/../.tmp-test-store.json`;

afterEach(async () => {
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
});

describe('KVStore', () => {
  it('read() on fresh file returns {}', async () => {
    const store = new KVStore(tmpFile);
    const data = await store.read();
    expect(data).toEqual({});
  });

  it('write({foo: "bar"}) then read() returns {foo: "bar"}', async () => {
    const store = new KVStore(tmpFile);
    await store.write({ foo: 'bar' });
    const data = await store.read();
    expect(data).toEqual({ foo: 'bar' });
  });

  it('update() with mutator returns updated data', async () => {
    const store = new KVStore(tmpFile);
    await store.write({ count: 0 });
    const result = await store.update((data: Record<string, unknown>) => ({ ...data, count: (data.count as number) + 1 }));
    expect(result.count).toBe(1);
    const readBack = await store.read();
    expect(readBack.count).toBe(1);
  });

  it('Concurrent update() calls do not lose data', async () => {
    const store = new KVStore(tmpFile);
    await store.write({ value: 0 });
    await Promise.all([
      store.update((d: Record<string, unknown>) => ({ ...d, value: (d.value as number) + 1 })),
      store.update((d: Record<string, unknown>) => ({ ...d, value: (d.value as number) + 1 })),
      store.update((d: Record<string, unknown>) => ({ ...d, value: (d.value as number) + 1 })),
    ]);
    const final = await store.read();
    expect(final.value).toBe(3);
  });
});
