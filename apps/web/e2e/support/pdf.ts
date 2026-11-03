// Builds a scorecard PDF from a text-item fixture (the same positioned text the parser
// tests use), so the upload journey runs without committing a real scorecard PDF.

type TextItem = { str: string; x: number; y: number; page: number };

const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function scorecardPdf(items: TextItem[]): Buffer {
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // 1-based object numbers

  const catalog = add('');
  const pageTree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageRefs: number[] = [];
  for (const page of pages) {
    const text = items
      .filter((i) => i.page === page)
      .map((i) => `BT /F1 8 Tf 1 0 0 1 ${i.x} ${i.y} Tm (${escapePdf(i.str)}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`);
    pageRefs.push(
      add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${pageRefs.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
