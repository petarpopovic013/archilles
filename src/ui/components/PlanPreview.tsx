import Image from "next/image";

/** Illustration only; actual findings appear in the review workspace. */
export function PlanPreview() {
  return (
    <figure className="product-preview">
      <Image
        src="/images/office-plan.svg"
        alt="Example office floor plan with rooms, desks, door openings and circulation areas"
        width={1000}
        height={720}
        priority
        className="preview-plan"
      />
      <figcaption>Example office plan <span>Illustrative drawing</span></figcaption>
    </figure>
  );
}
