import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowRight, FileCheck, Search, Upload, Download, Trash2, type LucideIcon } from 'lucide-react'
import { LETTER_TEMPLATES, getTemplateMetaForType } from '../templatesData'
import { getDocumentCategoryStyle } from '@/utils/semanticTokens'
import type { UploadedTemplateRecord } from './UploadTemplateModal'

interface CreateNewSuratModalProps {
  isOpen: boolean
  onClose: () => void
  uploadedTemplates?: UploadedTemplateRecord[]
  onOpenUploadModal?: () => void
  onDownloadTemplate?: (tpl: UploadedTemplateRecord) => void
  onDeleteTemplate?: (tpl: UploadedTemplateRecord) => void
  initialCategory?: string
  initialSelectedId?: string
}

interface BaseModalTemplateItem {
  id: string
  type: string
  typeName: string
  name: string
  slug: string
  shortDesc: string
  longDesc: string
  icon: LucideIcon
  colorClass: string
  badgeBg: string
  supportedFormats: Array<'pdf' | 'xlsx' | 'docx'>
  previewSample: {
    title: string
    parties: string
    keyPoints: string[]
  }
}

export type ModalTemplateItem =
  | (BaseModalTemplateItem & { isCustom: false })
  | (BaseModalTemplateItem & {
      isCustom: true
      fileFormat: string
      originalFilename: string
      fileSize: number
      createdAt: string
      rawRecord: UploadedTemplateRecord
    })

const CATEGORY_TABS = [
  { id: 'ALL', label: 'Semua Kategori' },
  { id: 'SURAT_PENAWARAN', label: 'Surat Penawaran' },
  { id: 'SURAT_PERMINTAAN_BARANG', label: 'Surat Permintaan Barang' },
  { id: 'SURAT_PESANAN', label: 'Surat Pesanan' },
  { id: 'SURAT_PERJANJIAN_JUAL_BELI', label: 'Surat Perjanjian Jual Beli' },
]

