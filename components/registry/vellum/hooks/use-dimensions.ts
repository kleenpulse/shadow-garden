/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useLayoutEffect, useState } from "react";

interface Dimensions {
	width: number;
	height: number;
}

export const useDimensions = (): Dimensions => {
	const [dimensions, setDimensions] = useState<Dimensions>({
		width: typeof window !== "undefined" ? window.innerWidth : 0,
		height: typeof window !== "undefined" ? window.innerHeight : 0,
	});

	useLayoutEffect(() => {
		setDimensions({
			width: window.innerWidth,
			height: window.innerHeight,
		});
	}, []);

	useEffect(() => {
		const handleResize = (): void => {
			setDimensions({
				width: window.innerWidth,
				height: window.innerHeight,
			});
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return dimensions;
};
