import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Home.module.css';

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Secure Authentication System</title>
        <meta
          name="description"
          content="Secure Authentication System landing page with login and registration access."
        />
      </Head>

      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.topRow}>
            <div className={styles.brandBlock}>
              <h1 className={styles.title}>
                <span className={styles.titleAccent}>Secure Authentication System</span>
              </h1>
            </div>
            <div className={styles.statusPanel}>
              <span className={styles.statusLabel}>Security layers</span>
              <strong className={styles.statusValue}>4-step protection</strong>
              <span className={styles.statusMeta}>
                Password, OTP, captcha, and face verification
              </span>
            </div>
          </div>

          <div className={styles.hero}>
            <div className={styles.content}>
              <p className={styles.description}>
                Deliver a trusted sign-in experience with adaptive verification,
                clear security levels, and a polished authentication journey for
                administrators and users.
              </p>

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Security modes</span>
                  <span className={styles.detailValue}>Basic, Balanced, High</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Verification flow</span>
                  <span className={styles.detailValue}>Progressive and user-friendly</span>
                </div>
              </div>
            </div>

            <aside className={styles.sidePanel}>
              <div className={styles.sidePanelCard}>
                <span className={styles.sidePanelLabel}>Platform overview</span>
                <h2 className={styles.sidePanelTitle}>Designed for modern authentication requirements</h2>
                <p className={styles.sidePanelText}>
                  A single entry point for secure login and registration with
                  support for advanced verification when stronger identity checks
                  are required.
                </p>
                <div className={styles.sideStats}>
                  <div className={styles.sideStat}>
                    <span className={styles.sideStatLabel}>Access</span>
                    <strong className={styles.sideStatValue}>Login</strong>
                  </div>
                  <div className={styles.sideStat}>
                    <span className={styles.sideStatLabel}>Onboarding</span>
                    <strong className={styles.sideStatValue}>Register</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className={styles.actions}>
            <div className={styles.actionText}>
              <span className={styles.actionTitle}>Get started</span>
              <span className={styles.actionSubtitle}>
                Sign in to continue or create a new account.
              </span>
            </div>
            <div className={styles.actionButtons}>
              <Link href="/login" className={styles.primaryAction}>
                Login
              </Link>
              <Link href="/register" className={styles.secondaryAction}>
                Register
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
