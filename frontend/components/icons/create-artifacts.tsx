interface IconProps {
  className?: string;
}

export function SlideIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="20" width="70" height="50" rx="6" opacity="0.5" />
      <rect x="25" y="35" width="70" height="50" rx="6" opacity="0.35" />
      <rect x="40" y="50" width="70" height="50" rx="6" opacity="0.2" />
    </svg>
  );
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="25" width="75" height="55" rx="8" opacity="0.3" />
      <polygon points="95,52 115,40 115,70" opacity="0.25" />
      <polygon points="38,42 38,68 58,55" opacity="0.4" />
    </svg>
  );
}

export function PodcastIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="60" cy="60" r="50" opacity="0.15" />
      <circle cx="60" cy="60" r="35" opacity="0.2" />
      <circle cx="60" cy="60" r="20" opacity="0.3" />
      <circle cx="60" cy="60" r="8" opacity="0.4" />
    </svg>
  );
}

export function ReelIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="20" y="15" width="60" height="80" rx="8" opacity="0.2" />
      <circle cx="50" cy="45" r="12" opacity="0.25" />
      <polygon points="46,41 46,49 56,45" opacity="0.35" />
      <rect x="28" y="68" width="44" height="4" rx="2" opacity="0.2" />
      <rect x="28" y="76" width="30" height="4" rx="2" opacity="0.15" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M25,25 L55,60 L25,95"
        stroke="currentColor"
        strokeWidth="8"
        fill="none"
        opacity="0.25"
      />
      <path
        d="M95,25 L65,60 L95,95"
        stroke="currentColor"
        strokeWidth="8"
        fill="none"
        opacity="0.25"
      />
      <line
        x1="30"
        y1="30"
        x2="90"
        y2="90"
        stroke="currentColor"
        strokeWidth="6"
        opacity="0.2"
      />
      <line
        x1="90"
        y1="30"
        x2="30"
        y2="90"
        stroke="currentColor"
        strokeWidth="6"
        opacity="0.2"
      />
    </svg>
  );
}

export function LinkedInIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="20" y="20" width="80" height="80" rx="16" opacity="0.15" />
      <rect x="35" y="55" width="12" height="30" rx="2" opacity="0.3" />
      <circle cx="41" cy="43" r="7" opacity="0.3" />
      <path
        d="M58,55 L58,85 L70,85 L70,68 C70,62 78,61 78,68 L78,85 L90,85 L90,64 C90,50 72,51 70,58 L70,55 Z"
        opacity="0.3"
      />
    </svg>
  );
}

export function PosterIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="35" y="30" width="50" height="65" rx="4" opacity="0.2" />
      <circle cx="60" cy="28" r="10" opacity="0.25" />
      <line
        x1="60"
        y1="38"
        x2="60"
        y2="60"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.2"
      />
      <line
        x1="48"
        y1="48"
        x2="60"
        y2="60"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.15"
      />
      <line
        x1="72"
        y1="48"
        x2="60"
        y2="60"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.15"
      />
      <rect x="45" y="72" width="30" height="3" rx="1" opacity="0.2" />
      <rect x="50" y="78" width="20" height="3" rx="1" opacity="0.15" />
    </svg>
  );
}
