import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
}

const CrossHair = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				width="14"
				height="14"
				viewBox="0 0 14 14"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<circle cx="7" cy="7" r="2" fill="currentColor" />
				<line
					x1="7"
					y1="0"
					x2="7"
					y2="4"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<line
					x1="7"
					y1="10"
					x2="7"
					y2="14"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<line
					x1="0"
					y1="7"
					x2="4"
					y2="7"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<line
					x1="10"
					y1="7"
					x2="14"
					y2="7"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			</svg>
		);
	},
);

CrossHair.displayName = "CrossHair";
export default CrossHair;
