import React from "react";
import { AtSign, Code, MessageCircle, Send } from "lucide-react";

const LINKS = [
	{
		href: "#",
		icon: <MessageCircle />,
	},
	{
		href: "#",
		icon: <AtSign />,
	},
	{
		href: "#",
		icon: <Code />,
	},
];
const Footer = () => {
	return (
		<footer className="w-screen bg-black py-4 ">
			<div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:flex-row">
				<p className="text-blue-50 text-center text-sm md:text-left">
					© 2024 Noctis. All rights reserved
				</p>

				<div className="flex justify-center gap-4 md:justify-start">
					{LINKS.map((link, index) => (
						<a
							key={index}
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-white transition-colors duration-300 ease-in-out hover:text-violet-200"
						>
							{link.icon}
						</a>
					))}
				</div>
				<a
					href="#"
					className="text-white transition-colors duration-300 ease-in-out hover:text-violet-200 text-center md:text-right text-sm"
				>
					Privacy Policy
				</a>
			</div>
		</footer>
	);
};

export default Footer;
