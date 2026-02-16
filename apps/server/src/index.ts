import { auth } from "@my-better-t-app/auth";
import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import mvpRoute from "./routes/mvp";

const app = new Hono();

app.use(logger());
console.log("Server starting with CORS_ORIGIN:", env.CORS_ORIGIN);

app.use(
  "/*",
  cors({
    origin: (origin) => origin || env.CORS_ORIGIN, // Allow all origins (Hackathon mode)
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-user-id", "X-User-Id"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/mvp", mvpRoute);

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
