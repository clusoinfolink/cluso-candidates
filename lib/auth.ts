import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const TOKEN_NAME = "cluso_candidate_token";

type AuthPayload = {
  userId: string;
  role: "candidate";
};

export function signCandidateToken(payload: AuthPayload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET in environment variables.");
  }

  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyCandidateToken(token: string): AuthPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return null;
    }

    return jwt.verify(token, secret) as AuthPayload;
  } catch {
    return null;
  }
}

export async function getCandidateAuthFromRequest(req: NextRequest) {
  const token = req.cookies.get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifyCandidateToken(token);
}

export async function getCandidateAuthFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifyCandidateToken(token);
}

export function candidateCookieName() {
  return TOKEN_NAME;
}
