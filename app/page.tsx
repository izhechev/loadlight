"use client";

import Image from "next/image";
import Link from "next/link";
import { Brain, BarChart3, Heart, ArrowRight, CheckCircle, Sparkles, Leaf } from "@/lib/icons";

const features = [
  {
    icon: <BarChart3 style={{ width: 24, height: 24, color: '#1a6ab8' }} />,
    title: "Natural Language Input",
    desc: 'Just type "did laundry, need to study for exam, call landlord" — AI extracts each task automatically.',
  },
  {
    icon: <BarChart3 style={{ width: 24, height: 24, color: '#1a7a50' }} />,
    title: "Workload Monitoring",
    desc: "AI analyzes your week and tells you when you're overloaded — before burnout hits.",
  },
  {
    icon: <Heart style={{ width: 24, height: 24, color: '#c83060' }} />,
    title: "Mental Health Aware",
    desc: "Overwhelmed? One button activates Rest Mode, hiding non-essential tasks so you can breathe.",
  },
  {
    icon: <Brain style={{ width: 24, height: 24, color: '#5a2a9a' }} />,
    title: "Balance Tracking",
    desc: "Choose your mode: Beast Worker (70/30), Average (50/50), or Chill Guy (30/70). AI adapts advice.",
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
      <div className="orb-layer" />

      {/* Nav */}
      <nav
        className="glass-panel mx-4 mt-4 px-5 py-3 flex items-center justify-between sticky top-4 z-50"
        style={{ position: 'sticky', top: 16, zIndex: 50 }}
      >
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="LoadLight" width={38} height={38} className="logo-glow-sm" />
          <span className="gradient-text" style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5 }}>LoadLight</span>
        </div>
        <Link
          href="/dashboard"
          className="glow-button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 18px' }}
        >
          Try Demo
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px 40px', textAlign: 'center' }}>
        <div className="flex justify-center mb-8 anim-scale-in" style={{ justifyContent: 'center', marginBottom: 32 }}>
          <Image
            src="/logo.png"
            alt="LoadLight"
            width={220}
            height={220}
            className="logo-glow logo-float"
            priority
          />
        </div>

        <div className="anim-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div
            className="glass-panel badge-skeu"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              marginBottom: 20,
              fontSize: 12,
              fontWeight: 700,
              color: '#1a7a50',
            }}
          >
            <Leaf style={{ width: 14, height: 14, color: '#20a060' }} />
            AI-powered task management meets mental health awareness
          </div>

          <h1 style={{ fontSize: 52, fontWeight: 900, marginBottom: 16, lineHeight: 1.15, color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.60)' }}>
            <span className="gradient-text" style={{ color: '#a8d0ff', textShadow: '0 2px 8px rgba(0,50,150,0.50)' }}>Balance Your Load.</span>
            <br />
            <span style={{ color: '#ffffff' }}>Lighten Your Mind.</span>
          </h1>

          <p style={{ fontSize: 17, maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.65, color: 'rgba(220,240,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.50)' }}>
            Existing apps store tasks but never tell you when you&apos;re doing too much.{" "}
            <strong style={{ color: '#ffffff' }}>LoadLight fills that gap</strong> — with AI that actually cares about your wellbeing.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/dashboard"
              className="glow-button pulse-glow"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, padding: '10px 28px', fontWeight: 900 }}
            >
              <Sparkles style={{ width: 18, height: 18 }} />
              Try the Demo
              <ArrowRight style={{ width: 18, height: 18 }} />
            </Link>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(200,230,255,0.60)', textShadow: '0 1px 2px rgba(0,0,0,0.40)' }}>
              No sign-up · No credit card · 100% free
            </span>
          </div>
        </div>

        {/* Hero card preview */}
        <div className="glass-panel anim-fade-in-up" style={{ marginTop: 48, padding: 20, maxWidth: 580, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left', animationDelay: '0.3s' }}>
          {/* Window chrome dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#c83030', border: '1px solid #a02020' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#c8a020', border: '1px solid #9a7a10' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28a040', border: '1px solid #1a7a30' }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginLeft: 8, color: '#5a7a9a' }}>AI Task Extraction</span>
          </div>
          <div className="skeu-inset" style={{ padding: 14, marginBottom: 14, borderRadius: 5 }}>
            <p style={{ fontSize: 13, lineHeight: 1.6, fontWeight: 600, color: '#1a1a1a' }}>
              &ldquo;Need to finish the report by Thursday, hit the gym, buy groceries, call mom, and maybe start that online course&rdquo;
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { title: "Finish report by Thursday", type: "work",     badgeCls: "aero-info badge-skeu",    min: 120 },
              { title: "Hit the gym",               type: "exercise", badgeCls: "aero-success badge-skeu", min: 60 },
              { title: "Buy groceries",             type: "chores",   badgeCls: "aero-warning badge-skeu", min: 45 },
              { title: "Call mom",                  type: "social",   badgeCls: "aero-info badge-skeu",    min: 20 },
              { title: "Start online course",       type: "leisure",  badgeCls: "aero-purple badge-skeu",  min: 60 },
            ].map((task, i) => (
              <div
                key={i}
                className={`task-card-${task.type} anim-fade-in-left`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 6, padding: '8px 12px', animationDelay: `${0.5 + i * 0.08}s` }}
              >
                <CheckCircle style={{ width: 15, height: 15, flexShrink: 0, color: '#28a060' }} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: '#1a1a1a' }}>{task.title}</span>
                <span className={`${task.badgeCls}`} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 9999, fontWeight: 700 }}>{task.type}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#5a7a9a' }}>{task.min}m</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, marginTop: 12, textAlign: 'center', fontWeight: 700, color: '#5a7a9a' }}>
            AI extracted 5 tasks from one sentence — review and confirm before saving
          </p>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
        <h2 className="gradient-text" style={{ fontSize: 26, fontWeight: 900, textAlign: 'center', marginBottom: 32, color: '#a8d8ff', textShadow: '0 2px 6px rgba(0,0,0,0.50)' }}>
          Everything you need to stay balanced
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {features.map((f, i) => (
            <div
              key={i}
              className="glass-panel anim-fade-in-up"
              style={{ padding: 20, animationDelay: `${i * 0.08}s` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div className="skeu-inset" style={{ padding: 10, borderRadius: 6, flexShrink: 0 }}>{f.icon}</div>
                <div>
                  <h3 style={{ fontWeight: 900, marginBottom: 5, color: '#1a1a1a', fontSize: 14 }}>{f.title}</h3>
                  <p style={{ fontSize: 12, lineHeight: 1.6, color: '#4a5a70' }}>{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Perks */}
        <div className="glass-panel anim-fade-in-up" style={{ padding: 28, marginTop: 24 }}>
          <h3 style={{ fontWeight: 900, fontSize: 17, marginBottom: 20, textAlign: 'center', color: '#1a1a1a' }}>What LoadLight does for you</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {perks.map((perk, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'linear-gradient(to bottom, #80d8a0, #28a060)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid #20904e',
                  }}
                >
                  <CheckCircle style={{ width: 11, height: 11, color: '#ffffff' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2a3a50' }}>{perk}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <div className="glass-panel anim-fade-in-up" style={{ padding: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Image src="/logo.png" alt="LoadLight" width={110} height={110} className="logo-glow float-med" />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10, color: '#1a3a6a' }}>Ready to find your balance?</h2>
          <p style={{ marginBottom: 28, fontWeight: 600, color: '#4a6a90', fontSize: 14 }}>
            See how LoadLight transforms the way you manage your day.
          </p>
          <Link
            href="/dashboard"
            className="glow-button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, padding: '10px 32px', fontWeight: 900 }}
          >
            <Sparkles style={{ width: 18, height: 18 }} />
            Open Demo Dashboard
          </Link>
        </div>
      </section>

      <footer style={{ textAlign: 'center', paddingBottom: 28, color: '#7a9ab8', fontSize: 12, fontWeight: 700 }}>
        LoadLight — Free, no ads, built with care
      </footer>
    </div>
  );
}
