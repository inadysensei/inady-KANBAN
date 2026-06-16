import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonClass,
  cx,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/ui-classes";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon (e.g. an icon from components/ui/icons). */
  icon?: ReactNode;
};

/**
 * The one text-button primitive. Collapses the ~40 ad-hoc button styles into a
 * small set of variants × two sizes (see ui-classes.buttonClass — `primary` is
 * the filled CTA, the rest are outline/tinted). `className` is merged last so
 * callers can still tweak width/margins.
 */
export default function Button({
  variant,
  size,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClass({ variant, size }), className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
