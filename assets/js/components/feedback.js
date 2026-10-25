import { escapeHTML as e } from "../utils/format.js";
export function notify(message, danger = false) {
  const el = document.createElement("div");
  el.className = `notification ${danger ? "notification-error" : ""}`;
  el.textContent = message;
  if (danger) el.setAttribute("role", "alert");
  const notifications = document.querySelector("#notifications");
  notifications.append(el);
  while (notifications.children.length > 3)
    notifications.firstElementChild.remove();
  setTimeout(() => el.remove(), danger ? 12000 : 5000);
}
export function reportError(error) {
  notify(
    error?.name === "QuotaExceededError"
      ? "Your device storage is full. Export a backup, then free space before trying again. No changes were saved."
      : error?.message ||
          "Something went wrong. Your changes could not be saved. Please try again.",
    true,
  );
}
const dialog = () => document.querySelector("#modal");
let discard;
let busy = false;
let previousFocus;
export function showDialog(title, body, { onDiscard } = {}) {
  const el = dialog();
  if (el.open) el.close();
  else previousFocus = document.activeElement;
  busy = false;
  discard = onDiscard;
  el.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">YOUR HEALTH ARCHIVE</p><h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-close aria-label="Close dialog">×</button></div>${body}`;
  el.querySelector("[data-close]").onclick = requestClose;
  el.oncancel = (event) => {
    event.preventDefault();
    requestClose();
  };
  // Native dialog does not close on backdrop clicks. Escape follows the same unsaved-changes guard.
  el.showModal();
}
export function setDialogBusy(value) {
  busy = value;
  for (const element of dialog().querySelectorAll(
    "button, input, select, textarea",
  ))
    element.disabled = value;
}
export function closeDialog() {
  discard = undefined;
  busy = false;
  dialog().close();
  previousFocus?.focus();
}
export function requestClose() {
  if (!busy && (!discard || discard())) closeDialog();
}
export async function confirmAction(title, message, action, label = "Delete") {
  showDialog(
    title,
    `<p>${e(message)}</p><div class="dialog-actions"><button class="btn btn-light" id="confirm-cancel">Cancel</button><button class="btn btn-danger" id="confirm-action">${e(label)}</button></div>`,
  );
  dialog().querySelector("#confirm-cancel").onclick = closeDialog;
  dialog().querySelector("#confirm-action").onclick = async () => {
    setDialogBusy(true);
    try {
      await action();
      closeDialog();
    } catch (error) {
      setDialogBusy(false);
      reportError(error);
    }
  };
}
