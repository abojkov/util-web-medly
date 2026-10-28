export function filePicker({ id, name, accept, required = false }) {
  return `<div class="file-picker"><input class="file-picker-input" type="file" id="${id}" ${name ? `name="${name}"` : ""} accept="${accept}" ${required ? "required" : ""} aria-describedby="${id}-selected"><label class="file-picker-action" for="${id}">Choose file</label><span class="file-picker-name" id="${id}-selected" aria-live="polite">No file selected</span></div>`;
}

export function bindFilePicker(input) {
  const name = input
    .closest(".file-picker")
    ?.querySelector(".file-picker-name");
  if (!name) return;
  const update = () => {
    name.textContent = input.files.length
      ? input.files.length === 1
        ? input.files[0].name
        : `${input.files.length} files selected`
      : "No file selected";
  };
  input.addEventListener("change", update);
  update();
}
