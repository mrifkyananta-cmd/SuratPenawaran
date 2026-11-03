import React from 'react'

export default function FormTextArea({
  name,
  value,
  placeholder,
  onChange,
  rows = 2,
  className = '',
}: {
  name?: string
  value?: string
  placeholder?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  rows?: number
  className?: string
}) {
  return (
    <textarea
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      rows={rows}
      className={`w-full min-w-0 resize-y rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.4rem] font-normal leading-[1.5] text-[#000000] placeholder:text-[#000000] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0] transition-colors ${className}`}
    />
  )
}
