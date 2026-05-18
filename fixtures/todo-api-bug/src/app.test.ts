import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
});

describe("todo api", () => {
  it("creates a todo", async () => {
    const r = await request(app).post("/todos").send({ title: "buy milk" });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTypeOf("number");
    expect(r.body.title).toBe("buy milk");
    expect(r.body.completed).toBe(false);
  });

  it("lists todos", async () => {
    await request(app).post("/todos").send({ title: "one" });
    await request(app).post("/todos").send({ title: "two" });
    const r = await request(app).get("/todos");
    expect(r.status).toBe(200);
    expect(r.body.todos).toHaveLength(2);
    expect(r.body.todos[0].title).toBe("one");
  });

  it("updates completed and returns the UPDATED todo", async () => {
    const c = await request(app).post("/todos").send({ title: "x" });
    const r = await request(app)
      .patch(`/todos/${c.body.id}`)
      .send({ completed: true });
    expect(r.status).toBe(200);
    expect(r.body.completed).toBe(true);
  });

  it("rejects non-boolean completed", async () => {
    const c = await request(app).post("/todos").send({ title: "x" });
    const r = await request(app)
      .patch(`/todos/${c.body.id}`)
      .send({ completed: "yes" });
    expect(r.status).toBe(400);
  });

  it("returns 404 for missing todo", async () => {
    const r = await request(app).patch("/todos/99999").send({ completed: true });
    expect(r.status).toBe(404);
  });

  it("rejects empty title", async () => {
    const r = await request(app).post("/todos").send({ title: "" });
    expect(r.status).toBe(400);
  });

  it("rejects non-string title", async () => {
    const r = await request(app).post("/todos").send({ title: 123 });
    expect(r.status).toBe(400);
  });
});
