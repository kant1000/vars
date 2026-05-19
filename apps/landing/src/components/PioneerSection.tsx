'use client';
import { useState, FormEvent } from 'react';

const EDGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vendor-register-lead`
  : '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface Props {
  initialVendorCount: number;
}

export default function PioneerSection({ initialVendorCount }: Props) {
  const vendorCount = initialVendorCount;
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    service_type: '',
    location: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EDGE_URL) {
      setError('Registration is temporarily unavailable. Please try again later.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
      setAlreadyRegistered(data.already_registered ?? false);
    } catch {
      setError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pioneer-section" id="stylists">
      <div className="container">
        <div className="pioneer-inner">
          {/* Left: info */}
          <div>
            <h2 className="pioneer-title">Join VARS as a stylist.</h2>
            {vendorCount > 0 && (
              <div className="spots-counter" style={{ opacity: 0.55 }}>
                <div>
                  <div className="spots-number">{vendorCount}</div>
                </div>
                <div className="spots-bar-wrap">
                  <div className="spots-label">stylists registered</div>
                </div>
              </div>
            )}
            <ul className="pioneer-perks">
              <li className="pioneer-perk">
                <span className="perk-icon">&#8358;</span>
                In-app payments released after every completed job
              </li>
              <li className="pioneer-perk">
                <span className="perk-icon">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L4 6v6c0 5 3.6 9.7 8 11 4.4-1.3 8-6 8-11V6L12 2z" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M9 12l2 2 4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                Verified by VARS badge builds customer confidence
              </li>
              <li className="pioneer-perk">
                <span className="perk-icon">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="9" strokeWidth="2"/>
                    <path d="M12 7v5l3 3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                Your zone, your hours. Full control over your availability
              </li>
            </ul>
          </div>

          {/* Right: form */}
          <div className="pioneer-form-wrap">
            {submitted ? (
              <div className="form-success">
                <span className="form-success-icon">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="3" width="14" height="18" rx="2" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75"/>
                    <path d="M9 8h6M9 12h6M9 16h4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                </span>
                <div className="form-success-title">
                  {alreadyRegistered ? "You're already registered." : "You're registered!"}
                </div>
                <p className="form-success-sub">
                  We'll reach out on WhatsApp with your onboarding steps so you can complete your stylist profile.
                </p>
              </div>
            ) : (
              <>
                <div className="pioneer-form-note">
                  We&apos;ll communicate next steps soon
                </div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="full_name">Full name</label>
                    <input
                      id="full_name"
                      name="full_name"
                      type="text"
                      className="form-input"
                      placeholder="Ada Okafor"
                      value={form.full_name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className="form-input"
                      placeholder="ada@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="phone">WhatsApp number</label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="form-input"
                      placeholder="+234 800 000 0000"
                      value={form.phone}
                      onChange={handleChange}
                      required
                      autoComplete="tel"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="service_type">What do you offer?</label>
                    <select
                      id="service_type"
                      name="service_type"
                      className="form-select"
                      value={form.service_type}
                      onChange={handleChange}
                      required
                    >
                      <option value="" disabled>Select a service type</option>
                      <option value="barbing">Barbing</option>
                      <option value="hair_styling">Hair styling</option>
                      <option value="makeovers">Makeovers (makeup, pedicure &amp; more)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="location">Area you operate in</label>
                    <select
                      id="location"
                      name="location"
                      className="form-select"
                      value={form.location}
                      onChange={handleChange}
                      required
                    >
                      <option value="" disabled>Select your area</option>
                      <option value="Victoria Island">Victoria Island</option>
                      <option value="Lekki">Lekki</option>
                      <option value="Ikoyi">Ikoyi</option>
                      <option value="Ajah">Ajah</option>
                      <option value="Surulere">Surulere</option>
                      <option value="Yaba">Yaba</option>
                      <option value="Ikeja">Ikeja</option>
                      <option value="Gbagada">Gbagada</option>
                      <option value="Ogba">Ogba</option>
                      <option value="Maryland">Maryland</option>
                      <option value="Magodo">Magodo</option>
                      <option value="Mushin">Mushin</option>
                      <option value="Festac">Festac</option>
                      <option value="Isolo">Isolo</option>
                      <option value="Ikorodu">Ikorodu</option>
                      <option value="Alimosho">Alimosho</option>
                      <option value="Agege">Agege</option>
                      <option value="Oshodi">Oshodi</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {error && <p className="form-error">{error}</p>}

                  <button
                    type="submit"
                    className="form-submit"
                    disabled={
                      submitting ||
                      !form.full_name ||
                      !form.email ||
                      !form.phone ||
                      !form.service_type ||
                      !form.location
                    }
                  >
                    {submitting ? 'Submitting...' : 'Register as a stylist'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
