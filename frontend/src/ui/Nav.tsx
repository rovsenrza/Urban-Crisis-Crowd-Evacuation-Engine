import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import "./nav.css";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Count shown on the item; 0 or undefined hides it. */
  count?: number;
  /** Tone of the count. */
  tone?: "danger" | "priority" | "neutral";
}

function Item({ item, layout }: { item: NavItem; layout: "tab" | "side" }) {
  return (
    <NavLink to={item.to} className={`ui-nav-item ui-nav-item--${layout}`}>
      <span className="ui-nav-item__icon">
        <Icon name={item.icon} />
        {layout === "tab" && Boolean(item.count) && (
          <span className={`ui-nav-item__count ui-nav-item__count--${item.tone ?? "neutral"}`}>{item.count}</span>
        )}
      </span>
      <span className="ui-nav-item__label">{item.label}</span>
      {layout === "side" && Boolean(item.count) && (
        <span className={`ui-nav-item__count ui-nav-item__count--${item.tone ?? "neutral"}`}>{item.count}</span>
      )}
    </NavLink>
  );
}

interface TabBarProps {
  label: string;
  items: NavItem[];
  /** One extra control at the trailing end (the SOS action, a "More" button). Not a tab. */
  action?: ReactNode;
}

/** Bottom navigation: up to five destinations, icon above label. */
export function TabBar({ label, items, action }: TabBarProps) {
  return (
    <nav className="ui-tabbar" aria-label={label}>
      {items.map((item) => (
        <Item key={item.to} item={item} layout="tab" />
      ))}
      {action}
    </nav>
  );
}

interface SidebarProps {
  label: string;
  items: NavItem[];
  header?: ReactNode;
  footer?: ReactNode;
}

/** Vertical navigation for wide screens. */
export function Sidebar({ label, items, header, footer }: SidebarProps) {
  return (
    <aside className="ui-sidebar">
      {header && <div className="ui-sidebar__header">{header}</div>}
      <nav className="ui-sidebar__nav" aria-label={label}>
        {items.map((item) => (
          <Item key={item.to} item={item} layout="side" />
        ))}
      </nav>
      {footer && <div className="ui-sidebar__footer">{footer}</div>}
    </aside>
  );
}
