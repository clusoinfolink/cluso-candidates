import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { signCandidateToken, candidateCookieName } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function looksLikeBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const hasMongoUri = Boolean(process.env.MONGODB_URI?.trim());
  const hasJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  if (!hasMongoUri || !hasJwtSecret) {
    console.error("[candidate-login] Missing required env vars", {
      hasMongoUri,
      hasJwtSecret,
    });
    return NextResponse.json(
      { error: "Unable to sign in right now. Please try again." },
      { status: 500 },
    );
  }

  try {
    await connectMongo();

    const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
      .select("_id role passwordHash")
      .lean();
    if (!user || user.role !== "candidate") {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const storedPasswordHash = typeof user.passwordHash === "string" ? user.passwordHash : "";
    if (!storedPasswordHash) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    let isPasswordValid = false;
    let shouldUpgradeLegacyPassword = false;

    if (looksLikeBcryptHash(storedPasswordHash)) {
      try {
        isPasswordValid = await bcrypt.compare(parsed.data.password, storedPasswordHash);
      } catch {
        isPasswordValid = false;
      }
    } else {
      // Backward compatibility for legacy records that might still store plain passwords.
      isPasswordValid = parsed.data.password === storedPasswordHash;
      shouldUpgradeLegacyPassword = isPasswordValid;
    }

    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    if (shouldUpgradeLegacyPassword) {
      const upgradedHash = await bcrypt.hash(parsed.data.password, 10);
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordHash: upgradedHash } },
      );
    }

    const token = signCandidateToken({
      userId: String(user._id),
      role: "candidate",
    });

    const res = NextResponse.json({ message: "Logged in" });
    res.cookies.set(candidateCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    console.error("[candidate-login] Login failed", error);
    return NextResponse.json(
      { error: "Unable to sign in right now. Please try again." },
      { status: 500 },
    );
  }
}
