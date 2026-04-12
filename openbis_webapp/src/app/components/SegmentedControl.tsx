interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps) {
  return (
    <div
      className={`inline-flex bg-white border-2 border-(--lab-border) rounded ${className}`}
    >
      {options.map((option, index) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            value === option
              ? "bg-(--lab-accent) text-white"
              : "text-(--lab-text-secondary)] hover:text-(--lab-text-primary) hover:bg-[var(--lab-panel)"
          } ${index === 0 ? "rounded-l" : ""} ${index === options.length - 1 ? "rounded-r" : ""} ${
            index < options.length - 1 ? "border-r-2 border-(--lab-border)" : ""
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
