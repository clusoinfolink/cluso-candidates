import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { candidateCookieName, verifyCandidateToken } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(candidateCookieName())?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = verifyCandidateToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  const user = await User.findById(payload.userId).lean();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: "candidate",
      mustChangePassword: user.mustChangePassword !== false,
    },
  });
}
