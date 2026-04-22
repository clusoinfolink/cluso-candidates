import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import User from "@/lib/models/User";
import { getCandidateAuthFromRequest } from "@/lib/auth";

const employmentSchema = z.object({
  companyName: z.string().trim().max(120).optional().default(""),
  designation: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  startDate: z.string().trim().max(40).optional().default(""),
  endDate: z.string().trim().max(40).optional().default(""),
  currentlyWorking: z.boolean().optional().default(false),
  employmentType: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
});

const educationSchema = z.object({
  level: z.string().trim().max(120).optional().default(""),
  institution: z.string().trim().max(160).optional().default(""),
  degree: z.string().trim().max(160).optional().default(""),
  fieldOfStudy: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  startYear: z.string().trim().max(20).optional().default(""),
  endYear: z.string().trim().max(20).optional().default(""),
  educationType: z.string().trim().max(80).optional().default(""),
  grade: z.string().trim().max(80).optional().default(""),
});

const profileSchema = z.object({
  keySkills: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]),
  employment: z.array(employmentSchema).max(50).optional().default([]),
  education: z.array(educationSchema).max(50).optional().default([]),
});

function normalizeProfile(rawProfile: unknown) {
  const parsed = profileSchema.safeParse(rawProfile);
  if (!parsed.success) {
    return {
      keySkills: [],
      employment: [],
      education: [],
    };
  }

  const keySkills = Array.from(
    new Set(
      parsed.data.keySkills
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0),
    ),
  );

  return {
    keySkills,
    employment: parsed.data.employment,
    education: parsed.data.education,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const user = await User.findById(auth.userId).select("role candidateProfile").lean();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    profile: normalizeProfile(user.candidateProfile),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const normalizedProfile = normalizeProfile(parsed.data);

  await connectMongo();
  const user = await User.findById(auth.userId).select("_id role");
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await User.updateOne(
    { _id: auth.userId },
    {
      $set: {
        candidateProfile: normalizedProfile,
      },
    },
  );

  return NextResponse.json({
    message: "Profile updated successfully.",
    profile: normalizedProfile,
  });
}
