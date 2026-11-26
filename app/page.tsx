import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import HomePreview from "./home-preview";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "LoadLight | A task planner for your week",
  description:
    "Turn notes into tasks, review the details before saving, and see how much time you’ve planned.",
};

export default function LandingPage() {
  return (
    <div className={styles.home}>
      <a href="#main-content" className={styles.skip}>Skip to content</a>
      <div className={styles.wallpaper} aria-hidden="true">
        <Image src="/background.png" alt="" fill sizes="100vw" preload />
      </div>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={`glass-panel ${styles.headerBar}`}>
            <Link href="/" className={styles.brand}>
              <Image src="/logo.png" alt="" width={44} height={44} />
              LoadLight
            </Link>
            <nav aria-label="Main navigation" className={styles.nav}>
              <a href="#how-it-works" className={styles.jump}>How it works</a>
              <Link href="/login" className={`vista-btn-secondary ${styles.signIn}`}>Sign in</Link>
            </nav>
          </div>
        </header>

        <main id="main-content">
          <section className={styles.hero} aria-labelledby="home-title">
            <div className={`glass-panel ${styles.intro}`}>
              <h1 id="home-title">Task planner</h1>
              <p>
                Write a note to create tasks. Review them before saving
                and see how much time you’ve planned for the week.
              </p>
              <div className={styles.action}>
                <Link href="/login" className={`glow-button ${styles.primary}`}>
                  Open LoadLight <ArrowRight aria-hidden="true" />
                </Link>
                <p>You can try it without an account.</p>
              </div>
            </div>
            <HomePreview />
          </section>

          <section id="how-it-works" className={styles.details} aria-labelledby="how-title">
            <div className={`glass-panel ${styles.detailLayout}`}>
              <h2 id="how-title">How it works</h2>
              <div className={styles.steps}>
                <div className={styles.step}>
                  <h3>Review the tasks</h3>
                  <p>Edit the category, deadline or time before saving what you want to keep.</p>
                </div>
                <div className={styles.step}>
                  <h3>Check your workload</h3>
                  <p>See what’s due and how much time your unfinished tasks are expected to take.</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      <footer className={styles.footer}>
        <div>
          <span>LoadLight</span>
          <Link href="/login">Open LoadLight</Link>
        </div>
      </footer>
    </div>
  );
}
