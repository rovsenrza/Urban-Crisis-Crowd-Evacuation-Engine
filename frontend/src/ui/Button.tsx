import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./button.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet" | "inverse";
export type ButtonSize = "md" | "lg";

interface Shared {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: IconName;
  /** Fill the width of the container. */
  block?: boolean;
  children: ReactNode;
}

function classes({ variant = "secondary", size = "md", block }: Partial<Shared>, extra?: string): string {
  return ["ui-button", `ui-button--${variant}`, `ui-button--${size}`, block && "ui-button--block", extra].filter(Boolean).join(" ");
}

interface ButtonProps extends Shared, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Shows a spinner and blocks further presses while an action runs. */
  busy?: boolean;
}

export function Button({ variant, size, icon, block, busy, disabled, children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="ui-spinner" aria-hidden /> : icon && <Icon name={icon} />}
      <span className="ui-button__label">{children}</span>
    </button>
  );
}

/** Same look as `Button`, but navigates. */
export function ButtonLink({ variant, size, icon, block, children, className, ...rest }: Shared & LinkProps) {
  return (
    <Link {...rest} className={classes({ variant, size, block }, className)}>
      {icon && <Icon name={icon} />}
      <span className="ui-button__label">{children}</span>
    </Link>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** `raised` sits on the map with its own ground and shadow. */
  variant?: "plain" | "raised";
}

export function IconButton({ icon, label, variant = "plain", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={["ui-icon-button", `ui-icon-button--${variant}`, className].filter(Boolean).join(" ")}
    >
      <Icon name={icon} />
    </button>
  );
}
