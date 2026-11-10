import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The built frontend is served from the deployment's .convex.site root by the static
// hosting component. Any HTTP endpoints added later (convex/http.ts) live under /api.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });

export default app;
