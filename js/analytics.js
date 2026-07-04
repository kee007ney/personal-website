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