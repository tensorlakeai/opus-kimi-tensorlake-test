// BROKEN VERSION — intentional bugs:
//   1. POST /todos does not reject empty / non-string titles.
//   2. PATCH /todos/:id does not validate that `completed` is boolean.
//   3. PATCH /todos/:id returns the *stale* todo (snapshot before mutation).
// The repair engine will replace this file with a corrected version.
import express, { Request, Response } from "express";

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const todos: Todo[] = [];
  let nextId = 1;

  app.get("/todos", (_req: Request, res: Response) => {
    res.json({ todos });
  });

  app.post("/todos", (req: Request, res: Response) => {
    // BUG: empty / non-string title is silently accepted
    const title = req.body?.title ?? "";
    const todo: Todo = { id: nextId++, title, completed: false };
    todos.push(todo);
    res.status(201).json(todo);
  });

  app.patch("/todos/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const todo = todos.find((t) => t.id === id);
    if (!todo) return res.status(404).json({ error: "not found" });
    // BUG: stale snapshot before mutating
    const stale = { ...todo };
    const body = req.body ?? {};
    // BUG: no type validation
    if (body.completed !== undefined) todo.completed = body.completed;
    if (body.title !== undefined) todo.title = body.title;
    // BUG: returns the snapshot from before mutation
    return res.json(stale);
  });

  return app;
}
