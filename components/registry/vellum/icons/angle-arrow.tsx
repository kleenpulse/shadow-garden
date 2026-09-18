import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
}

const AngleArrow = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 14 14"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M13.707 0.999999C13.707 0.447714 13.2593 -8.61581e-07 12.707 -1.11446e-06L3.70703 -3.13672e-07C3.15475 -6.50847e-07 2.70703 0.447715 2.70703 0.999999C2.70703 1.55228 3.15475 2 3.70703 2L11.707 2L11.707 10C11.707 10.5523 12.1547 11 12.707 11C13.2593 11 13.707 10.5523 13.707 10L13.707 0.999999ZM0.707031 13L1.41414 13.7071L13.4141 1.70711L12.707 0.999999L11.9999 0.292893L-7.55191e-05 12.2929L0.707031 13Z"
					fill="currentColor"
					fillOpacity="0.89"
				/>
			</svg>
		);
	},
);

AngleArrow.displayName = "AngleArrow";
export default AngleArrow;
