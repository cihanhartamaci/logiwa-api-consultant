/** Renders AIntegration with a distinct accent on “AI”. */
export default function BrandName({ className = '', as: Tag = 'span' }) {
  return (
    <Tag className={`brand-name ${className}`.trim()}>
      <span className="brand-ai">AI</span>
      <span className="brand-rest">ntegration</span>
    </Tag>
  );
}
