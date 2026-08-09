import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Registered business details and contact information for VARSAPP LIMITED, the company behind VARS.',
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">Back to VARS</Link>
        <p className="legal-kicker">Contact</p>
        <h1>Get in touch</h1>

        <section>
          <h2>Company</h2>
          <p>
            VARS is operated by VARSAPP LIMITED, registered in Lagos, Nigeria.
          </p>
          <p>
            Registered address: 119 LSDPC Estate, Phase III, Ogba, Lagos State, Nigeria.
          </p>
        </section>

        <section>
          <h2>Reach us</h2>
          <p>
            Email: <a href="mailto:hello@bookwithvars.com">hello@bookwithvars.com</a>
          </p>
          <p>
            Phone: <a href="tel:+2349021561493">+2349021561493</a>
          </p>
          <p>
            Business hours: Monday to Friday, 9:00 to 17:00 WAT.
          </p>
        </section>
      </div>
    </main>
  );
}
