interface HpLogoProps {
  className?: string;
}

export default function HpLogo({ className = '' }: HpLogoProps) {
  return (
    <svg
      className={className || 'h-5 w-auto'}
      viewBox="0 0 44 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="HostaPosta"
    >
      {/* h */}
      <path
        d="M2 2v16M2 11c0-2.8 1.8-4.5 4-4.5s4 1.7 4 4.5V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* p */}
      <path
        d="M16 7v14M16 7c0 0 1.2-1 3.5-1c3 0 5 2 5 5s-2 5-5 5c-2.3 0-3.5-1-3.5-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
