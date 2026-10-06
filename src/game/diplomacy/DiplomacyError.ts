/**
 * Categories of diplomacy command failure. The enum value is the command error code the player
 * sees at the start of the message (DECISIONS section 3.8).
 */
export enum DiplomacyErrorKind {
  UnknownFaction = "UnknownFaction",
  SelfTarget = "SelfTarget",
  NoSeat = "NoSeat",
  InvalidAct = "InvalidAct",
  InsufficientFunds = "InsufficientFunds",
  CargoTooLarge = "CargoTooLarge",
  TargetLeaderless = "TargetLeaderless",
  HostileGate = "HostileGate",
  AgreementExists = "AgreementExists",
  TooManyEnvoys = "TooManyEnvoys",
  UnknownDirective = "UnknownDirective",
  NotCancellable = "NotCancellable",
  UnknownProposal = "UnknownProposal",
}

/**
 * Failure of a diplomacy command; callers branch on `kind`.
 */
export class DiplomacyError extends Error {
  /**
   * Creates a diplomacy error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the faction, envoy or proposal.
   */
  constructor(
    public readonly kind: DiplomacyErrorKind,
    message: string,
  ) {
    super(`${kind}: ${message}`);
    this.name = "DiplomacyError";
  }
}
