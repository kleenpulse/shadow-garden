import { NavStateProps } from "../types/nav-states.types";
import type { LucideIcon } from "lucide-react";
import { IntegrationProps } from "../types/integration";
import TrendsIcon from "../icons/trends-icon";
import TrackingIcon from "../icons/tracking-icon";
import AnalysisIcon from "../icons/analysis-icon";
import { asset } from "../../_shared/cdn";

type LinkProps = {
	name: string;
	link: NavStateProps["activeLink"];
};

export interface Socials {
	id: number;
	link: string;
	icon: LucideIcon;
}
export interface FeaturesProps {
	id: number;
	icon: LucideIcon;
	title: string;
	description: string;
}

interface FAQItem {
	question: string;
	answer: string;
	id: number;
	hasLink?: boolean;
}

export const FAQS: FAQItem[] = [
	{
		id: 1,
		question: "What is Signal?",
		answer:
			"Signal is an autonomous monitoring agent designed to scan market live order flow (CAs) and provide real-time sentiment analysis based on group reactions.",
	},
	{
		id: 2,
		question: "How do I integrate Signal into my workspace?",
		answer: `Simply click the "Start free" button on our website and follow the integration guide provided in the integration guide.`,
	},

	{
		id: 3,
		question: "How can I join Signal's crew?",
		answer:
			"Join our Telegram channel and follow us on social media to stay updated on our latest developments. You can also participate in our token sale or contribute as a developer.",
	},
	{
		id: 4,
		question: "How does Signal determine sentiment?",
		answer:
			"Signal analyzes chat reactions within each group, categorizing sentiment as bullish, bearish, farming potential, or neutral. These insights evolve as more groups scan the token.",
	},

	{
		id: 5,
		hasLink: true,
		question: "Is Signal free to use?",
		answer: `Signal offers core features for free, with premium tiers available for advanced analytics and custom sentiment reports.`,
	},
];

export const METRICS = [
	{
		id: 1,
		percentage: 45,
		color: "#4ADE80",
		description: "Bullish Sentiment: 45% positive discussions.",
	},
	{
		id: 2,
		percentage: 30,
		color: "#FB4C3C",
		description: "Bearish Sentiment: 30% negative reactions",
	},
	{
		id: 3,
		percentage: 10,
		color: "#96CEFF",
		description: "Neutral Sentiment: 10% indifferent chatter.",
	},
];

export const FEATURES: FeaturesProps[] = [
	{
		id: 1,
		icon: AnalysisIcon,
		title: "Track Group Scans",
		description: "Monitor how many and which groups scan specific tokens.",
	},
	{
		id: 2,
		icon: TrackingIcon,
		title: "Sentiment Analysis",
		description:
			"Analyze chat reactions across multiple groups and identify sentiment trends.",
	},
	{
		id: 3,
		icon: TrendsIcon,
		title: "Real-Time Visuals",
		description:
			"Instantly access dashboards displaying token sentiment, historical trends, and key insights",
	},
];

export const NAV_LINKS: LinkProps[] = [
	{ name: "About", link: "about" },
	{ name: "Integration", link: "integration" },
	{ name: "How it works", link: "how-it-works" },
	{ name: "Features", link: "features" },
	{ name: "FAQ", link: "faq" },
];

export const INTEGRATION: IntegrationProps[] = [
	{
		id: 1,
		hasLink: true,
		image: asset("signal/integration-guide-image1"),
		link: "#",
		description: `Visit the integration guide:`,
	},
	{
		id: 2,
		image: asset("signal/integration-guide-image2"),
		description:
			"Follow the detailed step-by-step instructions to integrate the agent with your workspace.",
	},
	{
		id: 3,
		image: asset("signal/integration-guide-image3"),
		description:
			"Set up the necessary permissions and configure the agent using the provided guides.",
	},
	{
		id: 4,
		image: asset("signal/integration-guide-image4"),
		description: "Start scanning and analyzing market CAs in real-time.",
	},
	{
		id: 5,
		image: asset("signal/integration-guide-image5"),
		description: "Use the /scan command to get started!",
	},
];
export const METRICS_FEATURES: IntegrationProps[] = [
	{
		id: 1,
		image: asset("signal/metrics-metric-image1"),
		title: "Number of Scans",
		description:
			"Displays how many individual groups have scanned a market CA, helping assess its popularity",
	},
	{
		id: 2,
		title: "Notable Group Scans",
		image: asset("signal/metrics-metric-image2"),
		description:
			"Highlights scans performed by influential or well-known market groups, offering insight into potential token credibility.",
	},
	{
		id: 3,
		title: "Sentiment Breakdown",
		image: asset("signal/metrics-metric-image3"),
		description:
			"Provides a comprehensive analysis of group sentiment (bullish, bearish, farming, neutral) to understand how the token is perceived.",
	},
];
export const HOWITWORKS: IntegrationProps[] = [
	{
		id: 1,
		image: asset("signal/how-images-how-image1"),
		title: "Track Scans Across Groups",
		description:
			"Signal monitors how many individual groups scan a specific market CA and identifies when notable groups perform scans.",
	},
	{
		id: 2,
		image: asset("signal/how-images-how-image2"),
		title: "Sentiment Analysis Per Group",
		description:
			"Every group scan triggers analysis of chat reactions, determining if the sentiment is bullish, bearish, farming-focused, or neutral.",
	},
	{
		id: 3,
		image: asset("signal/how-images-how-image3"),
		title: "Aggregate Sentiment Trends",
		description:
			"As multiple groups scan the same CA, Signal aggregates and refines the overall sentiment, providing an evolving sentiment profile for the token.",
	},
	{
		id: 4,
		image: asset("signal/how-images-how-image4"),
		title: "Historical Sentiment Tracking",
		description:
			"The bot tracks sentiment trends over time, delivering valuable historical insights into market behavior.",
	},
	{
		id: 5,
		image: asset("signal/how-images-how-image5"),
		title: "Instant Sentiment Visualization",
		description:
			"Real-time visual dashboards make it easy to interpret data and spot market trends instantly.",
	},
];
