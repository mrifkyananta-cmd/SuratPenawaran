import JSZip from 'jszip'
import {
  calculateTotals,
  getPrintedItems,
  type QuotationData,
  type QuotationItem,
} from './quotationShared'
import { readTemplateBytes } from './templateSource'
import { countLines } from './textMetrics'
import { COLUMN_WIDTHS_PT, TABLE_WIDTH_PT } from './documentLayout'
import {
  getIntroduction,
  loadTemplateModel,
  validityText,
} from './templateModel'

export type { QuotationData, QuotationItem }

const SHEET_NS =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

function parseXml(source: string): XMLDocument {
  const xml = new DOMParser().parseFromString(source, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) {
    throw new Error('Template Excel tidak dapat dibaca.')
  }
  return xml
}

function xmlElement(xml: XMLDocument, name: string): Element {
  return xml.createElementNS(SHEET_NS, name)
}

function cell(xml: XMLDocument, address: string): Element {
  const cells = xml.getElementsByTagNameNS(SHEET_NS, 'c')
  for (const candidate of Array.from(cells)) {
    if (candidate.getAttribute('r') === address) return candidate
  }
  throw new Error(`Sel ${address} tidak ditemukan di template.`)
}

function clearCell(target: Element): void {
  for (const child of Array.from(target.children)) {
    if (['v', 'f', 'is'].includes(child.localName)) {
      target.removeChild(child)
    }
  }
}

function setText(
  xml: XMLDocument,
  address: string,
  value: string,
): void {
  const target = cell(xml, address)
  clearCell(target)
  target.setAttribute('t', 'inlineStr')

  const inline = xmlElement(xml, 'is')
  const text = xmlElement(xml, 't')
  text.setAttributeNS(
    'http://www.w3.org/XML/1998/namespace',
    'xml:space',
    'preserve',
  )
  text.textContent = value
  inline.appendChild(text)
  target.appendChild(inline)
}

