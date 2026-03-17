import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { userRoutes } from "./routes/users";

const app = new Elysia()
  .use(swagger())
  .use(userRoutes)
  .listen(3000);

console.log(`Server running at ${app.server?.hostname}:${app.server?.port}`);
