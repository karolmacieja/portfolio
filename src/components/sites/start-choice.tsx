import Link from "next/link";

/**
 * Starting point picker shown as cards: radio options submitted with the form, plus optional link
 * cards (e.g. "from a template", which leads to the gallery).
 */
export function StartChoice({
  name,
  legend,
  options,
  defaultValue,
  links = [],
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; description: string }[];
  defaultValue: string;
  links?: { href: string; label: string; description: string }[];
}) {
  const card = "grid h-full gap-1 rounded-lg border p-4 text-sm transition-colors hover:border-foreground/40";
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={`${card} cursor-pointer has-[:checked]:border-foreground has-[:checked]:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name={name}
                value={option.value}
                defaultChecked={option.value === defaultValue}
                className="accent-foreground"
                data-testid={`${name}-${option.value}`}
              />
              {option.label}
            </span>
            <span className="text-muted-foreground">{option.description}</span>
          </label>
        ))}
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={card}>
            <span className="font-medium">{link.label} →</span>
            <span className="text-muted-foreground">{link.description}</span>
          </Link>
        ))}
      </div>
    </fieldset>
  );
}
