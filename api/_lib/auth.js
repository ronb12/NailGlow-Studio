import crypto from "node:crypto";

const COOKIE_NAME = "nailglow_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  return process.env.AUTH_SECRET || "";
}

export function authConfigured() {
  return Boolean(secret());
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  if (!encoded || !password) return false;
  const [salt, stored] = String(encoded).split(":");
  if (!salt || !stored) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(actual, "hex"));
}

function signValue(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSession(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  })).toString("base64url");
  const sig = signValue(payload);
  return `${payload}.${sig}`;
}

export function readCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function parseSession(req) {
  if (!authConfigured()) return null;
  const token = readCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (signValue(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, user) {
  const token = createSession(user);
  res.setHeader("set-cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_MAX_AGE}`);
}

export function clearSessionCookie(res) {
  res.setHeader("set-cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}
