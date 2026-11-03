import React from 'react'

export default function FormInput({
  name,
  value,
  placeholder,
  onChange,
  className = '',
  type = 'text',
}: {
  name?: string
  value?: string | number
  placeholder?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  type?: string
}) {
  return (
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className={`min-h-[4.2rem] w-full min-w-0 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.4rem] font-normal leading-[1.45] text-[#000000] placeholder:text-[#000000] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0] transition-colors ${className}`}
    />
  )
}
