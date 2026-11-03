/** @type {import('tailwindcss').Config} */
export default {
  // Mengaktifkan dark mode berdasarkan kelas yang diterapkan di HTML
  darkMode: ['class'],

  // Mendefinisikan direktori yang berisi file untuk pemindaian class Tailwind
  content: ['./src/**/*.{ts,tsx}'],

  theme: {
    // --- Sistem Border Radius ---
    borderRadius: {
      none: '0px',
      sm: '0.125rem',
      rounded: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      full: '9999px', // Membuat border radius menjadi bulat sempurna
      '2x': '2rem',
      '3x': '3rem',
      '4x': '4rem',
    },

    //? ----- SISTEM SPASI -----
    spacing: {
      0: '0',
      0.5: '0.05rem',
      1: '0.1rem',
      1.5: '0.15rem',
      2: '0.2rem',
      2.5: '0.25rem',
      3: '0.3rem',
      3.5: '0.35rem',
      4: '0.4rem',
      5: '0.5rem',
      6: '0.6rem',
      7: '0.7rem',
      8: '0.8rem',
      9: '0.9rem',
      10: '1rem',
      11: '1.1rem',
      12: '1.2rem',
      13: '1.3rem',
      14: '1.4rem',
      15: '1.5rem',
      16: '1.6rem',
      18: '1.8rem',
      20: '2rem',
      22: '2.2rem',
      24: '2.4rem',
      26: '2.6rem',
      28: '2.8rem',
      30: '3rem',
      32: '3.2rem',
      36: '3.6rem',
      40: '4rem',
      44: '4.4rem',
      48: '4.8rem',
      52: '5.2rem',
      56: '5.6rem',
      60: '6rem',
      64: '6.4rem',
      72: '7.2rem',
      80: '8rem',
      96: '9.6rem',
      128: '12.8rem',
    },

    //? ----- SISTEM TIPOGRAFI -----
    fontSize: {
      xs: ['1.2rem', { lineHeight: '1.45' }],
      sm: ['1.35rem', { lineHeight: '1.45' }],
      base: ['1.5rem', { lineHeight: '1.5' }],
      lg: ['1.8rem', { lineHeight: '1.45' }],
      xl: ['2rem', { lineHeight: '1.4' }],
      '2xl': ['2.4rem', { lineHeight: '1.35' }],
      '3xl': ['3rem', { lineHeight: '1.3' }],
      10: ['1rem', { lineHeight: '1.4' }],
      12: ['1.2rem', { lineHeight: '1.45' }],
      14: ['1.4rem', { lineHeight: '1.45' }],
      16: ['1.6rem', { lineHeight: '1.5' }],
      18: ['1.8rem', { lineHeight: '1.45' }],
      20: ['2rem', { lineHeight: '1.4' }],
      24: ['2.4rem', { lineHeight: '1.35' }],
      30: ['3rem', { lineHeight: '1.3' }],
      36: ['3.6rem', { lineHeight: '1.25' }],
      44: ['4.4rem', { lineHeight: '1.2' }],
      52: ['5.2rem', { lineHeight: '1.2' }],
      62: ['6.2rem', { lineHeight: '1.15' }],
      74: ['7.4rem', { lineHeight: '1.15' }],
      86: ['8.6rem', { lineHeight: '1.1' }],
      98: ['9.8rem', { lineHeight: '1.1' }],
    },
    lineHeight: {
      DEFAULT: '1.45', // Line height default yang nyaman agar font tidak terpotong
      none: '1',
      tight: '1.3',
      snug: '1.4',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
      medium: '1.35',
      paragraph: '1.5', // Line height untuk paragraf
    },
    letterSpacing: {
      DEFAULT: '0.1rem',
      0.1: '0.01rem',
      0.25: '0.025rem',
      0.5: '0.05rem',
      0.75: '0.075rem',
      1.25: '0.125rem',
      1.5: '0.15rem',
      6: '0.6rem',
    },

    // ! Menggunakan unit em untuk media queries agar lebih konsisten
    // ! 1rem = 1em = 16px pada kebanyakan browser
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      phones: { max: '40em' },
      tablet: { min: '40.01em', max: '64em' },
      laptop: { min: '64.01em', max: '80em' },
      desktop: { min: '80.01em' },
    },

    extend: {
      // Menambahkan font keluarga kustom
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        nunito: ['Nunito Sans', 'sans-serif'],
        roboto: ['Roboto Slab', 'serif'],
        'sf-pro': ['SF Pro Display', 'sans-serif'],
        helvetica: ['Helvetica', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        montserrat: ['Montserrat', 'sans-serif'],
        jakarta: ['Plus Jakarta Sans', 'sans-serif'],
      },

      // ? ----- SISTEM WARNA -----
      colors: {
        app: {
          primary: '#0000FF',
          primaryHover: '#0000FF',
          primarySoft: '#FFFFFF',
          textPrimary: '#000000',
          textSecondary: '#000000',
          secondary: '#000000',
          success: '#008000',
          warning: '#0000FF',
          danger: '#000000',
          info: '#0000FF',
          background: '#F8FAFC',
          surface: '#FFFFFF',
          border: '#E2E8F0',
          muted: '#000000',
          mutedBg: '#F1F5F9',
        },
        document: {
          offer: {
            bg: 'transparent',
            text: '#0000FF',
            border: '#E2E8F0',
          },
          request: {
            bg: 'transparent',
            text: '#008000',
            border: '#E2E8F0',
          },
          order: {
            bg: 'transparent',
            text: '#000000',
            border: '#E2E8F0',
          },
          agreement: {
            bg: 'transparent',
            text: '#0000FF',
            border: '#E2E8F0',
          },
        },
        action: {
          preview: {
            bg: '#FFFFFF',
            text: '#000000',
            border: '#E2E8F0',
            hover: '#F8FAFC',
          },
          edit: {
            bg: '#FFFFFF',
            text: '#0000FF',
            border: '#E2E8F0',
            hover: '#F8FAFC',
          },
          download: {
            bg: '#FFFFFF',
            text: '#008000',
            border: '#E2E8F0',
            hover: '#F8FAFC',
          },
          delete: {
            bg: '#FFFFFF',
            text: '#000000',
            border: '#E2E8F0',
            hover: '#F8FAFC',
          },
        },
        status: {
          saved: {
            bg: 'transparent',
            text: '#008000',
            border: '#E2E8F0',
          },
          draft: {
            bg: 'transparent',
            text: '#000000',
            border: '#E2E8F0',
          },
          pending: {
            bg: 'transparent',
            text: '#0000FF',
            border: '#E2E8F0',
          },
          approved: {
            bg: 'transparent',
            text: '#008000',
            border: '#E2E8F0',
          },
          rejected: {
            bg: 'transparent',
            text: '#000000',
            border: '#E2E8F0',
          },
          verified: {
            bg: 'transparent',
            text: '#008000',
            border: '#E2E8F0',
          },
          cancelled: {
            bg: 'transparent',
            text: '#000000',
            border: '#E2E8F0',
          },
        },
        background: {
          DEFAULT: '#F8FAFC',
          secondary: '#F1F5F9',
        },
        border: {
          DEFAULT: '#E2E8F0',
          subdued: '#CBD5E1',
        },
        primary: {
          DEFAULT: '#0000FF',
        },
        secondary: {
          DEFAULT: '#000000',
        },
        accent: {
          DEFAULT: '#FFFFFF',
        },
        light: {
          DEFAULT: '#F8FAFC',
        },
        dark: {
          DEFAULT: '#000000',
        },
        placeholder: '#000000',
      },

      // ? ----- SISTEM SHADOW -----
      boxShadow: {
        disabled: '0px -0.9471396207809448px 0px 0px rgba(0, 0, 0, 0.08) inset', // Shadow untuk elemen yang tidak aktif
        'active-primary': '0 0 0 3px rgba(64, 0, 83, 0.5)', // Shadow untuk elemen aktif dengan warna primer
      },

      // ? ----- ANIMASI -----
      keyframes: {
        'accordion-down': {
          from: { height: 0 }, // Animasi untuk membuka accordion (dari tinggi 0)
          to: { height: 'var(--radix-accordion-content-height)' }, // Animasi untuk menampilkan konten accordion
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' }, // Animasi untuk menutup accordion (dari tinggi konten)
          to: { height: 0 }, // Animasi untuk menyembunyikan konten accordion
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' }, // Animasi marquee gerak horizontal
          '100%': { transform: 'translateX(-100%)' }, // Menyelesaikan gerakan marquee ke kiri
        },
        'marquee-up': {
          '0%': { transform: 'translateY(0%)' }, // Animasi marquee gerak vertikal
          '100%': { transform: 'translateY(-100%)' }, // Menyelesaikan gerakan marquee ke atas
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out', // Durasi dan timing untuk animasi membuka accordion
        'accordion-up': 'accordion-up 0.2s ease-out', // Durasi dan timing untuk animasi menutup accordion
        marquee: 'marquee 25s linear infinite', // Durasi untuk animasi marquee horizontal
        'marquee-up': 'marquee-up 15s linear infinite', // Durasi untuk animasi marquee vertikal
      },
    },
  },

  // Menambahkan plugin untuk animasi dengan Tailwind CSS
  plugins: ['tailwindcss-animate'],
}
