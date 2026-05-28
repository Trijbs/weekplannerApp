"use client";

import { useEffect, useRef, useState } from "react";

type ProjectComboboxProps = {
  value: string;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
};

export function ProjectCombobox({
  value,
  suggestions,
  placeholder = "Project",
  className = "",
  onChange,
}: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value,
  );

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <input
        value={value}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
