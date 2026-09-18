"use client";

import BarcodePattern from "../miscellaneous/barcode-pattern";
import ProcessContent from "../sub-sections/process-content";

export default function ProcessSection() {
	return (
		<section id="process" className="px-2 relative z-10 md:px-6  pb-20">
			{/* Barcode banner */}
			<BarcodePattern />

			{/* Main content */}
			<ProcessContent />
		</section>
	);
}
