"use client";

import { useActionState } from "react";
import { addAgencyMember, type FormState } from "@/app/(app)/actions";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: FormState = { error: null };

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addAgencyMember, initialState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Teammate email</span>
        <input
          className={inputClass}
          type="email"
          name="email"
          required
          placeholder="teammate@studio.com"
          autoComplete="email"
        />
      </label>
      <p className="text-xs leading-5 text-muted">
        They need an account first. Seats are equal — no roles.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-ink-soft">
          {state.message}
        </p>
      ) : null}
      <button className={`${buttonClass} self-start`} type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add teammate"}
      </button>
    </form>
  );
}
