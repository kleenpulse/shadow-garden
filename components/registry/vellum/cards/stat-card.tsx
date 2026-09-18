interface StatProps {
	value: string;
	prefix?: string;
	suffix?: string;
	label: string;
	delay?: number;
}

export default function StatCard({ value, label }: StatProps) {
	return (
		<div className="flex flex-col items-center justify-center py-6 md:py-10 px-6 xl:py-12 text-center  bg-[var(--card)] relative stat__card  w-full max-w-117.75 xl:max-w-150 ">
			<span className="size-2 bg-[var(--foreground)] absolute top-1 right-1" />
			<span
				className="text-6xl md:text-5xl xl:text-6xl font-bold tracking-tight mb-2"
				style={{
					color: "var(--foreground)",
					fontFamily: "var(--font-display)",
				}}
			>
				{value}
			</span>
			<span
				className="text-2xl xl:text-3xl capitalize  stat__text font-medium"
				style={{ color: "var(--muted-foreground)" }}
			>
				{label}
			</span>
		</div>
	);
}
