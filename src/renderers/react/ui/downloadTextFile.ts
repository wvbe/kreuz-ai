/**
 * Offers a text as a file download through a temporary link (the browser implementation of
 * `AppServices.downloadText`).
 *
 * @param fileName - Suggested file name.
 * @param text - File contents.
 */
export function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
