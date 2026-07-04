window.analytics = {
  track(event, properties = {}) {
    try {
      if (window.posthog?.capture) {
        window.posthog.capture(event, properties);
      }
    } catch (err) {
      console.warn("Analytics error:", err);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // External links
  document.querySelectorAll("a[href^='http']").forEach(link => {
    link.addEventListener("click", () => {
      analytics.track("external_link_clicked", {
        href: link.href,
        text: link.textContent.trim(),
        page: window.location.pathname
      });
    });
  });

  // Email clicks
  document.querySelectorAll("a[href^='mailto:']").forEach(link => {
    link.addEventListener("click", () => {
      analytics.track("email_clicked", {
        page: window.location.pathname
      });
    });
  });

  // Project/detail cards
  document.querySelectorAll("details").forEach(detail => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;

      const title =
        detail.querySelector("h2, h3, summary")?.textContent.trim() ||
        "Unknown";

      analytics.track("detail_opened", {
        title,
        page: window.location.pathname
      });
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname;

  const cleanText = el =>
    el?.textContent?.replace(/\s+/g, " ").trim() || "";

  // Project cards
  document.querySelectorAll(".project-card").forEach(card => {
    card.addEventListener("click", () => {
      analytics.track("project_selected", {
        project: card.dataset.project || cleanText(card.querySelector("h3")),
        title: cleanText(card.querySelector("h3")),
        page
      });
    });
  });

  // Publications
  document.querySelectorAll(".publist a").forEach(link => {
    link.addEventListener("click", () => {
      analytics.track("publication_clicked", {
        title: cleanText(link.closest("li")) || cleanText(link),
        href: link.href,
        section: link.closest("section")?.id || "",
        page
      });
    });
  });

  // Teaching PDFs
  document.querySelectorAll("a[href$='.pdf']").forEach(link => {
    link.addEventListener("click", () => {
      analytics.track("teaching_pdf_clicked", {
        title: cleanText(link),
        href: link.href,
        page
      });
    });
  });

  // Email
  document.querySelectorAll("a[href^='mailto:']").forEach(link => {
    link.addEventListener("click", () => {
      analytics.track("email_clicked", { page });
    });
  });

  // External links
  document.querySelectorAll("a[href^='http']").forEach(link => {
    const url = new URL(link.href);
    if (url.hostname === window.location.hostname) return;

    link.addEventListener("click", () => {
      analytics.track("external_link_clicked", {
        label: cleanText(link),
        href: link.href,
        domain: url.hostname,
        page
      });
    });
  });

  // Section exposure, once per section per page load
  const seenSections = new Set();

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const section = entry.target;
      const id = section.id || cleanText(section.querySelector("h1, h2"));
      if (!id || seenSections.has(id)) return;

      seenSections.add(id);

      analytics.track("section_viewed", {
        section: id,
        title: cleanText(section.querySelector("h1, h2")),
        page
      });
    });
  }, { threshold: 0.35 });

  document.querySelectorAll("section[id]").forEach(section => {
    observer.observe(section);
  });
});