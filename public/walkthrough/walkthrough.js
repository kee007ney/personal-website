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

/*
task.classList.add("task-highlight");

task.scrollIntoView({
  behavior: "smooth",
  block: "center"
});

window.setTimeout(() => {
  task.classList.remove("task-highlight");
}, 1200);
*/

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-full-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
const zoomIn = document.querySelector("[data-lightbox-zoom-in]");
const zoomOut = document.querySelector("[data-lightbox-zoom-out]");

let lightboxZoom = 1;

document.querySelectorAll("[data-lightbox-src]").forEach((image) => {
  image.addEventListener("click", () => {
    lightboxZoom = 1;
    lightboxImage.src = image.dataset.lightboxSrc;
    lightboxImage.alt = image.alt;
//    lightboxImage.style.width = "min(95vw, 1800px)";
    lightboxImage.style.transform = "scale(1)";
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  });
});

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = "";
  document.body.style.overflow = "";
}

lightboxClose?.addEventListener("click", closeLightbox);

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

/*
zoomIn?.addEventListener("click", () => {
  lightboxZoom = Math.min(lightboxZoom + 0.25, 3);
  lightboxImage.style.width = `${95 * lightboxZoom}vw`;
});

zoomOut?.addEventListener("click", () => {
  lightboxZoom = Math.max(lightboxZoom - 0.25, 0.75);
  lightboxImage.style.width = `${95 * lightboxZoom}vw`;
});
*/

zoomIn?.addEventListener("click", () => {
  lightboxZoom = Math.min(lightboxZoom + 0.25, 3);
  lightboxImage.style.transform = `scale(${lightboxZoom})`;
});

zoomOut?.addEventListener("click", () => {
  lightboxZoom = Math.max(lightboxZoom - 0.25, 0.75);
  lightboxImage.style.transform = `scale(${lightboxZoom})`;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !lightbox.hidden) {
    closeLightbox();
  }
});