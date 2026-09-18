import { Fragment } from "react";

// Words wrapped for per-word reveals. The sections animate `.word` spans with
// GSAP; a visitor with reduced motion never sees them move, so the markup has
// to read correctly as plain text — hence real spaces between the spans.

type SplitTextProps = {
  children: string;
};

export default function SplitText({ children }: SplitTextProps) {
  const words = children.split(" ").filter(Boolean);

  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="word inline-block">{word}</span>
          {index < words.length - 1 && " "}
        </Fragment>
      ))}
    </>
  );
}
