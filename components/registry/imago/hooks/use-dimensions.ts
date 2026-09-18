import { useEffect, useLayoutEffect, useState } from "react";
import { RefObject } from "react";

interface Dimensions {
	width: number;
	height: number;
}

export const useDimensions = (
	ref: RefObject<HTMLElement | null>,
): Dimensions => {
	const [dimensions, setDimensions] = useState<Dimensions>({
		width: 0,
		height: 0,
	});

	useLayoutEffect(() => {
		if (ref.current) {
			setDimensions({
				width: ref.current.offsetWidth,
				height: ref.current.offsetHeight,
			});
		}
	}, [ref]);

	useEffect(() => {
		const handleResize = (): void => {
			if (ref.current) {
				setDimensions({
					width: ref.current.offsetWidth,
					height: ref.current.offsetHeight,
				});
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [ref]);

	return dimensions;
};
