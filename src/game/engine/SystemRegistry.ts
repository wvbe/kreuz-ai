import { SystemRegistryError, SystemRegistryErrorKind } from "./SystemRegistryError";

/**
 * What the registry needs to know about a system: its id, the ids it depends on and an optional
 * synchronous init hook (spec 007 FR-015). `Context` is whatever the owner passes to hooks.
 */
export type SystemRegistration<Context> = {
  /**
   * Unique id, dotted lowercase segments such as `tasks.execution`.
   */
  id: string;
  /**
   * Ids of systems whose init hook must run first. They may be registered later than this one;
   * they are checked when the order is resolved.
   */
  dependencies?: readonly string[];
  /**
   * Runs once per `newGame` / `loadGame`, in dependency order, before that call returns.
   */
  init?: (context: Context) => void;
};

const idPattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)*$/;

/**
 * Per-engine registry of systems with dependency-ordered init hooks (spec 007 FR-015, SC-008).
 * Registration order breaks ties, so the resolved order is deterministic. Hooks are synchronous;
 * a hook that returns a promise is not awaited and is a programming error.
 */
export class SystemRegistry<Context> {
  private readonly systems: SystemRegistration<Context>[] = [];

  /**
   * Adds a system.
   *
   * @param registration - Id, dependencies and optional init hook.
   */
  register(registration: SystemRegistration<Context>): void {
    if (!idPattern.test(registration.id)) {
      throw new SystemRegistryError(
        SystemRegistryErrorKind.InvalidDefinition,
        `invalid system id "${registration.id}": use dotted lowercase segments such as "tasks.execution"`,
      );
    }
    if (this.has(registration.id)) {
      throw new SystemRegistryError(
        SystemRegistryErrorKind.DuplicateSystem,
        `system "${registration.id}" is already registered`,
      );
    }
    const dependencies = registration.dependencies ?? [];
    if (dependencies.includes(registration.id)) {
      throw new SystemRegistryError(
        SystemRegistryErrorKind.DependencyCycle,
        `system "${registration.id}" depends on itself`,
      );
    }
    this.systems.push({ ...registration, dependencies: [...dependencies] });
  }

  /**
   * Tells whether a system id is registered.
   *
   * @param id - System id.
   * @returns True when registered.
   */
  has(id: string): boolean {
    return this.systems.some((system) => system.id === id);
  }

  /**
   * Ids in registration order.
   *
   * @returns The ids.
   */
  ids(): string[] {
    return this.systems.map((system) => system.id);
  }

  /**
   * Topologically sorts the systems: every system comes after all of its dependencies, ties by
   * registration order. Throws before returning anything when a dependency is not registered or
   * the dependencies form a cycle.
   *
   * @returns The system ids in init order.
   */
  resolveOrder(): string[] {
    for (const system of this.systems) {
      for (const dependency of system.dependencies ?? []) {
        if (!this.has(dependency)) {
          throw new SystemRegistryError(
            SystemRegistryErrorKind.MissingDependency,
            `system "${system.id}" depends on "${dependency}", which is not registered`,
          );
        }
      }
    }
    const done = new Set<string>();
    const order: string[] = [];
    while (order.length < this.systems.length) {
      const next = this.systems.find(
        (system) => !done.has(system.id) && (system.dependencies ?? []).every((id) => done.has(id)),
      );
      if (!next) {
        throw new SystemRegistryError(
          SystemRegistryErrorKind.DependencyCycle,
          `system dependencies form a cycle: ${this.describeCycle(done)}`,
        );
      }
      done.add(next.id);
      order.push(next.id);
    }
    return order;
  }

  /**
   * Runs every init hook synchronously in {@link SystemRegistry.resolveOrder} order. The order
   * is resolved (and validated) before the first hook runs.
   *
   * @param context - Passed to each hook.
   * @returns The ids of the systems, in the order they were initialised.
   */
  runInit(context: Context): string[] {
    const order = this.resolveOrder();
    for (const id of order) {
      this.systems.find((system) => system.id === id)?.init?.(context);
    }
    return order;
  }

  private describeCycle(done: ReadonlySet<string>): string {
    const remaining = this.systems.filter((system) => !done.has(system.id));
    const path: string[] = [];
    let current = remaining[0];
    while (current && !path.includes(current.id)) {
      path.push(current.id);
      const nextId = (current.dependencies ?? []).find((id) => !done.has(id));
      current = remaining.find((system) => system.id === nextId);
    }
    const start = current ? path.indexOf(current.id) : 0;
    return [...path.slice(start), current?.id ?? path[0] ?? ""].join(" -> ");
  }
}
