/**
 * Renders a legal document written in a tiny, safe markup: "## " headings, "- " list items and paragraphs
 * separated by blank lines. Everything is plain text (no HTML from the admin ever reaches the page).
 */
export function LegalText({ content }: { content: string }) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="grid gap-4 leading-relaxed" data-testid="legal-text">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (!lines.length) return null;
        if (lines.length === 1 && lines[0]!.startsWith("## ")) {
          return (
            <h2 key={index} className="mt-4 text-xl font-semibold">
              {lines[0]!.slice(3)}
            </h2>
          );
        }
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="grid list-disc gap-1 pl-6">
              {lines.map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line">
            {lines.join("\n")}
          </p>
        );
      })}
    </div>
  );
}
