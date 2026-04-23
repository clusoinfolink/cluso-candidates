"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LockKeyhole, Mail, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let message = res.status >= 500 ? "Server error. Please try again." : "Login failed";
        const rawError = (await res.text()).trim();

        if (rawError) {
          try {
            const data = JSON.parse(rawError) as { error?: string; message?: string };
            message = data.error?.trim() || data.message?.trim() || message;
          } catch {
            if (!rawError.startsWith("<")) {
              message = rawError;
            }
          }
        }

        setError(message);
        return;
      }

      const data = (await res.json()) as { mustChangePassword?: boolean };
      router.push(data.mustChangePassword ? "/dashboard/profile?focus=password-change" : "/dashboard");
    } catch {
      setError("Could not reach server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative bg-[#F8F9FA] overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[100px] opacity-60"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-green-100 rounded-full blur-[80px] opacity-60"></div>
      </div>

      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 p-6 items-center">
        {/* Info & Image panel */}
        <div className="hidden lg:flex flex-col relative w-full h-[600px] rounded-3xl overflow-hidden bg-white/40 backdrop-blur-xl shadow-2xl border border-white/60">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-emerald-50/50 mix-blend-overlay"></div>
          
          <div className="p-10 pb-4 shrink-0 flex flex-col z-10 relative">
            <div className="mb-8">
              <Image
                src="/images/cluso-infolink-logo.png"
                alt="Cluso Infolink Verification Network"
                width={260}
                height={48}
                className="h-12 w-auto object-contain drop-shadow-sm"
                priority
              />
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight drop-shadow-sm">
              Candidate<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-600">Workspace</span>
            </h1>
            <p className="text-gray-600 text-lg leading-relaxed max-w-md font-medium">
              Seamlessly complete assigned service forms, track verification outcomes, and efficiently manage your professional identity profile.
            </p>
          </div>
          
          <div className="relative flex-1 w-full mt-4 flex items-end justify-center perspective-1000">
            <Image
              src="/images/Login-sitiing.jpg"
              alt="Candidate Workspace"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-contain object-bottom p-6 drop-shadow-2xl hover:scale-105 transition-transform duration-700 ease-in-out origin-bottom"
            />
          </div>
        </div>

        {/* Login Form panel */}
        <div className="bg-white/95 backdrop-blur-2xl border border-white p-10 sm:p-14 lg:p-16 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] relative flex flex-col justify-center transform transition-all hover:shadow-[0_25px_60px_rgba(0,0,0,0.12)]">
          {/* Subtle glowing orb effect behind the form */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-blue-200 to-purple-200 rounded-full blur-[80px] pointer-events-none opacity-50"></div>
          
          <div className="mb-10 relative z-10">
            <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 mb-6 shadow-sm border border-gray-100">
              <Image src="/images/cluso-logo.png" alt="Cluso Logo" width={36} height={36} className="w-9 h-9 object-contain" />
            </div>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">Access Portal</h2>
            <p className="text-gray-500 text-base font-medium">Please authenticate to continue to your candidate dashboard.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-7 relative z-10">
            <div className="space-y-3 group">
              <label className="text-sm font-bold uppercase tracking-wider text-gray-500 group-focus-within:text-blue-600 transition-colors flex items-center gap-3" htmlFor="email">
                <Mail size={18} strokeWidth={2.5} /> Identity Email
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                  <Mail size={22} strokeWidth={2} />
                </div>
                <input
                  id="email"
                  className="w-full bg-gray-50/50 border-2 border-gray-200 rounded-xl pl-12 pr-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-semibold text-lg hover:border-blue-300"
                  type="email"
                  placeholder="candidate@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-3 group">
              <label className="text-sm font-bold uppercase tracking-wider text-gray-500 group-focus-within:text-blue-600 transition-colors flex items-center gap-3" htmlFor="password">
                <LockKeyhole size={18} strokeWidth={2.5} /> Security Key
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-gray-400 group-focus-within:text-blue-500 transition-colors">
                  <LockKeyhole size={22} strokeWidth={2} />
                </div>
                <input
                  id="password"
                  className="w-full bg-gray-50/50 border-2 border-gray-200 rounded-xl pl-12 pr-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-semibold text-lg tracking-wide hover:border-blue-300"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm flex items-start gap-3 text-red-700 text-sm animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="mt-0.5">
                  <LockKeyhole size={18} className="text-red-500" />
                </div>
                <div className="font-medium leading-relaxed">{error}</div>
              </div>
            )}

            <button 
              className="w-full py-4.5 px-6 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold text-lg rounded-xl shadow-[0_8px_20px_-6px_rgba(59,130,246,0.6)] hover:shadow-[0_12px_24px_-6px_rgba(59,130,246,0.7)] transition-all duration-200 transform hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-8 flex items-center justify-center gap-3 tracking-wide" 
              disabled={loading}
            >
              <Sparkles size={22} className={loading ? "animate-spin" : ""} strokeWidth={2.5} />
              {loading ? "Authenticating Session..." : "Initialize Session"}
            </button>
            
            <div className="mt-8 text-center border-t border-gray-100 pt-6">
              <p className="text-sm text-gray-500 font-medium">
                Need help accessing your portal? <a href="#" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-all">Contact Support</a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
