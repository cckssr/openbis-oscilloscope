import { ChevronUp, ChevronDown } from "lucide-react";

interface NumericInputProps {
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}

export function NumericInput({
  value,
  unit = "",
  onChange,
  step = 0.1,
  min,
  max,
  className = "",
}: NumericInputProps) {
  const handleIncrement = () => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  const handleDecrement = () => {
    const newValue = value - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        max={max}
        className="font-mono bg-white border-2 border-(--lab-border) text-(--lab-text-primary) px-2 py-1 text-sm rounded w-24 focus:outline-none focus:border-(--lab-accent)"
      />
      {unit && (
        <span className="text-xs text-(--lab-text-secondary) min-w-[2rem]">
          {unit}
        </span>
      )}
      <div className="flex flex-col">
        <button
          onClick={handleIncrement}
          className="p-0.5 border border-(--lab-border) rounded-t text-(--lab-text-secondary) hover:bg-(--lab-panel) hover:text-(--lab-text-primary)"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          onClick={handleDecrement}
          className="p-0.5 border border-(--lab-border) rounded-b text-(--lab-text-secondary) hover:bg-(--lab-panel) hover:text-(--lab-text-primary)"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
