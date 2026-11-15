import type { ReactNode } from "react";
import { Button, IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import "./feedback.css";

export type Tone = "info" | "ok" | "warn" | "danger" | "priority";

const TONE_ICON: Record<Tone, IconName> = { info: "info", ok: "check", warn: "alert", danger: "alert", priority: "accessible" };

interface BannerProps {
  tone?: Tone;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons shown under the text. */
  actions?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  /** `alert` interrupts a screen reader; `status` waits its turn. */
  live?: "alert" | "status";
}

/** A message that stays until it is dismissed or the state behind it changes. */
export function Banner({ tone = "info", icon, title, children, actions, onDismiss, dismissLabel, live = "status" }: BannerProps) {
  return (
    <div className={`ui-banner ui-banner--${tone}`} role={live}>
      <span className="ui-banner__icon">
        <Icon name={icon ?? TONE_ICON[tone]} />
      </span>
      <div className="ui-banner__body">
        {title && <strong className="ui-banner__title">{title}</strong>}
        {children && <p>{children}</p>}
        {actions && <div className="ui-banner__actions">{actions}</div>}
      </div>
      {onDismiss && dismissLabel && <IconButton icon="close" label={dismissLabel} onClick={onDismiss} />}
    </div>
  );
}

interface ToastProps {
  tone: "ok" | "danger";
  children: ReactNode;
  onDismiss: () => void;
  dismissLabel: string;
}

/** A short-lived message about the result of an action. Rendered once, at the shell level. */
export function Toast({ tone, children, onDismiss, dismissLabel }: ToastProps) {
  return (
    <div className={`ui-toast ui-toast--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={tone === "ok" ? "check" : "alert"} />
      <p>{children}</p>
      <IconButton icon="close" label={dismissLabel} onClick={onDismiss} />
    </div>
  );
}

interface BadgeProps {
  tone?: "neutral" | "accent" | "danger" | "ok" | "warn" | "priority";
  /** Filled instead of tinted. */
  solid?: boolean;
  icon?: IconName;
  children: ReactNode;
}

export function Badge({ tone = "neutral", solid, icon, children }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}${solid ? " ui-badge--solid" : ""}`}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}

interface StateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** Nothing to show yet, with the next step. */
export function EmptyState({ icon = "info", title, children, action }: StateProps) {
  return (
    <div className="ui-state">
      <span className="ui-state__icon"><Icon name={icon} size="xl" /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

interface ErrorProps {
  title: string;
  children?: ReactNode;
  retryLabel: string;
  onRetry: () => void;
  busy?: boolean;
}

/** Something failed, with a way to try again. */
export function ErrorState({ title, children, retryLabel, onRetry, busy }: ErrorProps) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <span className="ui-state__icon"><Icon name="alert" size="xl" /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      <Button variant="primary" icon="reset" onClick={onRetry} busy={busy}>{retryLabel}</Button>
    </div>
  );
}

/** Placeholder lines while content loads. The parent carries `aria-busy`. */
export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ui-skeleton__line" />
      ))}
    </div>
  );
}

/** Placeholder for a list of rows. */
export function SkeletonList({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className="ui-skeleton ui-skeleton--list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="ui-skeleton__row">
          <span className="ui-skeleton__line" />
          <span className="ui-skeleton__line" />
        </span>
      ))}
    </div>
  );
}
