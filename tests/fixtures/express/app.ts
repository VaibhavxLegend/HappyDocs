import express from "express";
import usersRouter from "./users";

const app = express();
app.use("/api", usersRouter);

/** Health check endpoint. */
app.route("/health").get((_req, res) => res.json({ healthy: true }));

export default app;
