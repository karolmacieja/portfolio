/** CSV (RFC 4180, semicolon-free comma format) with protection against spreadsheet formula injection. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cell === null || cell === undefined ? "" : String(cell);
          // Cells starting with these are executed as formulas by Excel/Sheets.
          if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
          return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
}
