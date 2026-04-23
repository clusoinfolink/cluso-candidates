"use client";

import { FormEvent, useEffect, useState } from "react";
import { BriefcaseBusiness, GraduationCap, KeyRound, UserRound } from "lucide-react";
import { PortalFrame } from "@/components/dashboard/PortalFrame";
import { BlockCard, BlockTitle } from "@/components/ui/blocks";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { getAlertTone } from "@/lib/alerts";
import { usePortalSession } from "@/lib/hooks/usePortalSession";
import {
  CandidateEducationRecord,
  CandidateEmploymentRecord,
  CandidateProfile,
} from "@/lib/types";

function createEmploymentRecord(): CandidateEmploymentRecord {
  return {
    companyName: "",
    designation: "",
    city: "",
    state: "",
    country: "",
    startDate: "",
    endDate: "",
    currentlyWorking: false,
    employmentType: "",
    description: "",
  };
}

function createEducationRecord(): CandidateEducationRecord {
  return {
    level: "",
    institution: "",
    degree: "",
    fieldOfStudy: "",
    city: "",
    state: "",
    country: "",
    startYear: "",
    endYear: "",
    educationType: "",
    grade: "",
  };
}

const EMPTY_PROFILE: CandidateProfile = {
  keySkills: [],
  employment: [],
  education: [],
};

const SECTION_CARD_CLASS =
  "bg-white border-2 border-slate-200 shadow-sm rounded-xl p-5 dark:bg-slate-900 dark:border-slate-700";
const FIELD_INPUT_CLASS =
  "w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";
const FIELD_LABEL_CLASS = "mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200";

