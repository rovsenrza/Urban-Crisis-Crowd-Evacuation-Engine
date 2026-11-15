import { useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import "./controls.css";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: IconName;
  /** Colour of the "on" state. `priority` is reserved for the special-care role. */
  tone?: "accent" | "priority";
  disabled?: boolean;
}

/** An on/off setting. The whole row is the control. */
export function Switch({ checked, onChange, label, description, icon, tone = "accent", disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`ui-switch ui-switch--${tone}`}
      onClick={() => onChange(!checked)}
    >
      {icon && <span className="ui-switch__icon"><Icon name={icon} size="lg" /></span>}
      <span className="ui-switch__text">
        <span className="ui-switch__label">{label}</span>
        {description && <span className="ui-switch__description">{description}</span>}
      </span>
      <span className="ui-switch__track" aria-hidden><i /></span>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; /** Longer name for screen readers. */ name?: string; lang?: string }[];
  onChange: (value: T) => void;
}

/** A small set of mutually exclusive choices. Arrow keys move between them. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const move = (index: number) => {
    const next = options[(index + options.length) % options.length];
    onChange(next.value);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[(index + options.length) % options.length]?.focus();
  };
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label} ref={group}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          lang={option.lang}
          aria-checked={option.value === value}
          aria-label={option.name}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index + 1); }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index - 1); }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface FieldProps {
  label: string;
  /** Message under the control. */
  error?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}

/** A visible label above a control, with the error under it. */
export function Field({ label, error, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {}) })}
      {error && <p id={errorId} className="ui-field__error">{error}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="ui-input" />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="ui-select">
      <select {...props} className="ui-input" />
      <Icon name="chevronRight" size="sm" />
    </span>
  );
}
