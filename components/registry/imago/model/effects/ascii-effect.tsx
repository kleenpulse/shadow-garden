"use client";

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { AsciiEffect } from "three/addons/effects/AsciiEffect.js";

type AsciiEffectProps = {
	characters?: string;
	invert?: boolean;
	color?: boolean;
	resolution?: number;
	fgColor?: string;
	bgColor?: string;
};

export function AsciiEffectComponent({
	characters = " .:-+*=%@#",
	invert = true,
	color = false,
	resolution = 0.15,
	fgColor = "white",
	bgColor = "transparent",
}: AsciiEffectProps) {
	const { gl, scene, camera, size } = useThree();
	const effectRef = useRef<AsciiEffect | null>(null);
	const observerRef = useRef<MutationObserver | null>(null);

	useEffect(() => {
		// Create ASCII effect
		const effect = new AsciiEffect(gl, characters, {
			invert,
			color,
			resolution,
		});

		effect.setSize(size.width, size.height);
		
		// Apply comprehensive styling to ensure full screen coverage
		const domElement = effect.domElement;
		domElement.style.color = fgColor;
		domElement.style.backgroundColor = bgColor;
		domElement.style.position = "fixed";
		domElement.style.top = "0";
		domElement.style.left = "0";
		domElement.style.right = "0";
		domElement.style.bottom = "0";
		domElement.style.width = "100vw";
		domElement.style.height = "100vh";
		domElement.style.margin = "0";
		domElement.style.padding = "0";
		domElement.style.overflow = "hidden";
		domElement.style.pointerEvents = "none";
		domElement.style.zIndex = "1";

		// Function to fix table dimensions
		const fixTableDimensions = () => {
			const table = domElement.querySelector("table");
			if (table) {
				table.style.width = "100%";
				table.style.height = "100%";
				table.style.tableLayout = "fixed";
				table.style.display = "block";
				
				const td = table.querySelector("td");
				if (td) {
					// Use setProperty with !important to override inline styles
					td.style.setProperty("width", "100vw", "important");
					td.style.setProperty("height", "100vh", "important");
					td.style.setProperty("max-width", "100vw", "important");
					td.style.setProperty("max-height", "100vh", "important");
					td.style.setProperty("display", "block", "important");
					td.style.setProperty("overflow", "hidden", "important");
				}
			}
		};

		// Initial fix
		fixTableDimensions();

		// Watch for DOM changes (AsciiEffect updates innerHTML on each render)
		observerRef.current = new MutationObserver(() => {
			fixTableDimensions();
		});

		observerRef.current.observe(domElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style"],
		});

		effectRef.current = effect;

		// Hide the original canvas and append ASCII effect
		gl.domElement.style.display = "none";
		gl.domElement.parentNode?.appendChild(domElement);

		return () => {
			gl.domElement.style.display = "block";
			observerRef.current?.disconnect();
			domElement.remove();
		};
	}, [gl, characters, invert, color, resolution, fgColor, bgColor, size]);

	useEffect(() => {
		if (effectRef.current) {
			effectRef.current.setSize(size.width, size.height);
		}
	}, [size]);

	useFrame(() => {
		if (effectRef.current) {
			effectRef.current.render(scene, camera);
		}
	}, 1);

	return null;
}
