// Shared 24px grid with balanced shapes and room for rounded strokes.
const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.75"/><rect x="14" y="3" width="7" height="7" rx="1.75"/><rect x="3" y="14" width="7" height="7" rx="1.75"/><rect x="14" y="14" width="7" height="7" rx="1.75"/>',
  visit:
    '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h4"/>',
  diagnosis:
    '<path d="M5 3v6a4 4 0 0 0 8 0V3M4 3h2m6 0h2M9 13v3a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="3"/>',
  treatment:
    '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  medication:
    '<g transform="rotate(45 12 12)"><rect x="8" y="2" width="8" height="20" rx="4"/><path d="M8 12h8"/></g>',
  doctor:
    '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M10 17h4m-2-2v4"/>',
  clinic:
    '<path d="M5 21V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16M3 21h18M10 21v-5h4v5M10 10h4m-2-2v4"/>',
  document:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M8 13h8m-8 4h6"/>',
  timeline:
    '<path d="M6 3v2m0 4v6m0 4v2M11 7h10m-10 5h7m-7 5h10"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18M7 15h3m4 0h3"/>',
  settings:
    '<path d="M10.35 2.64 L13.65 2.64 L13.69 4.69 L15.97 5.64 L17.45 4.22 L19.78 6.55 L18.36 8.03 L19.31 10.31 L21.36 10.35 L21.36 13.65 L19.31 13.69 L18.36 15.97 L19.78 17.45 L17.45 19.78 L15.97 18.36 L13.69 19.31 L13.65 21.36 L10.35 21.36 L10.31 19.31 L8.03 18.36 L6.55 19.78 L4.22 17.45 L5.64 15.97 L4.69 13.69 L2.64 13.65 L2.64 10.35 L4.69 10.31 L5.64 8.03 L4.22 6.55 L6.55 4.22 L8.03 5.64 L10.31 4.69Z"/><circle cx="12" cy="12" r="3"/>',
  plus:
    '<path d="M12 5v14M5 12h14"/>',
  arrow:
    '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  open:
    '<path d="M14 3h7v7m0-7L11 13M10 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  edit:
    '<path d="m14.5 5.5 4 4M4 20l5-1L20 8a2.83 2.83 0 0 0-4-4L5 15Z"/>',
  shield:
    '<path d="m12 3-8 3v6c0 5 8 9 8 9s8-4 8-9V6ZM8 12l3 3 5-6"/>',
  more:
    '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></g>',
  search:
    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5.5 5.5"/>',
};
export const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.document}</svg>`;
