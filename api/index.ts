// api/index.ts
// Minimal Vercel serverless adapter that forwards requests to the Express app.
// Important: import the Express `app` from the module that exports it (artifacts/api-server/src/app).
// Do NOT import the module that calls app.listen() (artifacts/api-server/src/index.ts).
import app from "../artifacts/api-server/src/app";

export default function handler(req: any, res: any) {
  // Forward the request/response to the Express app instance.
  return app(req, res);
}
