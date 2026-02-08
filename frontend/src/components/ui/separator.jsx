import * as React from "react";

import { cn } from "../../lib/utils";

const Separator = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    className={cn("h-px w-full bg-slate-800", className)}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
