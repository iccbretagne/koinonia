"use client";

interface CheckboxGroupProps {
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: CheckboxGroupProps) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <fieldset className="space-y-1">
      <legend className="block text-sm font-medium text-gray-700">
        {label}
      </legend>
      <div className="max-h-48 overflow-y-auto border-2 border-gray-300 rounded-lg p-2 space-y-1">
        {options.length === 0 && (
          <p className="text-sm text-gray-400 py-1">Aucune option</p>
        )}
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
              opt.disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-50 cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              disabled={opt.disabled}
              onChange={() => toggle(opt.value)}
              className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
