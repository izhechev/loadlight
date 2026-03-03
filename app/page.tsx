"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Brain, BarChart3, Heart, ArrowRight, CheckCircle, Sparkles, Leaf } from "lucide-react";

const features = [
  {
    icon: <Sparkles className="w-6 h-6 text-sky-500" />,
    title: "Natural Language Input",
    desc: 'Just type "did laundry, need to study for exam, call landlord" — AI extracts each task automatically.',
    color: "from-sky-400/20 to-cyan-400/10",
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-emerald-500" />,
    title: "Workload Monitoring",
    desc: "AI analyzes your week and tells you when you're overloaded — before burnout hits.",
    color: "from-emerald-400/20 to-teal-400/10",
  },
  {
    icon: <Heart className="w-6 h-6 text-pink-500" />,
    title: "Mental Health Aware",
    desc: "Overwhelmed? One button activates Rest Mode, hiding non-essential tasks so you can breathe.",
    color: "from-pink-400/20 to-rose-400/10",
  },
  {
    icon: <Brain className="w-6 h-6 text-purple-500" />,
    title: "Balance Tracking",
    desc: "Choose your mode: Beast Worker (70/30), Average (50/50), or Chill Guy (30/70). AI adapts advice.",
    color: "from-purple-400/20 to-indigo-400/10",
  },
];

const perks = [
  "AI extracts 3+ tasks from one message",
  "Preview before anything saves",
  "Weekly assessment with real advice",
  "Work vs leisure ratio dashboard",
  "Low-mood activity suggestions",
  "100% free, no ads",
];

export default function LandingPage() {
  return (
    <div className="aero-bg min-h-screen overflow-x-hidden">
      {/* Floating orbs for extra depth */}
      <div className="orb-layer">
        <div className="orb w-64 h-64 -top-20 -left-20 opacity-20"></div>
        <div className="orb w-96 h-96 top-[40%] -right-20 opacity-10"></div>
        <div className="orb w-48 h-48 bottom-[10%] left-[20%] opacity-15"></div>
      </div>

      {/* Nav */}
      <nav className="glass-panel-strong mx-4 mt-4 px-5 py-3 flex items-center justify-between sticky top-4 z-50">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LoadLight" width={42} height={42} className="logo-glow-sm" />
          <span className="font-black text-xl gradient-text tracking-tight">LoadLight</span>
        </div>
        <Link
          href="/dashboard"
          className="glow-button text-white font-bold px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2"
        >
          Try Demo <ArrowRight className="w-4 h-4" />
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        {/* Big Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.35 }}
          className="flex justify-center mb-8"
        >
          <Image
            src="/logo.png"
            alt="LoadLight"
            width={260}
            height={260}
            className="logo-glow logo-float"
            priority
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="inline-flex items-center gap-2 glass-panel px-4 py-2 mb-6 text-sm text-emerald-700 font-semibold">
            <Leaf className="w-4 h-4 text-emerald-500" />
            AI-powered task management meets mental health awareness
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-5 leading-tight">
            <span className="gradient-text">Balance Your Load.</span>
            <br />
            <span className="text-slate-700">Lighten Your Mind.</span>
          </h1>

          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Existing apps store tasks but never tell you when you&apos;re doing too much.{" "}
            <strong className="text-slate-800">LoadLight fills that gap</strong> — with AI that actually cares about your wellbeing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/dashboard"
              className="glow-button text-white font-black px-9 py-4 rounded-2xl text-lg inline-flex items-center gap-3 pulse-glow"
            >
              <Sparkles className="w-5 h-5" />
              Try the Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
            <span className="text-slate-400 text-sm font-medium">No sign-up · No credit card · 100% free</span>
          </div>
        </motion.div>

        {/* Hero card preview */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.93 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.4, type: "spring", bounce: 0.2 }}
          className="mt-14 glass-panel p-6 max-w-2xl mx-auto text-left"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">AI Task Extraction</p>
          </div>
          <div className="glass-dark p-4 rounded-xl mb-4 border border-white/20">
            <p className="text-white text-sm leading-relaxed font-medium">
              &ldquo;Need to finish the report by Thursday, hit the gym, buy groceries, call mom, and maybe start that online course&rdquo;
            </p>
          </div>
          <div className="space-y-2">
            {[
              { title: "Finish report by Thursday", type: "work",     badge: "bg-blue-100 text-blue-700",    min: 120 },
              { title: "Hit the gym",               type: "exercise", badge: "bg-emerald-100 text-emerald-700", min: 60 },
              { title: "Buy groceries",             type: "chores",   badge: "bg-amber-100 text-amber-700",  min: 45 },
              { title: "Call mom",                  type: "social",   badge: "bg-cyan-100 text-cyan-700",    min: 20 },
              { title: "Start online course",       type: "leisure",  badge: "bg-purple-100 text-purple-700",min: 60 },
            ].map((task, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                className={`flex items-center gap-3 bg-white/75 rounded-xl p-3 border border-white/60 task-card-${task.type} shadow-sm`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-800 flex-1">{task.title}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${task.badge}`}>{task.type}</span>
                <span className="text-xs text-slate-500 font-bold">{task.min}m</span>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4 text-center font-bold">
            ✓ AI extracted 5 tasks from one sentence — review &amp; confirm before saving
          </p>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="text-3xl font-black text-center mb-12 gradient-text-green"
        >
          Everything you need to stay balanced
        </motion.h2>
        <div className="grid md:grid-cols-2 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-panel p-6 relative overflow-hidden"
            >
              {/* Gradient tint */}
              <div className={`absolute inset-0 bg-gradient-to-br ${f.color} rounded-3xl pointer-events-none`} />
              <div className="relative flex items-start gap-4">
                <div className="glass-panel-strong rounded-xl p-3 shrink-0">{f.icon}</div>
                <div>
                  <h3 className="font-black text-slate-800 mb-1.5">{f.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Perks */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 mt-8"
        >
          <h3 className="font-black text-slate-800 text-xl mb-6 text-center">What LoadLight does for you</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {perks.map((perk, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-400 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
                <span className="text-slate-700 text-sm font-medium">{perk}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          className="glass-panel p-12"
        >
          <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="LoadLight" width={140} height={140} className="logo-glow float-med" />
          </div>
          <h2 className="text-3xl font-black mb-3 gradient-text">Ready to find your balance?</h2>
          <p className="text-slate-600 mb-8 font-bold">See how LoadLight transforms the way you manage your day.</p>
          <Link
            href="/dashboard"
            className="glow-button text-white font-black px-10 py-4 rounded-2xl text-lg inline-flex items-center gap-3"
          >
            <Sparkles className="w-5 h-5" />
            Open Demo Dashboard
          </Link>
        </motion.div>
      </section>

      <footer className="text-center pb-8 text-slate-500 text-sm font-bold">
        LoadLight — Free, no ads, built with care 💙
      </footer>
    </div>
  );
}