function setNumber(
  xml: XMLDocument,
  address: string,
  value: number,
  formula?: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Angka untuk ${address} tidak valid.`)
  }

  const target = cell(xml, address)
  clearCell(target)
  target.setAttribute('t', 'n')

  if (formula) {
    const expression = xmlElement(xml, 'f')
    expression.textContent = formula
    target.appendChild(expression)
  }

  const cached = xmlElement(xml, 'v')
  cached.textContent = String(value)
  target.appendChild(cached)
}

/** Lebar teks deskripsi dan paragraf pembuka, dikurangi padding sel. */
const DESCRIPTION_WIDTH_PT = COLUMN_WIDTHS_PT[1] - 4
const INTRODUCTION_WIDTH_PT = TABLE_WIDTH_PT - 4
const TEXT_SIZE_PT = 12
const LINE_HEIGHT = 15.5

/** Batas tinggi baris Excel adalah 409 pt. */
const MAX_LINES = 26

/** Gandakan gaya sel dengan perataan atas dan opsi pembungkus teks. */
function alignedStyle(
  styles: XMLDocument,
  base: number,
  wrapText: boolean,
  cache: Map<string, number>,
): number {
  const key = `${base}:${wrapText}`
  const known = cache.get(key)
  if (known !== undefined) return known

  const cellXfs = styles.getElementsByTagNameNS(
    SHEET_NS,
    'cellXfs',
  )[0]

  if (!cellXfs) {
    throw new Error('Daftar gaya template Excel tidak lengkap.')
  }

  const formats = Array.from(cellXfs.children)
  const source = formats[base]

  if (!source) {
    throw new Error('Gaya sel template Excel tidak ditemukan.')
  }

  const clone = source.cloneNode(true) as Element
  clone.setAttribute('applyAlignment', '1')

  let alignment = Array.from(clone.children).find(
    (child) => child.localName === 'alignment',
  )

  if (!alignment) {
    alignment = xmlElement(styles, 'alignment')
    clone.appendChild(alignment)
  }

  alignment.setAttribute('vertical', 'top')

  if (wrapText) {
    alignment.setAttribute('wrapText', '1')
  }

  cellXfs.appendChild(clone)
  cellXfs.setAttribute('count', String(formats.length + 1))
  cache.set(key, formats.length)

  return formats.length
}

function applyStyle(
  xml: XMLDocument,
  styles: XMLDocument,
  address: string,
  wrapText: boolean,
  cache: Map<string, number>,
): void {
  const target = cell(xml, address)
  const base = Number(target.getAttribute('s') ?? 0)

  target.setAttribute(
    's',
    String(alignedStyle(styles, base, wrapText, cache)),
  )
}

function setRowLines(
  xml: XMLDocument,
  rowNumber: number,
  lines: number,
): void {
  const rows = xml.getElementsByTagNameNS(SHEET_NS, 'row')
  const target = Array.from(rows).find(
    (row) => row.getAttribute('r') === String(rowNumber),
  )

  if (!target) {
    throw new Error(`Baris ${rowNumber} tidak ditemukan di template.`)
  }

  target.setAttribute(
    'ht',
    String(Math.min(Math.max(lines, 1), MAX_LINES) * LINE_HEIGHT),
  )
  target.setAttribute('customHeight', '1')
}

function mergeCells(xml: XMLDocument, range: string): void {
  let container = xml.getElementsByTagNameNS(
    SHEET_NS,
    'mergeCells',
  )[0]

  if (!container) {
    container = xmlElement(xml, 'mergeCells')
    const sheetData = xml.getElementsByTagNameNS(
      SHEET_NS,
      'sheetData',
    )[0]
    sheetData.parentNode?.insertBefore(
      container,
      sheetData.nextSibling,
    )
  }

  const exists = Array.from(container.children).some(
    (node) => node.getAttribute('ref') === range,
  )

  if (!exists) {
    const merge = xmlElement(xml, 'mergeCell')
    merge.setAttribute('ref', range)
    container.appendChild(merge)
  }

  container.setAttribute('count', String(container.children.length))
}

const FIRST_ITEM_ROW = 13
/** Baris rincian terakhir pada template. */
const TEMPLATE_LAST_ITEM_ROW = 14

function rowElements(xml: XMLDocument): Element[] {
  return Array.from(xml.getElementsByTagNameNS(SHEET_NS, 'row'))
}

function findRow(xml: XMLDocument, rowNumber: number): Element {
  const target = rowElements(xml).find(
    (row) => row.getAttribute('r') === String(rowNumber),
  )

  if (!target) {
    throw new Error(`Baris ${rowNumber} tidak ditemukan di template.`)
  }

  return target
}

/** Pindahkan baris dan alamat semua selnya ke nomor baris baru. */
function renumberRow(row: Element, newNumber: number): void {
  row.setAttribute('r', String(newNumber))

  for (const cellElement of Array.from(row.children)) {
    const address = cellElement.getAttribute('r')

    if (address) {
      cellElement.setAttribute(
        'r',
        address.replace(/\d+$/, String(newNumber)),
      )
    }
  }
}

/**
 * Sesuaikan jumlah baris rincian dengan jumlah produk.
 * Template awal mempunyai dua baris rincian, yaitu baris 13 dan 14.
 */
function resizeItemRows(xml: XMLDocument, count: number): number {
  const delta =
    count - (TEMPLATE_LAST_ITEM_ROW - FIRST_ITEM_ROW + 1)

  const middleRow = findRow(xml, FIRST_ITEM_ROW)
  const lastRow = findRow(xml, TEMPLATE_LAST_ITEM_ROW)
  const middleTemplate = middleRow.cloneNode(true) as Element
  const lastTemplate = lastRow.cloneNode(true) as Element
  const parent = middleRow.parentNode as Element

  parent.removeChild(middleRow)
  parent.removeChild(lastRow)

  // Geser baris di bawah rincian.
  for (const row of rowElements(xml)) {
    const number = Number(row.getAttribute('r'))

    if (number > TEMPLATE_LAST_ITEM_ROW) {
      renumberRow(row, number + delta)
    }
  }

  // Sisipkan baris rincian sesuai jumlah produk.
  const anchor =
    rowElements(xml).find(
      (row) => Number(row.getAttribute('r')) > FIRST_ITEM_ROW,
    ) ?? null

  for (let index = 0; index < count; index++) {
    const template =
      index === count - 1 ? lastTemplate : middleTemplate
    const row = template.cloneNode(true) as Element

    renumberRow(row, FIRST_ITEM_ROW + index)
    parent.insertBefore(row, anchor)
  }

  return delta
}

/** Perbarui metadata lembar kerja setelah baris bergeser. */
function updateSheetMetadata(
  xml: XMLDocument,
  delta: number,
): void {
  const dimension = xml.getElementsByTagNameNS(
    SHEET_NS,
    'dimension',
  )[0]
  const ref = dimension?.getAttribute('ref')

  if (dimension && ref) {
    dimension.setAttribute(
      'ref',
      ref.replace(/(\d+)$/, (last) =>
        String(Number(last) + delta),
      ),
    )
  }

  // Buka lembar kerja dari bagian atas.
  const view = xml.getElementsByTagNameNS(
    SHEET_NS,
    'sheetView',
  )[0]
  view?.removeAttribute('topLeftCell')

  const selection = xml.getElementsByTagNameNS(
    SHEET_NS,
    'selection',
  )[0]

  selection?.setAttribute('activeCell', 'A1')
  selection?.setAttribute('sqref', 'A1')
}

/** Hapus calcChain lama karena referensi rumus dapat berubah. */
async function dropCalcChain(zip: JSZip): Promise<void> {
  zip.remove('xl/calcChain.xml')

  const types = zip.file('[Content_Types].xml')

  if (types) {
    const source = await types.async('string')

    zip.file(
      '[Content_Types].xml',
      source.replace(
        /<Override\b[^>]*calcChain[^>]*\/>/g,
        '',
      ),
    )
  }

  const rels = zip.file('xl/_rels/workbook.xml.rels')

  if (rels) {
    const source = await rels.async('string')

    zip.file(
      'xl/_rels/workbook.xml.rels',
      source.replace(
        /<Relationship\b[^>]*calcChain[^>]*\/>/g,
        '',
      ),
    )
  }
}

/** Isi template Excel bawaan; gaya, logo, dan syarat tetap dari template. */
export async function createQuotationExcel(
  data: QuotationData & { ppnAmount?: number },
): Promise<Blob> {
  const items = getPrintedItems(data)

  if (items.length === 0) {
    throw new Error('Isi minimal satu produk di tabel rincian.')
  }

  const [templateBytes, model] = await Promise.all([
    readTemplateBytes(),
    loadTemplateModel(),
  ])

  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(templateBytes)
  } catch {
    throw new Error('File template Excel tidak valid.')
  }

  const sheetFile = zip.file('xl/worksheets/sheet1.xml')
  const workbookFile = zip.file('xl/workbook.xml')
  const stylesFile = zip.file('xl/styles.xml')

  if (!sheetFile || !workbookFile || !stylesFile) {
    throw new Error('Isi template Excel tidak lengkap.')
  }

  const xml = parseXml(await sheetFile.async('string'))
  const styles = parseXml(await stylesFile.async('string'))
  const styleCache = new Map<string, number>()

  // Bagian atas surat.
  setText(xml, 'A3', data.recipient ?? '')
  setText(xml, 'A4', data.address ?? '')
  setText(xml, 'A5', data.city ?? '')
  setText(xml, 'F2', `: ${data.date ?? ''}`)
  setText(xml, 'F3', `: ${data.number ?? ''}`)
  setText(xml, 'F4', validityText(data, model))

  // Paragraf pembuka.
  const introduction = getIntroduction(data, model)

  setText(xml, 'A9', introduction)
  mergeCells(xml, 'A9:F9')
  applyStyle(xml, styles, 'A9', true, styleCache)

  setRowLines(
    xml,
    9,
    countLines(
      introduction,
      TEXT_SIZE_PT,
      INTRODUCTION_WIDTH_PT,
    ),
  )

  // Buat baris rincian sebanyak jumlah produk.
  const delta = resizeItemRows(xml, items.length)
  const lastItemRow = FIRST_ITEM_ROW + items.length - 1
  const totalRow = 15 + delta
  const taxRow = 16 + delta
  const grandRow = 17 + delta

  items.forEach((item: QuotationItem, index) => {
    const row = FIRST_ITEM_ROW + index
    const amount = item.quantity * item.unitPrice

    setNumber(xml, `A${row}`, index + 1)
    setText(xml, `B${row}`, item.description ?? '')
    setNumber(xml, `C${row}`, item.quantity)
    setText(xml, `D${row}`, item.unit ?? '')
    setNumber(xml, `E${row}`, item.unitPrice)
    setNumber(
      xml,
      `F${row}`,
      amount,
      `C${row}*E${row}`,
    )

    // Bungkus teks deskripsi dan sesuaikan tinggi baris.
    const lines = countLines(
      item.description ?? '',
      TEXT_SIZE_PT,
      DESCRIPTION_WIDTH_PT,
    )

    if (lines > 1) {
      applyStyle(xml, styles, `B${row}`, true, styleCache)

      for (const column of ['A', 'C', 'D', 'E', 'F']) {
        applyStyle(
          xml,
          styles,
          `${column}${row}`,
          false,
          styleCache,
        )
      }

      setRowLines(xml, row, lines)
    }
  })

  const { subtotal, tax, grandTotal } = calculateTotals(items, data)

  setNumber(
    xml,
    `F${totalRow}`,
    subtotal,
    `SUM(F${FIRST_ITEM_ROW}:F${lastItemRow})`,
  )

  // PPN manual: tidak memakai rumus persentase tetap.
  setNumber(xml, `F${taxRow}`, tax)

  setNumber(
    xml,
    `F${grandRow}`,
    grandTotal,
    `SUM(F${totalRow}:F${taxRow})`,
  )

  // Informasi perusahaan dan penandatangan.
  setText(xml, `A${29 + delta}`, data.senderCompany ?? '')
  setText(xml, `A${36 + delta}`, data.signer ?? '')
  setText(xml, `A${37 + delta}`, data.position ?? '')
  setText(xml, `A${39 + delta}`, data.email ?? '')
  setText(xml, `A${40 + delta}`, data.phone ?? '')

  updateSheetMetadata(xml, delta)

  zip.file(
    'xl/worksheets/sheet1.xml',
    new XMLSerializer().serializeToString(xml),
  )

  zip.file(
    'xl/styles.xml',
    new XMLSerializer().serializeToString(styles),
  )

  await dropCalcChain(zip)

  const workbook = parseXml(await workbookFile.async('string'))

  let calculation = workbook.getElementsByTagNameNS(
    SHEET_NS,
    'calcPr',
  )[0]

  if (!calculation) {
    calculation = xmlElement(workbook, 'calcPr')
    workbook.documentElement.appendChild(calculation)
  }

  calculation.setAttribute('fullCalcOnLoad', '1')
  calculation.setAttribute('forceFullCalc', '1')

  zip.file(
    'xl/workbook.xml',
    new XMLSerializer().serializeToString(workbook),
  )

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

