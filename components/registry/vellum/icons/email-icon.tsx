import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
}

const EmailIcon = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="16"
				viewBox="0 0 20 16"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M20 0H0V16H20V0ZM18 4L10 9L2 4V2L10 7L18 2V4Z"
					fill="currentColor"
				/>
			</svg>
		);
	},
);

EmailIcon.displayName = "EmailIcon";
export default EmailIcon;
