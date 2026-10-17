// Shared by the data generators in this folder.

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") {
      endField();
      rows.push(row);
      row = [];
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    endField();
    rows.push(row);
  }
  return rows;
}
