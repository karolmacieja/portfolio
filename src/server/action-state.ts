/** Result of a form server action; `error` is a full message key (e.g. "templates.errors.slugTaken"). */
export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Values for the message (e.g. { tier: "pro" }). */
  errorValues?: Record<string, string>;
  values?: Record<string, string>;
};

export function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<
    string,
    string
  >;
}
