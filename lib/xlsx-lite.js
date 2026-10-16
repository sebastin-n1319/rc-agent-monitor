'use strict';
/**
 * Batch 166: a small .xlsx writer (no new dependency; jszip already ships with docx and mammoth).
 * Plain, Finance-style sheets: visible gridlines, a plain bold title, maroon section bars, cream column headers,
 * green for Slab 1, blue for Slab 2. Cells are { v, s } where s is one of the style names below; a bare value is text
 * or a number. Merges use "A1:D1" ranges.
 */
const JSZip = require('jszip');

const STYLES = ['text', 'title', 'sub', 'section', 'head', 'num', 'num1', 'pct', 'money', 'bold', 'boldNum', 'boldMoney',
  's1', 's2', 'miss', 'ok', 'bad', 'note', 'wrap', 'boldPct'];
const SID = Object.fromEntries(STYLES.map((n, i) => [n, i]));

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="&quot;Rs. &quot;#,##0"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts>
<fonts count="6">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="13"/><name val="Arial"/></font>
<font><i/><sz val="9"/><color rgb="FF595959"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FF9C0006"/><name val="Arial"/></font>
</fonts>
<fills count="8">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF7B2C2C"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${STYLES.length}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="1" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="6" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="1" fillId="6" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment wrapText="0"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="1" fillId="6" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

function sheetXml(sh) {
  const rows = sh.rows || [];
  const cols = (sh.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = sh.freeze ? `<pane xSplit="${sh.freeze.col || 0}" ySplit="${sh.freeze.row || 0}" topLeftCell="${colName(sh.freeze.col || 0)}${(sh.freeze.row || 0) + 1}" activePane="bottomRight" state="frozen"/>` : '';
  let body = '';
  rows.forEach((row, r) => {
    if (!row || !row.length) { body += `<row r="${r + 1}"/>`; return; }
    let cells = '';
    row.forEach((c, ci) => {
      if (c == null || c === '') return;
      const cell = (typeof c === 'object' && !(c instanceof Date)) ? c : { v: c };
      const ref = colName(ci) + (r + 1);
      const s = SID[cell.s || (typeof cell.v === 'number' ? 'num' : 'text')] || 0;
      if (cell.v == null || cell.v === '') { cells += `<c r="${ref}" s="${s}"/>`; return; }
      if (typeof cell.v === 'number' && isFinite(cell.v)) cells += `<c r="${ref}" s="${s}"><v>${cell.v}</v></c>`;
      else cells += `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    });
    const ht = sh.heights && sh.heights[r] ? ` ht="${sh.heights[r]}" customHeight="1"` : '';
    body += `<row r="${r + 1}"${ht}>${cells}</row>`;
  });
  const merges = (sh.merges || []).length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${merges}</worksheet>`;
}

/** sheets: [{ name, rows, cols?, merges?, freeze? }] -> Buffer */
async function build(sheets) {
  const zip = new JSZip();
  const names = sheets.map((s, i) => String(s.name || ('Sheet' + (i + 1))).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES_XML);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Batch 167: read an .xlsx (for example a SalesIQ operator report export) into { sheetName: rows[][] } of plain strings.
function unesc(t) { return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&'); }
function textOf(xml) { const out = []; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, t) => { out.push(unesc(t)); return ''; }); return out.join(''); }
function colIndex(ref) { let n = 0; for (const ch of String(ref).replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
async function readSheets(buf) {
  const zip = await JSZip.loadAsync(buf);
  const get = (p) => { const f = zip.file(p) || zip.file(p.replace(/^\//, '')); return f ? f.async('string') : Promise.resolve(''); };
  const wb = await get('xl/workbook.xml'); if (!wb) throw new Error('Not an Excel (.xlsx) file');
  const rels = await get('xl/_rels/workbook.xml.rels');
  const target = {}; rels.replace(/<Relationship\b[^>]*>/g, (tag) => { const id = (tag.match(/\bId="([^"]+)"/) || [])[1], t = (tag.match(/\bTarget="([^"]+)"/) || [])[1]; if (id && t) target[id] = t; return ''; });
  const sstXml = await get('xl/sharedStrings.xml'); const sst = [];
  sstXml.replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { sst.push(textOf(si)); return ''; });
  const out = {};
  const sheets = []; wb.replace(/<sheet\b[^>]*>/g, (tag) => { sheets.push({ name: unesc((tag.match(/\bname="([^"]*)"/) || [])[1] || ''), rid: (tag.match(/\br:id="([^"]+)"/) || [])[1] }); return ''; });
  for (const sh of sheets) {
    let t = target[sh.rid] || ''; t = t.startsWith('/') ? t.slice(1) : ('xl/' + t);
    const xml = await get(t); const rows = [];
    xml.replace(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g, (_, inner) => {
      const row = []; let auto = 0;
      String(inner || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, attrs, body) => {
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]; const i = ref ? colIndex(ref) : auto; auto = i + 1;
        const ty = (attrs.match(/\bt="([^"]+)"/) || [])[1]; body = body || '';
        let v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (ty === 's') v = sst[Number(v)]; else if (ty === 'inlineStr') v = textOf(body); else if (v != null) v = unesc(v);
        row[i] = v == null ? '' : String(v); return '';
      });
      for (let k = 0; k < row.length; k++) if (row[k] == null) row[k] = '';
      rows.push(row); return '';
    });
    out[sh.name] = rows;
  }
  return out;
}

module.exports = { build, colName, readSheets };
