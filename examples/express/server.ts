import express from "express";
import { Router } from "express";

const app = express();
const users = Router();

/** Retrieves a user by ID. */
function getUser(req: express.Request, res: express.Response) {
  const id = req.params.id;
  const includePosts = req.query.includePosts;
  res.status(200).json({ id, includePosts });
}

users.get("/:id", requireAuth, getUser);
users.post("/", validateUser, (req: express.Request, res: express.Response) => {
  const email = req.body.email;
  res.status(201).json({ email });
});

function requireAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) {
  next();
}
function validateUser(_req: express.Request, _res: express.Response, next: express.NextFunction) {
  next();
}

app.use("/users", users);
app.listen(3000);
