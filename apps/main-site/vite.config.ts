import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Accept the production host locally (e.g. via /etc/hosts) so deep links
    // can be tested against https://chatslock.com before deploying.
    allowedHosts: ["chatslock.com", "www.chatslock.com"],
  },
})
