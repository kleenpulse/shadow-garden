import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
export interface SVGProps extends React.SVGAttributes<SVGSVGElement> {
	children?: React.ReactNode;
	href?: string;
}

const PlayButtonIcon = forwardRef<SVGSVGElement, SVGProps>(
	({ className, ...props }, ref) => {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="21"
				viewBox="0 0 20 21"
				fill="none"
				className={cn(className)}
				ref={ref}
				{...props}
			>
				<path
					d="M10.4242 20.0509C15.7052 20.0509 19.9867 15.777 19.9867 10.5047C19.9867 5.23232 15.7052 0.958496 10.4242 0.958496C5.41249 0.958496 1.30286 4.80561 0.894287 9.7028H13.5334V11.3066H0.894287C1.30286 16.2037 5.41345 20.0509 10.4242 20.0509Z"
					fill="currentColor"
				/>
			</svg>
		);
	}
);

PlayButtonIcon.displayName = "PlayButtonIcon";
export default PlayButtonIcon;
