import ImgNotFound from '@/assets/images/not-found.jpg'

export default function AlternatifErrorPage({
  deskripsi = 'Maaf, halaman yang Anda cari tidak tersedia atau mungkin telah dipindahkan.',
  image = ImgNotFound,
  judul = 'Halaman Tidak Ditemukan',
  kode = '404',
  nama = 'Luma',
}: {
  image?: string
  nama?: string
  judul?: string
  kode?: string
  deskripsi?: string
}) {
  return (
    <div className="scrollbar flex w-full justify-center overflow-auto py-[8rem] phones:py-24">
      <div className="flex w-full max-w-[80rem] items-center justify-center gap-48 px-16 tablet:flex-col-reverse tablet:gap-24 phones:flex-col-reverse phones:gap-24">
        <div className="flex flex-1 flex-col gap-12 text-[#000000]">
          <p className="text-[3.2rem] font-semibold text-[#000000]">{nama}</p>
          <p className="text-[1.8rem] font-semibold text-[#000000]">
            <span className="font-semibold text-app-primary">{kode}</span> — {judul}
          </p>
          <p className="text-[1.4rem] leading-relaxed text-[#000000]">{deskripsi}</p>
        </div>

        <img
          src={image}
          alt={judul}
          loading="eager"
          className="h-auto max-w-[32rem] object-contain phones:max-w-[24rem]"
        />
      </div>
    </div>
  )
}
