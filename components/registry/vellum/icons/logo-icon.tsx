import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
}

const LogoIcon = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="73"
				height="43"
				viewBox="0 0 73 43"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M31.259 0.539628L0.551529 31.2471C-0.849534 32.6482 0.645982 34.9707 2.50123 34.275L22.5865 26.743C23.1625 26.527 23.8083 26.6128 24.308 26.9716L38.6908 37.2995C39.5842 37.9411 40.8371 37.662 41.3737 36.7018L45.403 29.4923C45.9076 28.5893 47.0566 28.2786 47.9475 28.8043L70.0284 41.832C71.8927 42.9319 73.798 40.473 72.2674 38.9424L33.8646 0.539627C33.1451 -0.179877 31.9785 -0.179877 31.259 0.539628Z"
					fill="currentColor"
				/>
			</svg>
		);
	},
);

LogoIcon.displayName = "LogoIcon";
export default LogoIcon;
