import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { signToken } from "../middleware/security.js";
import { ApiError } from "../utils/errors.js";
import { login as loginInput, registration } from "../utils/validation.js";

const cost = 12;
const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), cost);
const credentials = (user) => ({
  token: signToken(user._id), user: { _id: user._id, email: user.email }
});

export async function register(req, res) {
  const { email, password } = registration.parse(req.body);
  const passwordHash = await bcrypt.hash(password, cost);
  let user;
  try {
    user = await User.create({ email, passwordHash });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "EMAIL_IN_USE", "This email is already registered.");
    throw error;
  }
  res.status(201).json(credentials(user));
}

export async function login(req, res) {
  const { email, password } = loginInput.parse(req.body);
  const user = await User.findOne({ email }).select("+passwordHash").lean();
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  res.json(credentials(user));
}
