interface GuapuMarkProps {
  size?: number;
  className?: string;
  label?: string;
}

export function GuapuMark({ size = 32, className, label = 'Guapu' }: GuapuMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      className={className}
    >
      <circle cx="50" cy="50" r="50" fill="#10345C" />
      <g transform="translate(50,50) scale(1.0) rotate(-90) translate(-54,-52)">
        <ellipse cx="46" cy="52" rx="30" ry="22" fill="#E7C24A" />
        <path d="M74 44 L92 52 L74 60 Z" fill="#E7C24A" />
        <path d="M46 43 L55 52 L46 61 L37 52 Z" fill="#0F9B6C" />
      </g>
    </svg>
  );
}
