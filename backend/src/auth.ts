import { betterAuth } from "better-auth";
import { pool } from "./db";
import { jwt } from "better-auth/plugins/jwt";

export const auth = betterAuth({
  database: {
    db: pool,
    type: "postgres"
  },
  emailAndPassword: {
    enabled: true
  },
  plugins: [
    jwt()
  ],
  session: {
    expiresIn: "1h",
    cookieCache: {
      enabled: true,
      maxAge: 3600
    }
  }
});
