// Server component. Pure data — no cookies, no URL read — so it stays inside the
// static shell under Cache Components rather than streaming as a hole. That matters:
// a crawler that gives up before the stream finishes still sees the markup.
//
// `dangerouslySetInnerHTML` is the documented way to emit JSON-LD in React; a text
// child would get HTML-escaped and produce invalid JSON. The `<` escape guards
// against a stray "</script>" inside any string field terminating the block early.

export default function JsonLd({ data }: { data: object | object[] }) {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(data).replace(/</g, "\\u003c"),
			}}
		/>
	);
}
