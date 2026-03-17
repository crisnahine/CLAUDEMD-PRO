import { Elysia, t } from "elysia";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .get("/", () => [{ id: 1, name: "Alice" }])
  .post("/", ({ body }) => ({ id: 2, ...body }), {
    body: t.Object({ name: t.String(), email: t.String() }),
  });