export default function CandidateProfilePage() {
  const { me, loading, logout, refreshMe } = usePortalSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [profile, setProfile] = useState<CandidateProfile>(EMPTY_PROFILE);
  const [skillsInput, setSkillsInput] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!me) {
      return;
    }

    let active = true;
    (async () => {
      setProfileLoading(true);
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load profile.");
        }

        const data = (await response.json()) as { profile?: CandidateProfile };
        if (!active) {
          return;
        }

        const nextProfile = data.profile ?? EMPTY_PROFILE;
        setProfile(nextProfile);
        setSkillsInput(nextProfile.keySkills.join(", "));
      } catch {
        if (!active) {
          return;
        }
        setProfile(EMPTY_PROFILE);
        setSkillsInput("");
        setProfileMessage("Could not load profile details.");
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [me]);

  if (loading || !me || profileLoading) {
    return (
      <LoadingScreen
        title="Loading profile..."
        subtitle="Preparing your personal details"
      />
    );
  }

  function updateEmployment(index: number, field: keyof CandidateEmploymentRecord, value: string | boolean) {
    setProfile((prev) => ({
      ...prev,
      employment: prev.employment.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function updateEducation(index: number, field: keyof CandidateEducationRecord, value: string) {
    setProfile((prev) => ({
      ...prev,
      education: prev.education.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileMessage("");
    setProfileSaving(true);

    const keySkills = Array.from(
      new Set(
        skillsInput
          .split(",")
          .map((skill) => skill.trim())
          .filter((skill) => skill.length > 0),
      ),
    );

    const payload: CandidateProfile = {
      keySkills,
      employment: profile.employment,
      education: profile.education,
    };

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { message?: string; error?: string; profile?: CandidateProfile };

      if (!response.ok) {
        setProfileMessage(data.error ?? "Could not update profile.");
        return;
      }

      const savedProfile = data.profile ?? payload;
      setProfile(savedProfile);
      setSkillsInput(savedProfile.keySkills.join(", "));
      setProfileMessage(data.message ?? "Profile updated successfully.");
    } catch {
      setProfileMessage("Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New password and confirm password must match.");
      return;
    }

    setChangingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = (await res.json()) as { message?: string; error?: string };
    setChangingPassword(false);

    if (!res.ok) {
      setPasswordMessage(data.error ?? "Could not change password.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    await refreshMe(true);
    setPasswordMessage(data.message ?? "Password changed successfully.");
  }

  return (
    <PortalFrame
      me={me}
      onLogout={logout}
      title="Profile"
      subtitle="Manage your profile, work experience, education, and account security."
    >
      <form onSubmit={saveProfile} className="space-y-6">
        <BlockCard as="article" interactive className={SECTION_CARD_CLASS}>
          <BlockTitle
            icon={<UserRound size={14} />}
            title="Key Skills"
            subtitle="Add your core skills as comma-separated values."
          />
          <label className={FIELD_LABEL_CLASS} htmlFor="skills">
            Skills
          </label>
          <input
            id="skills"
            className={FIELD_INPUT_CLASS}
            placeholder="React.js, Node.js, SQL, Python"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
          />
        </BlockCard>

        <BlockCard as="article" interactive className={SECTION_CARD_CLASS}>
          <BlockTitle
            icon={<BriefcaseBusiness size={14} />}
            title="Employment"
            subtitle="Add one or more employment entries."
          />
          <div className="space-y-5">
            {profile.employment.length === 0 ? (
              <p className="block-subtitle">No employment records added yet.</p>
            ) : (
              profile.employment.map((entry, index) => (
                <div
                  key={`employment-${index}`}
                  className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    Employment {index + 1}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className={FIELD_INPUT_CLASS} placeholder="Company Name" value={entry.companyName} onChange={(e) => updateEmployment(index, "companyName", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Designation" value={entry.designation} onChange={(e) => updateEmployment(index, "designation", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="City" value={entry.city} onChange={(e) => updateEmployment(index, "city", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="State" value={entry.state} onChange={(e) => updateEmployment(index, "state", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Country" value={entry.country} onChange={(e) => updateEmployment(index, "country", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Employment Type" value={entry.employmentType} onChange={(e) => updateEmployment(index, "employmentType", e.target.value)} />
                    <div>
                      <label className={FIELD_LABEL_CLASS}>Start Date</label>
                      <input
                        className={FIELD_INPUT_CLASS}
                        type="date"
                        value={entry.startDate}
                        onChange={(e) => updateEmployment(index, "startDate", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={FIELD_LABEL_CLASS}>End Date</label>
                      <input
                        className={FIELD_INPUT_CLASS}
                        type="date"
                        value={entry.endDate}
                        min={entry.startDate || undefined}
                        onChange={(e) => updateEmployment(index, "endDate", e.target.value)}
                        disabled={entry.currentlyWorking}
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <input type="checkbox" checked={entry.currentlyWorking} onChange={(e) => updateEmployment(index, "currentlyWorking", e.target.checked)} />
                    Currently working here
                  </label>
                  <textarea className={`${FIELD_INPUT_CLASS} min-h-24`} placeholder="Description" value={entry.description} onChange={(e) => updateEmployment(index, "description", e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setProfile((prev) => ({
                        ...prev,
                        employment: prev.employment.filter((_, idx) => idx !== index),
                      }))
                    }
                  >
                    Remove employment
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
              onClick={() =>
                setProfile((prev) => ({
                  ...prev,
                  employment: [...prev.employment, createEmploymentRecord()],
                }))
              }
            >
              Add employment
            </button>
          </div>
        </BlockCard>

        <BlockCard as="article" interactive className={SECTION_CARD_CLASS}>
          <BlockTitle
            icon={<GraduationCap size={14} />}
            title="Education"
            subtitle="Add your education details."
          />
          <div className="space-y-5">
            {profile.education.length === 0 ? (
              <p className="block-subtitle">No education records added yet.</p>
            ) : (
              profile.education.map((entry, index) => (
                <div
                  key={`education-${index}`}
                  className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    Education {index + 1}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className={FIELD_INPUT_CLASS} placeholder="Level (e.g. Bachelor's)" value={entry.level} onChange={(e) => updateEducation(index, "level", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Institution" value={entry.institution} onChange={(e) => updateEducation(index, "institution", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Degree" value={entry.degree} onChange={(e) => updateEducation(index, "degree", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Field of Study" value={entry.fieldOfStudy} onChange={(e) => updateEducation(index, "fieldOfStudy", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="City" value={entry.city} onChange={(e) => updateEducation(index, "city", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="State" value={entry.state} onChange={(e) => updateEducation(index, "state", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Country" value={entry.country} onChange={(e) => updateEducation(index, "country", e.target.value)} />
                    <input className={FIELD_INPUT_CLASS} placeholder="Education Type (full time, part time)" value={entry.educationType} onChange={(e) => updateEducation(index, "educationType", e.target.value)} />
                    <div>
                      <label className={FIELD_LABEL_CLASS}>Start Month</label>
                      <input
                        className={FIELD_INPUT_CLASS}
                        type="month"
                        value={entry.startYear}
                        onChange={(e) => updateEducation(index, "startYear", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={FIELD_LABEL_CLASS}>End Month</label>
                      <input
                        className={FIELD_INPUT_CLASS}
                        type="month"
                        value={entry.endYear}
                        min={entry.startYear || undefined}
                        onChange={(e) => updateEducation(index, "endYear", e.target.value)}
                      />
                    </div>
                    <input className={`${FIELD_INPUT_CLASS} md:col-span-2`} placeholder="Grade / Score" value={entry.grade} onChange={(e) => updateEducation(index, "grade", e.target.value)} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setProfile((prev) => ({
                        ...prev,
                        education: prev.education.filter((_, idx) => idx !== index),
                      }))
                    }
                  >
                    Remove education
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
              onClick={() =>
                setProfile((prev) => ({
                  ...prev,
                  education: [...prev.education, createEducationRecord()],
                }))
              }
            >
              Add education
            </button>
          </div>
        </BlockCard>

        {profileMessage ? <p className={`inline-alert ${getAlertTone(profileMessage)}`}>{profileMessage}</p> : null}
        <button className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={profileSaving}>
          {profileSaving ? "Saving..." : "Save profile"}
        </button>
      </form>

      <BlockCard as="article" interactive className={`${SECTION_CARD_CLASS} mt-8`}>
        <BlockTitle
          icon={<KeyRound size={14} />}
          title="Change Password"
          subtitle="Use a strong password and avoid reusing old credentials."
        />

        {me.mustChangePassword ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
            This is your first login. Please change your password to continue using the portal.
          </p>
        ) : null}

        <form onSubmit={changePassword} className="form-grid">
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="current-password">
              Current Password
            </label>
            <input
              id="current-password"
              className={FIELD_INPUT_CLASS}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="new-password">
              New Password
            </label>
            <input
              id="new-password"
              className={FIELD_INPUT_CLASS}
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="confirm-password">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              className={FIELD_INPUT_CLASS}
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {passwordMessage ? <p className={`inline-alert ${getAlertTone(passwordMessage)}`}>{passwordMessage}</p> : null}

          <button className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={changingPassword}>
            {changingPassword ? "Updating..." : "Change Password"}
          </button>
        </form>
      </BlockCard>
    </PortalFrame>
  );
}
