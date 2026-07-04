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