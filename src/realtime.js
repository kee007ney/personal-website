export class ShoppingRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch { try { socket.close(1011, "Delivery failed"); } catch {} }
      }
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({
      userId: request.headers.get("X-Shopping-User") || "unknown",
      displayName: request.headers.get("X-Shopping-Name") || "Household member",
    });
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "connected", at: new Date().toISOString() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }

  webSocketClose() {}

  webSocketError(socket) {
    try { socket.close(1011, "Connection error"); } catch {}
  }
}

export async function connectToRoom(request, env, session) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return Response.json({ error: "WebSocket upgrade required." }, { status: 426 });
  }
  const headers = new Headers(request.headers);
  headers.set("X-Shopping-User", session.userId);
  headers.set("X-Shopping-Name", session.displayName);
  return env.SHOPPING_ROOM.getByName(session.householdId).fetch(new Request(request, { headers }));
}

export async function broadcast(env, householdId, type, detail = {}) {
  try {
    const room = env.SHOPPING_ROOM.getByName(householdId);
    const response = await room.fetch(
      "https://shopping-room.internal/broadcast",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          detail,
          at: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "Shopping live-update broadcast failed:",
        response.status,
      );
    }
  } catch (error) {
    console.error("Shopping live-update broadcast failed:", error);
  }
}

//export async function broadcast(env, householdId, type, detail = {}) {
//  const room = env.SHOPPING_ROOM.getByName(householdId);
//  await room.fetch("https://shopping-room.internal/broadcast", {
//    method: "POST",
//    headers: { "Content-Type": "application/json" },
//    body: JSON.stringify({ type, detail, at: new Date().toISOString() }),
//  });
//}
