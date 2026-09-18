import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
	href?: string;
}

const TrendsIcon = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="39"
				height="40"
				viewBox="0 0 39 40"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M2.4375 32.1875H39V34.625H0V5.375H2.4375V13.7729L12.4351 8.76465L18.9097 15.2393L27.6504 17.4292L36.9243 8.17432L38.6382 9.88818L28.4121 20.1333L17.6528 17.4482L11.9399 11.7354L2.4375 16.4771V22.1328L12.3398 19.9429L22.2231 24.875H28.9644L37.229 20.7427L38.3335 22.9136L29.5356 27.3125H21.6519L12.0352 22.4946L2.4375 24.6274V32.1875Z"
					fill="white"
				/>
			</svg>
		);
	}
);

TrendsIcon.displayName = "TrendsIcon";
export default TrendsIcon;
