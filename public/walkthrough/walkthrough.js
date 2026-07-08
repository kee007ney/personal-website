// walkthrough.js

const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("[data-nav]");
const backToTop = document.querySelector("[data-back-to-top]");

navToggle?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

window.addEventListener("scroll", () => {
  backToTop.classList.toggle("visible", window.scrollY > 600);
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});


document.querySelectorAll("[data-open-task]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const taskId = link.dataset.openTask;
    const task = document.getElementById(taskId);
    if (!task) return;

    const parentZone = task.closest(".zone-card");
    if (parentZone) parentZone.open = true;

    const wasOpen = task.open;
    task.open = !wasOpen;

    if (!wasOpen) {
      task.classList.add("task-highlight");

      task.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      window.setTimeout(() => {
        task.classList.remove("task-highlight");
      }, 1200);
    } else {
      task.classList.remove("task-highlight");
    }
  });
});

task.classList.add("task-highlight");

task.scrollIntoView({
  behavior: "smooth",
  block: "center"
});

window.setTimeout(() => {
  task.classList.remove("task-highlight");
}, 1200);