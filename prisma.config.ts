import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma CLI config (Prisma 6). `.env` is loaded explicitly because the CLI does
// not auto-load it once a config file exists.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
