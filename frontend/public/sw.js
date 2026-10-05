self.addEventListener("push", (event) => {
  let data = {
    title: "Lesson processing complete",
    body: "Your uploaded materials are ready.",
    url: "/upload-lesson",
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (_) {
    // keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Lesson ready", {
      body: data.body || "Processing finished.",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: data.url || "/upload-lesson" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "yes";

  if (data.type === "cognitive-load-personalization") {
    if (action === "no") {
      return;
    }
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          const payload = {
            type: "cognitive-load-personalization",
            action: "yes",
            kind: data.kind || "highLoad",
            courseId: data.courseId,
            subsectionId: data.subsectionId,
            loadLevel: data.loadLevel,
          };
          for (const client of clients) {
            client.postMessage(payload);
            if ("focus" in client) {
              return client.focus();
            }
          }
          return self.clients.openWindow(data.url || "/course");
        })
    );
    return;
  }

  const url = data.url || "/upload-lesson";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
