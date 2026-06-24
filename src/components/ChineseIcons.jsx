/** 導覽與選單用中國風線描圖示（與儀表板原 Heroicons 對位） */

const iconCls = 'w-5 h-5 shrink-0'

export function HomeIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3c-4 3.5-6.5 7.8-6.5 12.2c0 1.2.3 2.4.8 3.5" />
      <path d="M12 3c4 3.5 6.5 7.8 6.5 12.2c0 1.2-.3 2.4-.8 3.5" />
      <path d="M5.5 18.5L12 21l6.5-2.5" />
      <circle cx="12" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CalendarIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4h10a2 2 0 012 2v13a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M9 2v4M15 2v4M5 10h14" />
      <path d="M9 14h2M13 14h2M9 17.5h6" opacity="0.85" />
    </svg>
  )
}

export function ChatIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="8" cy="16" rx="3" ry="3" />
      <ellipse cx="16" cy="16" rx="3" ry="3" />
      <path d="M5 16V11a7 7 0 0114 0v5" />
      <path d="M9 8h6a2 2 0 012 2v1H7v-1a2 2 0 012-2z" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16v12H4z" />
      <path d="M4 7l8 6 8-6" />
      <path d="M9 14l-2 4M15 14l2 4" opacity="0.7" />
    </svg>
  )
}

export function DocumentIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3h8l4 4v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M8 3v4h4" />
      <path d="M9 12h6M9 15.5h6M9 19h4" />
    </svg>
  )
}

export function PeopleIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 10a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM4.5 20v-1a3.5 3.5 0 013.5-3.5h1" />
      <path d="M16 9a2 2 0 110 4M13 20v-1a3 3 0 013-3h1" />
      <path d="M17.5 7.5h.01" />
    </svg>
  )
}

export function GearIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  )
}

export function AlertIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v4.5M12 17h.01" strokeWidth="2" />
    </svg>
  )
}

export function PerformanceIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 20V10M12 20V6M17 20v-8" />
      <path d="M5 20h14" />
      <path d="M7 10l1-2 1 2M12 6l1-2 1 2M17 12l1-2 1 2" opacity="0.6" />
    </svg>
  )
}

export function ShopIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V10z" />
      <path d="M6 6h12v4H6z" />
      <path d="M8 6V4h8v2" />
      <path d="M9 14h6" opacity="0.8" />
    </svg>
  )
}

export function BackpackIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 7V5a4 4 0 018 0v2" />
      <rect x="5" y="7" width="14" height="14" rx="2" />
      <path d="M9 11h6M9 15h4" />
      <path d="M12 7v3" />
    </svg>
  )
}

export function ExchangeIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="12" r="3.5" />
      <circle cx="15" cy="12" r="3.5" />
      <path d="M6 8h12M6 16h12" opacity="0.5" />
      <path d="M18 8l2-2M18 16l2 2" />
    </svg>
  )
}

export function CheckInIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
      <path d="M9 12l2 2 4-4" strokeWidth="1.8" />
      <path d="M8 3v3M16 3v3" />
    </svg>
  )
}

export function LeaveIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3h8v18l-4-2-4 2V3z" />
      <path d="M10 7h4M10 11h4M10 15h3" />
    </svg>
  )
}

/** 補休／加班費登記 */
export function CompensatoryLeaveIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="13" r="6.5" />
      <path d="M12 9.5V13l2.5 1.5" opacity="0.9" />
      <path d="M18 6l2-2M18 6l-2-2M6 18l-2 2M6 18l2 2" />
    </svg>
  )
}

export function AdvanceIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="8" rx="5" ry="2.2" />
      <path d="M7 8v2c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8" />
      <path d="M7 12v2c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-2" />
      <path d="M9 17c0 1 1.3 2 3 2s3-1 3-2" />
    </svg>
  )
}

export function GameIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="9" cy="12" r="2.2" fill="currentColor" />
      <circle cx="15" cy="12" r="2.2" />
      <path d="M6 4v2M18 4v2" />
    </svg>
  )
}

export function PersonalServiceIcon() {
  return (
    <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4l2 3h-4l2-3z" />
      <circle cx="12" cy="11" r="3" />
      <path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
    </svg>
  )
}
