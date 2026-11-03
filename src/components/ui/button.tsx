import React from 'react'

export function Button({
  icon,
  label,
  color,
  text,
  disabled,
  className = 'text-[1.4rem]',
  padding = 'px-16 py-8',
  type = 'button',
  border = 'rounded-xl',
  items = 'items-center',
  justify = 'justify-center',
  fx,
  style,
}: {
  icon?: JSX.Element
  label?: string
  color?: string
  text?: string
  disabled?: boolean
  fx?: () => void
  className?: string
  padding?: string
  border?: string
  items?: 'items-center' | 'items-start' | 'items-end'
  justify?: 'justify-start' | 'justify-center' | 'justify-end'
  type?: 'submit' | 'button'
  style?: React.CSSProperties
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={style}
      className={`font-jakarta inline-flex gap-8 transition-colors hover:bg-opacity-80 disabled:cursor-not-allowed disabled:bg-opacity-50 ${padding} ${color} ${text} ${className} ${border} ${items} ${justify}`}
      onClick={fx}
    >
      {icon}
      {label && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}
