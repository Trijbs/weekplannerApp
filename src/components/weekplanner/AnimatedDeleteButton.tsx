"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AnimatedDeleteButtonProps = {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
  size?: "sm" | "md";
};

const SIZE_MAP = {
  sm: 16,
  md: 20,
} as const;

function TrashCanSVG({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function AnimatedDeleteButton({
  onConfirm,
  label = "Verwijderen",
  confirmLabel = "Zeker?",
  className = "",
  size = "md",
}: AnimatedDeleteButtonProps) {
  const [armed, setArmed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearArmedTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (armed) {
      clearArmedTimer();
      setArmed(false);
      onConfirm();
    } else {
      clearArmedTimer();
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), 2000);
    }
  }, [armed, onConfirm, clearArmedTimer]);

  useEffect(() => clearArmedTimer, [clearArmedTimer]);

  const iconSize = SIZE_MAP[size];

  return (
    <button
      type="button"
      aria-label={armed ? confirmLabel : label}
      className={`inline-flex items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1 ${
        armed
          ? "animate-pulse bg-red-100 text-red-600"
          : "text-slate-400 hover:text-red-500"
      } ${className}`}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={armed ? confirmLabel : label}
    >
      {hovered && !armed ? (
        <img
          src="/icons/icons8-trash-can-60.gif"
          alt=""
          width={iconSize}
          height={iconSize}
          className="pointer-events-none"
          draggable={false}
        />
      ) : (
        <TrashCanSVG size={iconSize} />
      )}
      {armed && <span>{confirmLabel}</span>}
    </button>
  );
}