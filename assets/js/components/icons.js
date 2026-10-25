const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  visit:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6m-6 4h6m-6 4h3"/>',
  diagnosis:
    '<path d="M9 3H5v6a4 4 0 0 0 8 0V3H9m0 10v3a5 5 0 0 0 10 0v-3"/><circle cx="19" cy="10" r="3"/>',
  treatment: '<path d="M9 3h6v5h5v7h-5v6H9v-6H4V8h5z"/>',
  medication:
    '<path d="M8 3a5 5 0 0 1 7 0l6 6a5 5 0 0 1-7 7l-6-6a5 5 0 0 1 0-7ZM11 6l7 7" transform="rotate(90 12 12)"/>',
  doctor:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3M9 19h6m-3-3v6"/>',
  clinic: '<path d="M4 21V5h16v16M9 21v-5h6v5M9 8h6m-3-3v6M2 21h20"/>',
  document: '<path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8m-8 4h6"/>',
  timeline:
    '<path d="M6 3v18m5-15h9m-9 6h6m-6 6h9"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 5h3m4 0h3"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
};
export const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.document}</svg>`;
