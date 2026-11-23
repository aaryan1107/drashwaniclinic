// Patient self-service account deletion, opened from the profile menu.
// The patient types DELETE to confirm; the delete-account Edge Function does the deletion.
import { useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Trash2 } from "lucide-react";

export const DELETE_CONFIRM_WORD = "DELETE";

// container: an element inside the app stage, so the dialog inherits the theme colours.
export default function DeleteAccountDialog({ open, onOpenChange, onDelete, container }) {
  const [typed, setTyped] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const ready = typed.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  const close = (next) => {
    if (state.busy) return;
    if (!next) { setTyped(""); setState({ busy: false, error: "" }); }
    onOpenChange(next);
  };

  const confirm = async () => {
    if (!ready || state.busy) return;
    setState({ busy: true, error: "" });
    try {
      await onDelete(typed.trim());
    } catch (error) {
      setState({ busy: false, error: error?.message || "We couldn’t delete your account. Please try again." });
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={close}>
      <AlertDialog.Portal container={container}>
        <AlertDialog.Backdrop className="tut-backdrop delete-backdrop" />
        <AlertDialog.Popup className="tut delete-account">
          <span className="tut-icon delete-icon"><Trash2 size={24} aria-hidden="true" /></span>
          <AlertDialog.Title render={<h2 />}>Delete your account?</AlertDialog.Title>
          <AlertDialog.Description render={<div />}>
            <p>This deletes your account straight away and cannot be undone. It removes your login, medical profile, readings, bookings, prescriptions, care plan and visit records.</p>
            <p>Tax law requires the clinic to keep a record of fees paid (your name, the amount, the date and the payment reference) for 7 years. Your email and phone number are removed from it.</p>
          </AlertDialog.Description>
          <label className="delete-confirm">
            <span>Type {DELETE_CONFIRM_WORD} to confirm</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters"
              autoComplete="off" spellCheck={false} disabled={state.busy} aria-invalid={Boolean(state.error)} />
          </label>
          {state.error && <p role="alert" className="delete-error">{state.error}</p>}
          <div className="delete-actions">
            <AlertDialog.Close className="delete-cancel" disabled={state.busy}>Keep my account</AlertDialog.Close>
            <button type="button" className="delete-go" disabled={!ready || state.busy} onClick={confirm}>
              {state.busy ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
