import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClassicIcon } from "@/lib/classic-icons";
import { ArrowRight } from "@/lib/icons";
import HomePreview from "./home-preview";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "LoadLight | A task planner for your week",
  description: "Turn notes into tasks, check your workload, and make room in your day.",
};

const steps = [
  { icon: "navadd", title: "Write a note", description: "Turn a rough list into tasks you can check before saving." },
  { icon: "tasks", title: "Make a plan", description: "Set deadlines and time estimates so you know what fits." },
  { icon: "chart", title: "Check your workload", description: "See what’s due and how much time is left in your plan." },
] as const;

export default function LandingPage() {
  return (
    <div className={styles.home}>
      <a href="#main-content" className={styles.skip}>Skip to content</a>
      <div className={styles.desktop}>
        <Image className={styles.wallpaper} src="/aero-landscape.webp" alt="" fill sizes="100vw" preload />
        <header className={styles.header}>
          <div className={styles.headerBar}>
            <Link href="/" className={styles.brand}>
              <Image src="/logo.png" alt="" width={42} height={42} />
              LoadLight
            </Link>
            <nav aria-label="Main navigation" className={styles.nav}>
              <a href="#how-it-works" className={styles.jump}>How it works</a>
              <Link href="/login" className={styles.signIn}>Sign in</Link>
            </nav>
          </div>
        </header>

        <main id="main-content" className={styles.main} tabIndex={-1}>
          <section className={styles.hero} aria-labelledby="home-title">
            <div className={styles.intro}>
              <h1 id="home-title">Make room in your day</h1>
              <p>Turn notes into tasks and see how much time you’ve planned for the week.</p>
              <div className={styles.actions}>
                <Link href="/login" className={styles.primary}>
                  Open LoadLight <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#example-plan" className={styles.demoLink}>Try the example</a>
              </div>
              <p className={styles.guestHint}>You can use LoadLight without an account.</p>
            </div>
            <HomePreview />
          </section>

          <section id="how-it-works" className={styles.details} aria-labelledby="how-title">
            <h2 id="how-title">How it works</h2>
            <ol className={styles.steps}>
              {steps.map(({ icon, title, description }) => (
                <li className={styles.step} key={icon}>
                  <span className={styles.stepIcon} aria-hidden="true"><ClassicIcon name={icon} size={27} /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>
      <footer className={styles.footer}>
        <span>LoadLight</span>
        <Link href="/login">Open LoadLight</Link>
      </footer>
    </div>
  );
}
