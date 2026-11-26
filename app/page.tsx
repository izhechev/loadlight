import type { Metadata } from "next";
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
      <div className={styles.blue}>
        <header className={styles.header}>
          <div className={styles.wrap}>
            <Link href="/" className={styles.brand}>
              <span className={styles.mark} aria-hidden="true" />
              LoadLight
            </Link>
            <nav aria-label="Main navigation" className={styles.nav}>
              <a href="#how-it-works" className={styles.jump}>How it works</a>
              <Link href="/login" className={styles.signIn}>Sign in</Link>
            </nav>
          </div>
        </header>

        <main id="main-content">
          <section className={`${styles.hero} ${styles.wrap}`} aria-labelledby="home-title">
            <div className={styles.intro}>
              <h1 id="home-title">Turn a messy list into a plan.</h1>
              <p>
                Write down what you need to do in your own words.
                LoadLight turns your note into tasks you can review
                and shows how much time you’ve planned.
              </p>
              <div className={styles.action}>
                <Link href="/login" className={styles.primary}>
                  Open LoadLight <ArrowRight aria-hidden="true" />
                </Link>
                <p>You can try it without an account.</p>
              </div>
            </div>
            <HomePreview />
          </section>

          <section id="how-it-works" className={styles.details} aria-labelledby="how-title">
            <div className={`${styles.wrap} ${styles.detailLayout}`}>
              <h2 id="how-title">From note to week</h2>
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
        <div className={styles.wrap}>
          <span>LoadLight</span>
          <Link href="/login">Open LoadLight</Link>
        </div>
      </footer>
    </div>
  );
}
