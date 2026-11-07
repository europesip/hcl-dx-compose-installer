// The webinar script in Word: renders the document model of script.js with docx.
import {Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink,
        ShadingType, BorderStyle, AlignmentType, PageBreak, Footer, Header, PageNumber, TableOfContents} from "docx";
import {buildScript} from "./script.js";

const MONO = "Consolas", INK = "0B1B3A", BLUE = "0040FF", PINK = "FF0A6C", SOFT = "F2F5FF", LINE = "D6DDF5", GREY = "5B6785";
const TONE = {ok: "EAF7EE", warn: "FFF4E5", error: "FDECEC", info: "EEF2FF"};
const run = (text, o = {}) => new TextRun({text, ...o});
const para = (text, o = {}) => new Paragraph({spacing: {after: 120}, ...o.p, children: [run(text, o.run)]});
function codeBlock(text, small){
  const lines = String(text).replace(/\t/g, "  ").split("\n");
  return lines.map((l, i) => new Paragraph({
    shading: {type: ShadingType.CLEAR, fill: SOFT, color: "auto"}, keepLines: true,
    spacing: {before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240},
    indent: {left: 120, right: 120}, children: [run(l || " ", {font: MONO, size: small ? 15 : 17})]}));
}
function table(head, rows, widths, o = {}){
  const border = {style: BorderStyle.SINGLE, size: 4, color: LINE};
  const cell = (text, h, j) => new TableCell({
    shading: h ? {type: ShadingType.CLEAR, fill: BLUE, color: "auto"} : undefined, margins: {top: 60, bottom: 60, left: 100, right: 100},
    width: widths[j] ? {size: widths[j], type: WidthType.PERCENTAGE} : undefined,
    children: [new Paragraph({children: [run(String(text), {bold: h || (o.noHead && j === 0), color: h ? "FFFFFF" : INK, font: o.mono && !h ? MONO : undefined, size: o.mono && !h ? 16 : 20})]})]});
  const all = o.noHead ? rows : [head, ...rows];
  return new Table({width: {size: 100, type: WidthType.PERCENTAGE},
    borders: {top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border},
    rows: all.map((r, i) => new TableRow({tableHeader: !o.noHead && i === 0, children: r.map((c, j) => cell(c, !o.noHead && i === 0, j))}))});
}

