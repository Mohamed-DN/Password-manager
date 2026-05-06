import { betterAuth } from "better-auth";
import { pool } from "./db.js";
import { jwt } from "better-auth/plugins/jwt";

export const auth = betterAuth({
  basePath: "/api/auth",
  database: pool,
  emailAndPassword: {
    enabled: true
  },
  plugins: [
    jwt()
  ],
  trustedOrigins: ["http://localhost:5173", "http://localhost:5174"],
  session: {
    expiresIn: 60 * 60, // 1 hour in seconds
    cookieCache: {
      enabled: true,
      maxAge: 300 // 5 minutes
    }
  }
});
