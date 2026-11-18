import { CircleDotDashedIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Loading indicator (lucide circle-dot-dashed, spinning). */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return <CircleDotDashedIcon role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />;
}

export { Spinner };
