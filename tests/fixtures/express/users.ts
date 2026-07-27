import { Router } from "express";

const router = Router();

/** Returns one user. */
const getUser = (req: any, res: any) => {
  const page = req.query.page;
  const id = req.params.id;
  res.status(200).json({ id, page });
};

router.get("/users/:id", requireAuth, getUser);
router.post("/users", validateUser, (req: any, res: any) => {
  const email = req.body.email;
  res.status(201).json({ email });
});

function requireAuth(_req: any, _res: any, next: any) {
  next();
}
function validateUser(_req: any, _res: any, next: any) {
  next();
}

export default router;
