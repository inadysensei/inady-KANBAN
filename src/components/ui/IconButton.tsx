import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  cx,
  iconButtonClass,
  type ButtonSize,
  type IconButtonTone,
} from "@/lib/ui-classes";

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  /** Required: icon-only buttons must be labeled for screen readers. */
  "aria-label": string;
  tone?: IconButtonTone;
  size?: ButtonSize;
  /** The icon element to render. */
  children: ReactNode;
};

/**
 * The one icon-only button primitive. Every destructive control in the app is a
 * `tone="danger"` IconButton with a trash icon — that uniformity is the headline
 * fix for the old text/"Del"/SVG inconsistency. `aria-label` is required so the
 * icon stays accessible.
 */
export default function IconButton({
  tone,
  size,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(iconButtonClass({ tone, size }), className)}
      {...rest}
    >
      {children}
    </button>
  );
}
