import { cn } from "@/lib/utils";
import React, { forwardRef } from "react";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: React.ReactNode;
	className?: string;
	props?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ children, className, ...props }, ref) => {
		return (
			<button
				className={cn(
					"active:shadow-[-2px_4px_1px_0_rgba(0,0,0,0.8)] rounded-full text-white px-4 py-2 h-10 lg:h-16 lg:px-8  hover:opacity-90 transition-all duration-200",
					className
				)}
				ref={ref}
				{...props}
			>
				{children}
			</button>
		);
	}
);

Button.displayName = "Button";

export default Button;
