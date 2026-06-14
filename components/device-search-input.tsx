"use client";

import { Search, X } from "lucide-react";

interface DeviceSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DeviceSearchInput({
  value,
  onChange,
  placeholder = "Buscar por nome ou IP...",
}: DeviceSearchInputProps) {
  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <input
        type="text"
        aria-label="Buscar dispositivos"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-52 rounded-full border border-border bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
