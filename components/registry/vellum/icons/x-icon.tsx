import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
}

const XIcon = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M9.3175 6.775L15.1458 0H13.7645L8.704 5.8825L4.662 0H0L6.11225 8.8955L0 16H1.38125L6.7255 9.78788L10.994 16H15.656L9.31713 6.775H9.3175ZM7.42575 8.97375L6.80638 8.088L1.87887 1.03975H4.00038L7.97675 6.728L8.596 7.61375L13.7651 15.0075H11.6439L7.42575 8.97412V8.97375Z"
					fill="currentColor"
				/>
			</svg>
		);
	},
);

XIcon.displayName = "XIcon";
export default XIcon;
