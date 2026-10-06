import type { ReactNode } from "react";

/**
 * Props of {@link FormField}.
 */
export type FormFieldProps = {
  label: string;
  /**
   * The error to show under the input, if any.
   */
  error?: string | undefined;
  children: ReactNode;
};

/**
 * A labelled input with its inline error (spec 024 FR-010: structured command errors show beside
 * the field they belong to).
 *
 * @param props - Label, error and the input.
 * @returns The field.
 */
export function FormField(props: FormFieldProps) {
  return (
    <label className="kv-field">
      <span>{props.label}</span>
      {props.children}
      {props.error === undefined ? null : (
        <span role="alert" className="kv-field-error">
          {props.error}
        </span>
      )}
    </label>
  );
}

/**
 * The general error of a form (a failure that belongs to no field).
 *
 * @param props - The message, if any.
 * @returns The message or nothing.
 */
export function FormError(props: { message: string | undefined }) {
  return props.message === undefined ? null : (
    <p role="alert" className="kv-field-error">
      {props.message}
    </p>
  );
}
