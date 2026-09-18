import HexagonIcon from "../icons/hexagon-icon";
import EagleIcon from "../icons/hexagon-icon";
import { NavStateProps } from "../types/nav-states.types";
import { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import { AtSign, Send } from "lucide-react";
import { asset } from "../../_shared/cdn";

type LinkProps = {
	name: string;
	link: NavStateProps["activeLink"];
};
type HowToBuyProps = {
	id: number;
	image: string;
	title: string;
	description: string;
};
export interface Socials {
	id: number;
	link: string;
	icon:
		| ForwardRefExoticComponent<
				SVGProps<SVGSVGElement> & RefAttributes<SVGSVGElement>
		  >
		| LucideIcon;
}

export const SOCIALS: Socials[] = [
	{
		id: 1,
		link: "https://twitter.com/TronGOW",
		icon: AtSign,
	},
	{
		id: 2,
		link: "https://twitter.com/TronGOW",
		icon: Send,
	},
	{
		id: 3,
		link: "https://twitter.com/TronGOW",
		icon: HexagonIcon,
	},
	{
		id: 4,
		link: "https://twitter.com/TronGOW",
		icon: EagleIcon,
	},
];

export const NAV_LINKS: LinkProps[] = [
	// { name: "About", link: "about" },
	{ name: "How to buy", link: "how-to-buy" },
	{ name: "Trade now", link: "trade-now" },
];

export const HOW_TO_BUY: HowToBuyProps[] = [
	{
		id: 1,
		image: asset("jinlong/coins-gold-coin"),
		title: "1. CREATE A WALLET",
		description:
			"Download and install TronLink Wallet for iOS, Android or as a Chrome Extension.",
	},
	{
		id: 2,
		image: asset("jinlong/coins-gold-coin-2"),
		title: "2. GET SOME $TRX",
		description:
			"Get $TRX tokens from your favorite Cex like CoinBase and Binance and send them to your Tronlink wallet",
	},
	{
		id: 3,
		image: asset("jinlong/coins-gold-coin-3"),
		title: "3. SWAP $TRX FOR $JIN",
		description:
			"Click on the button below, connect your wallet, and press SWAP! BOOM! You are a $JIN holder!",
	},
];
