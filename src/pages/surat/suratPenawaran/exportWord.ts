
import {
  COLUMN_WIDTHS_PT,
  FILL_COLORS,
  PAGE,
  TABLE_WIDTH_PT,
  buildLayoutRows,
  formatMoneyNumber,
  type Content,
  type LayoutRow,
} from './documentLayout'
import type { QuotationData } from './quotationShared'
import { loadTemplateModel } from './templateModel'

/** Data tambahan untuk gambar tanda tangan dan stempel. */
type QuotationDataWithImages = QuotationData & {
  signatureImage?: string
  stampImage?: string
}

/** Poin -> twip (satuan Word; 1 poin = 20 twip). */
const twip = (points: number) => Math.round(points * 20)
const COLUMN_WIDTHS = COLUMN_WIDTHS_PT.map(twip)

/** Mengubah data URL gambar menjadi Uint8Array untuk docx ImageRun. */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',')

  if (commaIndex === -1) {
    throw new Error('Format gambar tidak valid.')
  }

  const header = dataUrl.slice(0, commaIndex)
  const base64 = dataUrl.slice(commaIndex + 1)

  if (!header.includes('base64')) {
    throw new Error('Data gambar harus dalam format base64.')
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export async function createQuotationWord(
  inputData: QuotationData,
): Promise<Blob> {
  const data = inputData as QuotationDataWithImages

  const [docx, model] = await Promise.all([
    import('docx'),
    loadTemplateModel(),
  ])

  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    HeightRule,
    ImageRun,
    LineRuleType,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    Tab,
    TabStopType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = docx

  const none = {
    style: BorderStyle.NONE,
    size: 0,
    color: 'FFFFFF',
  }

  const noBorders = {
    top: none,
    bottom: none,
    left: none,
    right: none,
  }

  const noTableBorders = {
    ...noBorders,
    insideHorizontal: none,
    insideVertical: none,
  }

  const thin = {
    style: BorderStyle.SINGLE,
    size: 6,
    color: '000000',
  }

  const double = {
    style: BorderStyle.DOUBLE,
    size: 6,
    color: '000000',
  }

  const alignments = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  }

  const verticalAlign = {
    top: VerticalAlign.TOP,
    center: VerticalAlign.CENTER,
    bottom: VerticalAlign.BOTTOM,
  }

  const paragraphs = (
    content: Content | undefined,
    row: LayoutRow,
    cellWidth: number,
  ) => {
    if (!content) {
      return [
        new Paragraph({
          run: { size: row.height <= 14.5 ? 20 : 24 },
          children: [],
        }),
      ]
    }

    if (content.type === 'money') {
      return [
        new Paragraph({
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: cellWidth - 160,
            },
          ],
          children: [
            new TextRun({
              text: 'Rp',
              size: content.size * 2,
              bold: content.bold,
            }),
            new TextRun({
              size: content.size * 2,
              bold: content.bold,
              children: [
                new Tab(),
                formatMoneyNumber(content.value),
              ],
            }),
          ],
        }),
      ]
    }

    const lowerText = content.text.toLowerCase()
    if (
      (lowerText.includes('[signature]') || lowerText.includes('[signatur')) &&
      data.signatureImage
    ) {
      return [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new ImageRun({
              type: 'png',
              data: dataUrlToUint8Array(data.signatureImage),
              transformation: { width: 130, height: 65 },
            }),
          ],
        }),
      ]
    }
    if (
      (lowerText.includes('[company stamp]') ||
        lowerText.includes('[company-stamp]') ||
        lowerText.includes('[stamp]')) &&
      data.stampImage
    ) {
      return [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new ImageRun({
              type: 'png',
              data: dataUrlToUint8Array(data.stampImage),
              transformation: { width: 90, height: 90 },
            }),
          ],
        }),
      ]
    }

    return content.text.split(/\r?\n/).map(
      (line) =>
        new Paragraph({
          spacing: row.exactHeight
            ? {
                line: twip(row.height),
                lineRule: LineRuleType.EXACT,
              }
            : undefined,
          alignment: alignments[content.align ?? 'left'],
          run: { size: content.size * 2 },
          children: [
            new TextRun({
              text: line,
              size: content.size * 2,
              bold: content.bold,
              underline: content.underline ? {} : undefined,
            }),
          ],
        }),
    )
  }

  const rows = buildLayoutRows(data, model).map((row) => {
    let column = 0

    const cells = row.cells.map((cell) => {
      const width = COLUMN_WIDTHS.slice(
        column,
        column + cell.span,
      ).reduce((sum, value) => sum + value, 0)

      const narrow = column === 0 && cell.span === 1
      const money = cell.content?.type === 'money'

      column += cell.span

      const side = money ? 80 : narrow ? 0 : 40

      return new TableCell({
        columnSpan: cell.span,
        width: {
          size: width,
          type: WidthType.DXA,
        },
        verticalAlign: verticalAlign[row.vAlign ?? 'bottom'],
        margins: {
          top: 0,
          bottom: 0,
          left: side,
          right: side,
        },
        shading: row.fill
          ? {
              type: ShadingType.CLEAR,
              fill: FILL_COLORS[row.fill],
              color: 'auto',
            }
          : undefined,
        borders: {
          ...noBorders,
          ...(row.border === 'header'
            ? { top: thin, bottom: thin }
            : {}),
          ...(row.border === 'double'
            ? { bottom: double }
            : {}),
        },
        children: paragraphs(cell.content, row, width),
      })
    })

    return new TableRow({
      cantSplit: true,
      height: {
        value: twip(row.height),
        rule: row.exactHeight
          ? HeightRule.EXACT
          : HeightRule.ATLEAST,
      },
      children: cells,
    })
  })

  const bodyTable = new Table({
    width: {
      size: twip(TABLE_WIDTH_PT),
      type: WidthType.DXA,
    },
    columnWidths: COLUMN_WIDTHS,
    layout: TableLayoutType.FIXED,
    borders: noTableBorders,
    rows,
  })

  // ----- Header: logo kiri, informasi perusahaan kanan -----
  const contentWidth = twip(
    PAGE.width - PAGE.left - PAGE.right,
  )

  const logoWidth = twip(70)

  const logo = model.logo
    ? new ImageRun({
        type: 'png',
        data: model.logo,
        transformation: {
          width: (67.5 * 4) / 3,
          height: (56.5 * 4) / 3,
        },
      })
    : null

  const header = new Header({
    children: [
      new Table({
        width: {
          size: contentWidth,
          type: WidthType.DXA,
        },
        columnWidths: [
          logoWidth,
          contentWidth - logoWidth,
        ],
        layout: TableLayoutType.FIXED,
        borders: noTableBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: {
                  size: logoWidth,
                  type: WidthType.DXA,
                },
                margins: {
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                },
                borders: noBorders,
                children: [
                  new Paragraph({
                    run: { size: 2 },
                    children: logo ? [logo] : [],
                  }),
                ],
              }),

              new TableCell({
                width: {
                  size: contentWidth - logoWidth,
                  type: WidthType.DXA,
                },
                margins: {
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                },
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: model.company,
                        bold: true,
                        size: 28,
                      }),
                    ],
                  }),

                  ...model.addressLines.map(
                    (line) =>
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: line,
                            size: 20,
                          }),
                        ],
                      }),
                  ),
                ],
              }),
            ],
          }),
        ],
      }),

      new Paragraph({
        spacing: {
          before: 50,
          after: 0,
          line: 45,
          lineRule: LineRuleType.EXACT,
        },
        indent: {
          right: contentWidth - twip(TABLE_WIDTH_PT),
        },
        border: {
          bottom: {
            ...double,
            space: 0,
          },
        },
        run: { size: 2 },
        children: [],
      }),
    ],
  })

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            size: 22,
            children: [
              'Page ',
              PageNumber.CURRENT,
              ' of ',
              PageNumber.TOTAL_PAGES,
            ],
          }),
        ],
      }),
    ],
  })

  const document = new Document({
    creator: data.senderCompany,
    title: `Surat Penawaran ${data.number}`,
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 24,
          },
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              line: 240,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: twip(PAGE.width),
              height: twip(PAGE.height),
            },
            margin: {
              top: twip(PAGE.top + PAGE.titleRule),
              bottom: twip(PAGE.bottom),
              left: twip(PAGE.left),
              right: twip(PAGE.right),
              header: twip(PAGE.header),
              footer: twip(PAGE.footer),
            },
          },
        },
        headers: {
          default: header,
        },
        footers: {
          default: footer,
        },
        children: [
          bodyTable,
        ],
      },
    ],
  })

  return Packer.toBlob(document)
}