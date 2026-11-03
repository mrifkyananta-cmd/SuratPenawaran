const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createFixtures() {
  const dir = __dirname;

  // 1. Valid DOCX with placeholders
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>KOP SURAT RESMI PERUSAHAAN</w:t></w:r></w:p>
    <w:p><w:r><w:t>Nomor: {{nomor_surat}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tanggal: {{tanggal_surat}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Perihal: {{perihal}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Kepada Yth: {{nama_penerima}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Dengan hormat,</w:t></w:r></w:p>
    <w:p><w:r><w:t>Rincian barang/pesanan: {{items}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Hormat kami,</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);

  const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(path.join(dir, 'template-spb.docx'), docxBuffer);
  console.log('Created template-spb.docx');

  // 2. Valid PDF
  const pdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n',
    'utf-8'
  );
  fs.writeFileSync(path.join(dir, 'template-penawaran.pdf'), pdfBuffer);
  console.log('Created template-penawaran.pdf');

  // 3. Invalid format (.txt)
  fs.writeFileSync(path.join(dir, 'template-invalid.txt'), 'This is a plain text file, not allowed');
  console.log('Created template-invalid.txt');

  // 4. Corrupted file (.docx extension with plain text content)
  fs.writeFileSync(path.join(dir, 'template-corrupt.docx'), 'Fake DOCX content without PK magic bytes');
  console.log('Created template-corrupt.docx');
}

createFixtures().catch(console.error);
