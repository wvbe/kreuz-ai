import { StoreBase } from "../engine/StoreBase";
import type { EngineHost } from "../engine/EngineHost";
import { Screen } from "../navigation/Screen";

/**
 * What the chronicle screen shows: an optional citizen filter, an optional moment kind and
 * whether the citizen's full journal (Minor entries too) replaces the chronicle.
 */
export type ChronicleRequest = {
  entityId: number | null;
  kind: string | null;
  journal: boolean;
};

const emptyRequest: ChronicleRequest = { entityId: null, kind: null, journal: false };

/**
 * The filter of the chronicle screen, kept outside the screen so any panel can open it: a
 * citizen panel's "Journal" link calls {@link openCitizenJournal}, a toast calls
 * {@link openChronicle}.
 */
export class ChronicleRequestStore extends StoreBase<ChronicleRequest> {
  /**
   * Creates the store with no filter.
   */
  constructor() {
    super(emptyRequest);
  }

  /**
   * Replaces the request.
   *
   * @param request - The new filter.
   */
  set(request: ChronicleRequest): void {
    this.replace(request);
  }

  /**
   * Removes every filter.
   */
  clear(): void {
    this.replace(emptyRequest);
  }
}

/**
 * The shared request store (one chronicle screen exists at a time).
 */
export const chronicleRequests = new ChronicleRequestStore();

/**
 * Shows the chronicle without a filter.
 *
 * @param host - The engine host.
 */
export function openChronicle(host: EngineHost): void {
  chronicleRequests.clear();
  host.navigation.navigate(Screen.Chronicle);
}

/**
 * Shows the journal of one citizen on the chronicle screen: the link target of the citizen
 * panel's Journal tab and of names in the chronicle.
 *
 * @param host - The engine host.
 * @param entityId - The citizen.
 */
export function openCitizenJournal(host: EngineHost, entityId: number): void {
  chronicleRequests.set({ entityId, kind: null, journal: true });
  host.navigation.navigate(Screen.Chronicle);
}
