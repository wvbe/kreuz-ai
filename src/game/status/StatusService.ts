import { FlowLedger } from "./flow/FlowLedger";
import { StatusTracker } from "./StatusTracker";
import type { StatusProvider, StatusSubjectKind } from "./statusTypes";

/**
 * Per-engine status state: the provider registry (spec 025 FR-005, DECISIONS D-18 pull model),
 * the settle tracker and the flow ledger. Systems add their subjects with `registerProvider`.
 */
export class StatusService {
  /**
   * The settle tracker (root save section `statuses`).
   */
  readonly tracker = new StatusTracker();
  /**
   * The flow ledger (root save section `productionLedger`).
   */
  readonly ledger = new FlowLedger();
  private readonly list: StatusProvider[] = [];

  /**
   * Registers the provider of one subject kind. Subjects are visited in registration order of
   * their providers, each provider's own subject order inside (spec 025 FR-008).
   *
   * @param provider - The provider.
   * @throws Error when the kind already has a provider.
   */
  registerProvider(provider: StatusProvider): void {
    if (this.list.some((existing) => existing.kind === provider.kind)) {
      throw new Error(`a status provider for ${provider.kind} is already registered`);
    }
    this.list.push(provider);
  }

  /**
   * The registered providers in registration order.
   *
   * @returns A copy of the list.
   */
  providers(): StatusProvider[] {
    return [...this.list];
  }

  /**
   * The provider of a subject kind.
   *
   * @param kind - The kind.
   * @returns The provider, or undefined when none is registered.
   */
  providerOf(kind: StatusSubjectKind): StatusProvider | undefined {
    return this.list.find((provider) => provider.kind === kind);
  }
}
