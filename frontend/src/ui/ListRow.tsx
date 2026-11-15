import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./list.css";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Leading icon. */
  icon?: IconName;
  /** Tone of the leading icon. */
  tone?: "neutral" | "accent" | "danger" | "ok" | "warn" | "priority";
  /** Content under the title block (a meter, for instance). */
  children?: ReactNode;
  /** Trailing content (badge, value, control). */
  trailing?: ReactNode;
  /** Navigates on press and shows a chevron. */
  to?: string;
  onPress?: () => void;
  selected?: boolean;
}

/** One row of a list: static, a link (`to`) or a button (`onPress`). */
export function ListRow({ title, subtitle, icon, tone = "neutral", children, trailing, to, onPress, selected }: Props) {
  const body = (
    <>
      {icon && (
        <span className={`ui-row__icon ui-tone-${tone}`}>
          <Icon name={icon} />
        </span>
      )}
      <span className="ui-row__main">
        <span className="ui-row__title">{title}</span>
        {subtitle && <span className="ui-row__subtitle">{subtitle}</span>}
        {children}
      </span>
      {trailing && <span className="ui-row__trailing">{trailing}</span>}
      {to && <Icon name="chevronRight" size="sm" />}
    </>
  );
  const className = `ui-row${selected ? " ui-row--selected" : ""}${to || onPress ? " ui-row--action" : ""}`;
  if (to) return <Link to={to} className={className} aria-current={selected ? "true" : undefined}>{body}</Link>;
  if (onPress) return <button type="button" className={className} onClick={onPress} aria-pressed={selected}>{body}</button>;
  return <div className={className}>{body}</div>;
}

/** A plain list with hairlines between rows. */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className="ui-list" aria-label={label}>{children}</ul>;
}