export async function buildWord(gen, lang, summaryRows, {mask = true, as = "blob", logos = {}} = {}){
  const doc = buildScript(gen, lang, summaryRows, {mask});
  const body = [];
  const logo = (data, w, h) => data ? new ImageRun({type: "png", data, transformation: {width: w, height: h}}) : null;
  for (const b of doc.blocks) {
    if (b.t === "cover") {
      const imgs = [logo(logos.europesip, 230, 34), logos.europesip && logos.hcl ? run("      ") : null, logo(logos.hcl, 210, 26)].filter(Boolean);
      if (imgs.length) body.push(new Paragraph({spacing: {before: 600, after: 300}, children: imgs}));
      body.push(new Paragraph({spacing: {after: 700}, border: {bottom: {style: BorderStyle.SINGLE, size: 36, color: PINK, space: 1}}, children: [run(" ")]}));
      body.push(new Paragraph({spacing: {before: imgs.length ? 0 : 1600, after: 120}, children: [run("HCL DX WEBINAR", {bold: true, color: PINK, size: 22, characterSpacing: 40})]}));
      body.push(new Paragraph({spacing: {after: 160}, children: [run(b.title, {bold: true, size: 64, color: INK})]}));
      body.push(new Paragraph({spacing: {after: 200}, children: [run(b.subtitle, {size: 34, color: BLUE})]}));
      body.push(new Paragraph({spacing: {after: 120}, children: [run(b.live, {bold: true, size: 28, color: INK})]}));
      body.push(new Paragraph({spacing: {after: 900}, children: [run(`${b.host} · ${b.generated}`, {color: GREY})]}));
      body.push(new Paragraph({shading: {type: ShadingType.CLEAR, fill: TONE[b.noteTone], color: "auto"}, indent: {left: 120, right: 120}, spacing: {after: 200}, children: [run(b.note, {bold: true})]}));
      body.push(new Paragraph({children: [new PageBreak()]}));
    } else if (b.t === "toc") {
      body.push(new Paragraph({heading: HeadingLevel.HEADING_1, children: [run(b.title)]}));
      body.push(new TableOfContents(b.title, {hyperlink: true, headingStyleRange: "1-1"}));
      body.push(para(b.note, {run: {italics: true, color: GREY}}));
      body.push(new Paragraph({children: [new PageBreak()]}));
    } else if (b.t === "h1" || b.t === "h2") {
      body.push(new Paragraph({heading: b.t === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, keepNext: true, children: [run(b.text)]}));
    } else if (b.t === "h3") {
      body.push(new Paragraph({spacing: {before: 200, after: 80}, keepNext: true, children: [run(b.text, {bold: true, color: INK, size: 23}), ...(b.note ? [run(`  (${b.note})`, {italics: true, color: GREY})] : [])]}));
    } else if (b.t === "p") {
      body.push(para(b.text, {run: b.tone === "muted" ? {color: GREY, size: 19} : b.tone === "key" ? {bold: true, color: PINK} : {}}));
    } else if (b.t === "bullets") {
      b.items.forEach((x, i) => body.push(new Paragraph({spacing: {after: 80}, indent: {left: 360, hanging: 240}, children: [run(b.numbered ? `${i + 1}.  ` : "•  ", {color: BLUE, bold: true}), run(x)]})));
    } else if (b.t === "code") {
      if (b.title) body.push(para(b.title, {run: {bold: true, color: INK}, p: {keepNext: true, spacing: {before: 120, after: 60}}}));
      body.push(...codeBlock(b.text, b.small));
    } else if (b.t === "table") {
      if (b.title) body.push(para(b.title, {run: {bold: true}, p: {keepNext: true}}));
      body.push(table(b.head, b.rows, b.widths, b));
      body.push(para(""));
    } else if (b.t === "callout") {
      body.push(new Paragraph({shading: {type: ShadingType.CLEAR, fill: TONE[b.tone] || TONE.info, color: "auto"}, indent: {left: 120, right: 120}, spacing: {before: 120, after: 200}, children: [run(b.text, {bold: true})]}));
    } else if (b.t === "slide") {
      body.push(new Paragraph({shading: {type: ShadingType.CLEAR, fill: "EEF2FF", color: "auto"}, indent: {left: 120, right: 120}, spacing: {after: 160}, children: [run("▶ " + b.text, {bold: true, color: BLUE})]}));
    } else if (b.t === "links") {
      body.push(new Paragraph({spacing: {after: 160}, keepLines: true, children: [
        ...(b.title ? [run(`📖 ${b.title}: `, {bold: true, color: INK})] : []),
        ...b.items.flatMap(([n, u], i) => [...(i ? [run("  ·  ", {color: GREY})] : []),
          new ExternalHyperlink({link: u, children: [run(n, {color: BLUE, underline: {}})]})])]}));
      if (!b.title) body.push(para(b.items.map(([, u]) => u).join("  ·  "), {run: {color: GREY, size: 18}}));
    } else if (b.t === "image") {
      const img = (logos.shots || {})[b.key];
      if (img) {
        body.push(new Paragraph({alignment: AlignmentType.CENTER, keepNext: true, spacing: {before: 120, after: 60},
          children: [new ImageRun({type: "jpg", data: img, transformation: {width: 560, height: Math.round(560 * 820 / 1280)}})]}));
        body.push(new Paragraph({alignment: AlignmentType.CENTER, spacing: {after: 200}, children: [run(b.caption, {italics: true, color: GREY, size: 18})]}));
      }
    } else if (b.t === "break") {
      body.push(new Paragraph({children: [new PageBreak()]}));
    }
  }
  const header = new Header({children: [new Paragraph({alignment: AlignmentType.RIGHT, children: logos.europesip ? [logo(logos.europesip, 110, 16)] : [run("EUROPESIP", {size: 16, color: GREY})]})]});
  const document = new Document({
    creator: "HCL DX Compose Installer · EUROPESIP", title: doc.title, description: "https://" + doc.host, features: {updateFields: true},
    styles: {default: {document: {run: {font: "Calibri", size: 21, color: INK}}},
      paragraphStyles: [
        {id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: {size: 36, bold: true, color: BLUE}, paragraph: {spacing: {before: 360, after: 160}}},
        {id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: {size: 26, bold: true, color: INK}, paragraph: {spacing: {before: 240, after: 100}}}]},
    sections: [{properties: {page: {margin: {top: 1000, bottom: 1000, left: 1000, right: 1000}}}, headers: {default: header},
      footers: {default: new Footer({children: [new Paragraph({alignment: AlignmentType.CENTER, children: [
        run(`${doc.footer}${doc.page} `, {size: 16, color: GREY}), new TextRun({children: [PageNumber.CURRENT], size: 16, color: GREY})]})]})},
      children: body}],
  });
  return as === "buffer" ? Packer.toBuffer(document) : Packer.toBlob(document);
}
