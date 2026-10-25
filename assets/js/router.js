export function route() {
  const [page, id] = location.hash.replace(/^#\/?/, "").split("/");
  return { page: page || "dashboard", id };
}
export function initRouter(render) {
  addEventListener("hashchange", () => {
    render();
    document.querySelector("#main").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
}
