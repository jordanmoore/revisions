import { defineConfig } from "vite";

// Served from the root in dev; set VITE_BASE=/revisions/ when building for jordanm.co.uk/revisions.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
});