export default function CreateNewSuratModal({
  isOpen,
  onClose,
  uploadedTemplates = [],
  onOpenUploadModal,
  onDownloadTemplate,
  onDeleteTemplate,
  initialCategory,
  initialSelectedId,
}: CreateNewSuratModalProps) {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState<string>(LETTER_TEMPLATES[0].id)

  useEffect(() => {
    if (initialCategory) {
      setCategoryFilter(initialCategory)
    }
  }, [initialCategory])

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId)
    }
  }, [initialSelectedId])

  const allItems: ModalTemplateItem[] = useMemo(() => {
    const builtin: ModalTemplateItem[] = LETTER_TEMPLATES.map((t) => ({
      ...t,
      typeName: t.name,
      isCustom: false,
    }))

    const custom: ModalTemplateItem[] = uploadedTemplates.map((tpl) => {
      const meta = getTemplateMetaForType(tpl.letterType)
      const format = tpl.fileFormat.toLowerCase() as 'pdf' | 'xlsx' | 'docx'
      return {
        isCustom: true,
        id: tpl.id,
        type: tpl.letterType,
        typeName: meta.typeName,
        name: tpl.name,
        slug: meta.slug,
        shortDesc: tpl.description || `Template kustom berbasis file ${tpl.originalFilename}.`,
        longDesc:
          tpl.description ||
          `Template kustom resmi yang diunggah oleh pengguna untuk kategori ${meta.typeName}. File template: ${tpl.originalFilename} (${(tpl.fileSize / 1024).toFixed(1)} KB).`,
        icon: meta.icon,
        colorClass: meta.colorClass,
        badgeBg: meta.badgeBg,
        supportedFormats: [format],
        fileFormat: tpl.fileFormat,
        originalFilename: tpl.originalFilename,
        fileSize: tpl.fileSize,
        createdAt: tpl.createdAt,
        rawRecord: tpl,
        previewSample: {
          title: `Template ${meta.typeName}: ${tpl.name}`,
          parties: `Kategori: ${meta.typeName} | Format: ${tpl.fileFormat.toUpperCase()}`,
          keyPoints: [
            `File sumber: ${tpl.originalFilename}`,
            format === 'docx'
              ? 'Mendukung pemetaan placeholder dinamis ({{nomor_surat}}, {{nama_penerima}}, dll.)'
              : format === 'xlsx'
                ? 'Model format spreadsheet terstruktur'
                : 'Dokumen referensi resmi template',
            'Dapat diedit dan diunduh langsung melalui formulir',
          ],
        },
      }
    })

    return [...builtin, ...custom]
  }, [uploadedTemplates])

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.typeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.shortDesc.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCat = categoryFilter === 'ALL' || item.type === categoryFilter

      return matchesSearch && matchesCat
    })
  }, [allItems, searchTerm, categoryFilter])

  const currentSelection = useMemo(() => {
    return (
      filteredItems.find((it) => it.id === selectedId) ||
      filteredItems[0] ||
      allItems.find((it) => it.id === selectedId) ||
      allItems[0] ||
      null
    )
  }, [allItems, filteredItems, selectedId])

  if (!isOpen) return null

  const handleUseTemplate = (item: ModalTemplateItem) => {
    onClose()
    if (item.isCustom) {
      navigate(`/quotation/${item.slug}?mode=new&templateId=${item.id}`)
    } else {
      navigate(`/quotation/${item.slug}?mode=new`)
    }
  }

  return (
    <div
      id="modal-pilih-template"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-16 phones:p-12"
    >
      <div className="flex max-h-[92vh] w-full max-w-[112rem] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-xl">
        {/* Header Modal */}
        <div className="flex flex-wrap items-center justify-between gap-12 border-b border-[#E2E8F0] px-24 py-16 phones:px-16 phones:py-12">
          <div className="flex min-w-0 items-center gap-12">
            <span className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center text-[#0000FF]">
              <FileCheck size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="modal-title" className="text-[1.9rem] font-semibold leading-[1.35] text-[#000000]">
                Pilih Template Surat
              </h2>
              <p className="mt-4 text-[1.35rem] font-normal leading-[1.5] text-[#000000]">
                Pilih template bawaan resmi atau template kustom untuk membuat dokumen baru.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-10">
            {onOpenUploadModal && (
              <button
                type="button"
                id="btn-tambah-template"
                onClick={() => {
                  onOpenUploadModal()
                }}
                className="inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-8 text-[1.35rem] font-semibold leading-[1.3] text-white shadow-sm transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
              >
                <Upload size={16} className="text-white" />
                <span>+ Tambah Template</span>
              </button>
            )}

            <button
              type="button"
              aria-label="Tutup modal pemilihan template"
              onClick={onClose}
              className="rounded-xl p-8 text-[#000000] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-12 border-b border-[#E2E8F0] bg-[#F8FAFC] px-24 py-16 phones:px-16 phones:py-12">
          {/* Search Bar */}
          <div className="relative min-w-[24rem] max-w-[36rem] flex-1 phones:max-w-none">
            <Search size={16} className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              placeholder="Cari nama atau jenis template surat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] py-8 pl-40 pr-16 text-[1.35rem] font-normal leading-[1.4] text-[#475569] placeholder:text-[#64748B] transition-colors focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
            />
          </div>

          {/* Kategori Tabs */}
          <div className="flex flex-wrap items-center gap-8">
            {CATEGORY_TABS.map((cat) => {
              const count =
                cat.id === 'ALL'
                  ? allItems.length
                  : allItems.filter((item) => item.type === cat.id).length
              const isActive = categoryFilter === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  data-category-filter={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`inline-flex min-h-[3.8rem] items-center gap-8 rounded-xl border px-16 py-8 text-[1.25rem] leading-[1.3] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF] ${
                    isActive
                      ? 'border-[#0000FF] bg-[#0000FF] font-semibold text-white shadow-sm'
                      : 'border-[#E2E8F0] bg-[#FFFFFF] font-medium text-[#000000] hover:border-[#0000FF] hover:bg-[#F8FAFC] hover:text-[#0000FF]'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`rounded-full px-8 py-2 text-[1.15rem] font-semibold leading-[1.2] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#000000]'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Body */}
        <div className="scrollbar grid flex-1 grid-cols-12 gap-20 overflow-y-auto bg-[#F8FAFC] p-24 phones:grid-cols-1 phones:p-16">
          {/* List Kartu Template */}
          <div className="col-span-7 flex flex-col gap-12 phones:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[1.5rem] font-semibold leading-[1.4] text-[#000000]">
                Daftar Template ({filteredItems.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-12">
              {filteredItems.map((tpl) => {
                const IconComponent = tpl.icon
                const isSelected = currentSelection?.id === tpl.id
                const catStyle = getDocumentCategoryStyle(tpl.type)

                return (
                  <div
                    key={tpl.id}
                    data-template-card={tpl.id}
                    onClick={() => setSelectedId(tpl.id)}
                    className={`group cursor-pointer rounded-xl border p-20 transition-colors ${
                      isSelected
                        ? 'border-[#0000FF] bg-[#FFFFFF]'
                        : 'border-[#E2E8F0] bg-[#FFFFFF] hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-12">
                      <div className="flex min-w-0 flex-1 items-start gap-12">
                        <div
                          className={`mt-2 flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center ${catStyle.iconBoxClass}`}
                        >
                          <IconComponent size={20} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-6">
                          <div className="flex flex-wrap items-center gap-8">
                            <h4 className="text-[1.6rem] font-semibold leading-[1.4] text-[#000000]">
                              {tpl.name}
                            </h4>
                            <span
                              data-doc-category-badge={tpl.type}
                              className={`inline-flex items-center text-[1.2rem] font-semibold leading-[1.3] ${catStyle.badgeClass}`}
                            >
                              {tpl.typeName}
                            </span>
                            {tpl.isCustom ? (
                              <span className="inline-flex items-center text-[1.2rem] font-normal uppercase leading-[1.3] text-[#000000]">
                                {tpl.fileFormat} · Kustom
                              </span>
                            ) : (
                              <span className="text-[1.2rem] font-normal leading-[1.3] text-[#000000]">
                                Bawaan Sistem
                              </span>
                            )}
                          </div>
                          <p className="text-[1.35rem] font-normal leading-[1.55] text-[#000000]">
                            {tpl.shortDesc}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-16 flex flex-wrap items-center justify-between gap-10 border-t border-[#E2E8F0] pt-12">
                      <div className="flex items-center gap-6">
                        <span className="text-[1.25rem] leading-[1.4] text-[#000000]">
                          Format: {tpl.supportedFormats.map((f) => f.toUpperCase()).join(', ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-8">
                        {tpl.isCustom && onDownloadTemplate && (
                          <button
                            type="button"
                            id={`btn-download-template-${tpl.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onDownloadTemplate(tpl.rawRecord)
                            }}
                            title="Unduh file template asli"
                            aria-label="Unduh file template asli"
                            className="btn-action-download inline-flex h-[3.8rem] items-center justify-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.25rem] font-semibold text-[#008000] transition-colors hover:bg-[#F8FAFC]"
                          >
                            <Download size={15} />
                            <span>Unduh</span>
                          </button>
                        )}
                        {tpl.isCustom && onDeleteTemplate && (
                          <button
                            type="button"
                            id={`btn-delete-template-${tpl.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteTemplate(tpl.rawRecord)
                            }}
                            title="Hapus template kustom"
                            aria-label="Hapus template kustom"
                            className="btn-action-delete inline-flex h-[3.8rem] items-center justify-center gap-6 rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-12 py-8 text-[1.25rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                          >
                            <Trash2 size={15} className="text-white" />
                            <span>Hapus</span>
                          </button>
                        )}
                        <button
                          type="button"
                          id={`btn-use-template-${tpl.id}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUseTemplate(tpl)
                          }}
                          className="inline-flex min-h-[3.8rem] items-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-8 text-[1.3rem] font-semibold leading-[1.3] text-white shadow-sm transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
                        >
                          <span>Gunakan Template</span>
                          <ArrowRight size={15} className="text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-12 rounded-xl border border-dashed border-[#E2E8F0] bg-[#FFFFFF] p-32 text-center">
                  <p className="text-[1.4rem] leading-[1.5] text-[#000000]">
                    Tidak ada template yang cocok dengan pencarian atau filter kategori ini.
                  </p>
                  {onOpenUploadModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUploadModal()
                      }}
                      className="inline-flex min-h-[3.8rem] items-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-8 text-[1.3rem] font-semibold leading-[1.3] text-white shadow-sm transition-colors hover:bg-[#0000D0]"
                    >
                      <Upload size={15} className="text-white" />
                      <span>+ Tambah Template</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Kolom Pratinjau Struktur Template */}
          <div className="col-span-5 flex flex-col gap-12 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-20 phones:col-span-1">
            <h3 className="text-[1.5rem] font-semibold leading-[1.4] text-[#000000]">
              Detail & Pratinjau Template
            </h3>

            {currentSelection ? (
              <div className="flex flex-1 flex-col justify-between gap-16 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-20">
                <div className="flex flex-col gap-16">
                  <div className="flex items-start gap-12">
                    <div
                      className={`mt-2 flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center ${getDocumentCategoryStyle(currentSelection.type).iconBoxClass}`}
                    >
                      <currentSelection.icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        data-doc-category-badge={currentSelection.type}
                        className={`inline-flex items-center text-[1.2rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle(currentSelection.type).badgeClass}`}
                      >
                        {currentSelection.typeName}
                      </span>
                      <h4 className="mt-6 break-words text-[1.65rem] font-semibold leading-[1.4] text-[#000000]">
                        {currentSelection.name}
                      </h4>
                      <p className="mt-2 break-words text-[1.25rem] font-normal leading-[1.45] text-[#000000]">
                        {currentSelection.previewSample.title}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-16 text-[1.3rem] font-normal leading-[1.6] text-[#000000]">
                    {currentSelection.longDesc}
                  </div>

                  <div className="flex flex-col gap-8">
                    <span className="text-[1.35rem] font-semibold leading-[1.4] text-[#000000]">
                      Fitur & Komponen Template:
                    </span>
                    <ul className="flex flex-col gap-8">
                      {currentSelection.previewSample.keyPoints.map((point, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-8 text-[1.3rem] font-normal leading-[1.5] text-[#000000]"
                        >
                          <span className="mt-6 h-5 w-5 shrink-0 rounded-full bg-[#000000]" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-col gap-10 border-t border-[#E2E8F0] pt-16">
                  <button
                    type="button"
                    onClick={() => handleUseTemplate(currentSelection)}
                    className="flex min-h-[4.2rem] w-full items-center justify-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-10 text-center text-[1.35rem] font-semibold leading-[1.35] text-white shadow-sm transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
                  >
                    <span>Gunakan Template {currentSelection.name}</span>
                    <ArrowRight size={16} className="shrink-0 text-white" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-16 text-[1.35rem] leading-[1.5] text-[#000000]">
                Pilih template untuk melihat detail
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
