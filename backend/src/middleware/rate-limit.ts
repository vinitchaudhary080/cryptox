import rateLimit from "express-rate-limit";

const message = (msg: string) => ({
  success: false,
  error: msg,
});

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many requests, please slow down."),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many auth attempts, try again in 15 minutes."),
});

export const deployLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("You are deploying strategies too fast. Wait a minute."),
});

export const brokerWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many broker changes, please slow down."),
});
