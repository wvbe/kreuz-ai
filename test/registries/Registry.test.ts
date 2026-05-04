import { describe, it, expect } from 'vitest';
import { Registry } from '../../src/engine/Registry.js';

interface TestEntry {
  id: string;
  name: string;
  value: number;
}

describe('Registry<T>', () => {
  it('registers and retrieves entries by ID', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'foo', name: 'Foo', value: 1 });
    registry.register({ id: 'bar', name: 'Bar', value: 2 });

    expect(registry.get('foo')).toEqual({ id: 'foo', name: 'Foo', value: 1 });
    expect(registry.get('bar')).toEqual({ id: 'bar', name: 'Bar', value: 2 });
  });

  it('has() returns true for existing entries, false otherwise', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'foo', name: 'Foo', value: 1 });

    expect(registry.has('foo')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('tryGet() returns undefined for missing entries', () => {
    const registry = new Registry<TestEntry>();
    expect(registry.tryGet('missing')).toBeUndefined();
  });

  it('get() throws for missing entries', () => {
    const registry = new Registry<TestEntry>();
    expect(() => registry.get('missing')).toThrow('Entry not found: "missing"');
  });

  it('rejects duplicate IDs', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'foo', name: 'Foo', value: 1 });

    expect(() => registry.register({ id: 'foo', name: 'Foo2', value: 2 })).toThrow(
      'Duplicate entry ID: "foo"'
    );
  });

  it('freezes entries as immutable objects', () => {
    const registry = new Registry<TestEntry>();
    const original = { id: 'foo', name: 'Foo', value: 1 };
    registry.register(original);

    const retrieved = registry.get('foo');
    expect(Object.isFrozen(retrieved)).toBe(true);
  });

  it('freeze() prevents further registration', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'foo', name: 'Foo', value: 1 });
    registry.freeze();

    expect(() => registry.register({ id: 'bar', name: 'Bar', value: 2 })).toThrow(
      'Registry is frozen'
    );
  });

  it('getAll() returns all registered entries', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'a', name: 'A', value: 1 });
    registry.register({ id: 'b', name: 'B', value: 2 });
    registry.register({ id: 'c', name: 'C', value: 3 });

    expect(registry.getAll()).toHaveLength(3);
    expect(registry.size).toBe(3);
  });

  it('filter() returns matching entries', () => {
    const registry = new Registry<TestEntry>();
    registry.register({ id: 'a', name: 'A', value: 1 });
    registry.register({ id: 'b', name: 'B', value: 5 });
    registry.register({ id: 'c', name: 'C', value: 10 });

    const highValue = registry.filter((e) => e.value >= 5);
    expect(highValue).toHaveLength(2);
  });

  it('registerAll() registers multiple entries', () => {
    const registry = new Registry<TestEntry>();
    registry.registerAll([
      { id: 'a', name: 'A', value: 1 },
      { id: 'b', name: 'B', value: 2 },
    ]);

    expect(registry.size).toBe(2);
    expect(registry.has('a')).toBe(true);
    expect(registry.has('b')).toBe(true);
  });
});
