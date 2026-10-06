// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormError, FormField } from "./FormField";

afterEach(cleanup);

describe("FormField and FormError", () => {
  it("shows the error under the input as an alert and nothing without one", () => {
    render(
      <>
        <FormField label="Amount" error="Must be at least 1">
          <input />
        </FormField>
        <FormField label="Name">
          <input />
        </FormField>
        <FormError message="Refused" />
        <FormError message={undefined} />
      </>,
    );
    expect(screen.getByLabelText(/Amount/)).toBeTruthy();
    expect(screen.getAllByRole("alert").map((node) => node.textContent)).toEqual([
      "Must be at least 1",
      "Refused",
    ]);
  });
});
