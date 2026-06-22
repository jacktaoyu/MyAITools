import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
	({ className, ...props }, ref) => {
		return (
			<textarea
				className={cn(
					"flex w-full rounded-sm border border-input-foreground/20 bg-input-background px-3 py-2 text-base text-input-foreground shadow-sm transition-colors placeholder:text-input-placeholder focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-input-border disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y min-h-[80px]",
					className,
				)}
				ref={ref}
				{...props}
			/>
		)
	},
)
Textarea.displayName = "Textarea"

export { Textarea }
