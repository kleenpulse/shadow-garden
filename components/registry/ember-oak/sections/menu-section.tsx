import React, { useState } from "react";
import { sliderLists } from "../lib/constants";
import { cn } from "@/lib/utils";
import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Ornament from "../miscellaneous/ornament";

export default function Menu() {
	const contentRef = React.useRef(null);

	const [currentIndex, setCurrentIndex] = useState(0);
	const totalCocktails = sliderLists.length;

	const gotoSlider = (index: number) => {
		const newIndex = (index + totalCocktails) % totalCocktails; // Wrap around if index exceeds total
		setCurrentIndex(newIndex);
	};

	const getCocktailAt = (indexOffset: number) => {
		return sliderLists[
			(currentIndex + indexOffset + totalCocktails) % totalCocktails
		];
	};

	const currentCocktail = getCocktailAt(0);
	const prevCocktail = getCocktailAt(-1);
	const nextCocktail = getCocktailAt(1);

	useGSAP(() => {
		gsap.fromTo(
			"#title",
			{
				opacity: 0,
			},
			{
				opacity: 1,
				duration: 1,
			}
		);
		gsap.fromTo(
			".cocktail img",
			{ opacity: 0, xPercent: -100 },
			{
				opacity: 1,
				xPercent: 0,
				duration: 1,
				ease: "power1.inOut",
			}
		);

		gsap.fromTo(
			".details h2",
			{ yPercent: 100, opacity: 0 },
			{ yPercent: 0, opacity: 1, duration: 1, ease: "power1.inOut" }
		);
		gsap.fromTo(
			".details p",
			{ yPercent: 100, opacity: 0 },
			{ yPercent: 0, opacity: 1, duration: 1, ease: "power1.inOut" }
		);
	}, [currentIndex]);

	return (
		<section id="menu" aria-labelledby="menu-heading">
			<Ornament family="leaf" seed="slider-left" />
			<Ornament family="leaf" seed="slider-right" flip />

			<h2 className="sr-only" id="menu-heading">
				Cocktail Menu
			</h2>
			<nav className="cocktail-tabs" aria-label="Cocktail Navigation">
				{sliderLists.map((cocktail, index) => {
					const isActive = index === currentIndex; // Set the first cocktail as active by default
					return (
						<button
							key={cocktail.id}
							onClick={() => gotoSlider(index)}
							className={cn(
								"cocktail-tab",
								isActive
									? "text-white border-white"
									: "text-white/50 border-white/50"
							)}
							aria-label={`View ${cocktail.name} details`}
						>
							{/* <img src={cocktail.image} alt={cocktail.name} /> */}
							<span>{cocktail.name}</span>
						</button>
					);
				})}
			</nav>

			<div className="content">
				<div className="arrows">
					<button
						onClick={() => gotoSlider(currentIndex - 1)}
						className="text-left"
					>
						<span>{prevCocktail.name}</span>
						<ChevronRight />
					</button>
					<button
						onClick={() => gotoSlider(currentIndex - 1)}
						className="text-right"
					>
						<span>{nextCocktail.name}</span>
						<ChevronLeft />
					</button>
				</div>

				<div className="cocktail">
					<img src={currentCocktail.image} alt={currentCocktail.name} />
				</div>

				<div className="recipe">
					<div ref={contentRef} className="info">
						<p>Recipe for:</p>
						<p id="title">{currentCocktail.name}</p>
					</div>

					<div className="details">
						<h2>{currentCocktail.title}</h2>
						<p>{currentCocktail.description}</p>
					</div>
				</div>
			</div>
		</section>
	);
}
