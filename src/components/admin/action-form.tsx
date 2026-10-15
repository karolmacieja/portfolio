"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A small staff form: hidden fields, optional inputs, one submit button, optional confirmation and
 * the action's success/error message.
 */
export function ActionForm({
  action,
  hidden,
  label,
  success,
  confirm,
  variant = "outline",
  children,
  className,
  testId,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  success?: string;
  confirm?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form
      action={formAction}
      className={className ?? "grid gap-2"}
      data-testid={testId}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div>
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {label}
        </Button>
      </div>
      <FormMessage state={state} success={success} />
    </form>
  );
}
