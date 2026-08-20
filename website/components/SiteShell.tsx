import { Footer } from './Footer';
import { Nav } from './Nav';

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="grain" aria-hidden />
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
