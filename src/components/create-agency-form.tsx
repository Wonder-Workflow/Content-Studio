"use client";

import { useActionState } from "react";
import { createAgency, type FormState } from "@/app/(app)/actions";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: FormState = { error: null };

export function CreateAgencyForm() {
  const [state, action, pending] = useActionState(createAgency, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Studio name</span>
        <input
          className={inputClass}
          name="name"
          required
          maxLength={80}
          placeholder="Northroom"
          autoComplete="organization"
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button className={`${buttonClass} self-start`} type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create studio"}
      </button>
    </form>
  );
}
