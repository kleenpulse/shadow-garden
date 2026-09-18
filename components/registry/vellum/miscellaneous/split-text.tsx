import { Fragment } from "react";

type SplitTextProps = {
	children: string;
};

export default function SplitText({ children }: SplitTextProps) {
	const words = children.split(" ").filter(Boolean);

	return (
		<>
			{words.map((word, index) => (
				<Fragment key={`${word}-${index}`}>
					<span key={`${word}-${index}`} className="word inline-block">
						{word}
					</span>
					{index < words.length - 1 && " "}
				</Fragment>
			))}
		</>
	);
}
