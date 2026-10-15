import { onRequestPost } from "../server/send-email.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/send-email") {
      if (request.method !== "POST") {
        return Response.json({ error: "Méthode non autorisée." }, { status: 405 });
      }
      return onRequestPost({ request, env });
    }

    return env.ASSETS.fetch(request);
  }
};
