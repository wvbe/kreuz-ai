import { useCallback, useState } from "react";
import { useEngineHost } from "../engine/useEngineHost";
import type { GameCommand } from "../engine/gameCommands";
import { fieldErrorsOf } from "./commandPayloads";
import type { FieldErrors, PayloadResult } from "./commandPayloads";

/**
 * What {@link useSender} gives a form.
 */
export type Sender = {
  /**
   * The errors of the last send, by field (`""` for a general one).
   */
  errors: FieldErrors;
  /**
   * Sends a command through `host.commands.send`; the host raises the error toast, the field
   * errors stay here for the form. Returns whether the command was accepted.
   */
  send: (command: GameCommand) => boolean;
  /**
   * Sends the command of a form builder, or shows its field errors without sending.
   */
  sendForm: (result: PayloadResult) => boolean;
  clear: () => void;
};

/**
 * The send path of a form: commands go through `host.commands.send` and the structured errors of
 * the result come back as field errors beside the inputs (the toast is the host's job).
 *
 * @returns The sender.
 */
export function useSender(): Sender {
  const host = useEngineHost();
  const [errors, setErrors] = useState<FieldErrors>({});
  const send = useCallback(
    (command: GameCommand): boolean => {
      const result = host.commands.send(command);
      setErrors(fieldErrorsOf(result));
      return result.ok;
    },
    [host],
  );
  const sendForm = useCallback(
    (result: PayloadResult): boolean => {
      if (!result.ok) {
        setErrors(result.errors);
        return false;
      }
      return send(result.command);
    },
    [send],
  );
  const clear = useCallback(() => setErrors({}), []);
  return { errors, send, sendForm, clear };
}
