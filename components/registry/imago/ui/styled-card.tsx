import { cn } from "@/lib/utils";

interface CardBodyProps {
	title?: React.ReactNode;
	description?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
}

interface EllipsesProps {
	dotClassName?: string;
}

interface ContainerProps {
	children: React.ReactNode;
	className?: string;
	dotClassName?: string;
}

interface StyledCardProps extends React.ComponentProps<"div"> {
	bodyClassName?: string;
	dotClassName?: string;
	footer?: React.ReactNode;
	children: React.ReactNode;
}

const CardBody = ({ className, children }: CardBodyProps) => (
	<div className={cn("text-start p-4", className)}>{children}</div>
);

const Ellipses = ({ dotClassName }: EllipsesProps) => {
	const baseClassName =
		"rounded-full outline-8  size-1 my-4 outline-[var(--background)]/60 bg-[var(--accent)]";

	return (
		<div className="absolute z-0 grid h-full w-full items-center gap-8 lg:grid-cols-2">
			<section className="absolute z-0 grid h-full w-full grid-cols-2 place-content-between">
				<div className={cn(baseClassName, "-mx-[2.5px]", dotClassName)} />
				<div
					className={cn(baseClassName, "-mx-0.5 place-self-end", dotClassName)}
				/>
				<div className={cn(baseClassName, "-mx-[2.5px]", dotClassName)} />
				<div
					className={cn(baseClassName, "-mx-0.5 place-self-end", dotClassName)}
				/>
			</section>
		</div>
	);
};

export const Container = ({
	children,
	className,
	dotClassName,
}: ContainerProps) => (
	<div
		className={cn(
			"relative mx-auto size-full border border-dashed border-[var(--border)] px-4   ",
			className,
		)}
	>
		{/* Top rule */}
		<div className="absolute left-0 top-4 z-0 h-px w-full bg-[var(--accent)]   " />
		{/* Bottom rule */}
		<div className="absolute bottom-4 left-0 z-0 h-px w-full bg-[var(--accent)]  " />

		<div className="relative size-full border-x border-[var(--accent)] ">
			<Ellipses dotClassName={dotClassName} />
			<div className="relative z-20 mx-auto py-4">{children}</div>
		</div>
	</div>
);

export const StyledCard = ({
	bodyClassName,
	dotClassName,
	children,
	className,
	...props
}: StyledCardProps) => (
	<div
		className={cn("bg-[var(--background)]/60 backdrop-blur-md relative ", className)}
		{...props}
	>
		<Container dotClassName={dotClassName}>
			<CardBody className={cn("flex flex-col gap-2", bodyClassName)}>
				{children}
			</CardBody>
		</Container>
		<div className="absolute w-full bottom-0 left-0 bg-linear-to-b from-transparent via-transparent to-[var(--accent)]/15 h-full rounded-[inherit] pointer-events-none blur-sm" />
	</div>
);

StyledCard.displayName = "StyledCard";
