"use client";

import { useActionState } from "react";
import { createClientBoard, type FormState } from "@/app/(app)/actions";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: FormState = { error: null };

export function CreateClientForm() {
  const [state, action, pending] = useActionState(createClientBoard, initialState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Client name</span>
        <input
          className={inputClass}
          name="name"
          required
          maxLength={80}
          placeholder="Harbor & Co."
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button className={`${buttonClass} self-start`} type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}
