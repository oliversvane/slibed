import * as React from "react";

import { cn } from "../../lib/utils";

const buttonVariants = {
  base:
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50",
  primary:
    "bg-slate-100 text-slate-900 hover:bg-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
  ghost: "text-slate-200 hover:bg-slate-800 hover:text-white",
  outline: "border border-slate-800 text-slate-100 hover:bg-slate-800",
};

const Button = React.forwardRef(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants.base, buttonVariants[variant], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button };
