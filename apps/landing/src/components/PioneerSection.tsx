'use client';
import { useState, useEffect, FormEvent } from 'react';

const PIONEER_MAX = 50;
const EDGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vendor-register-lead`
  : '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface SpotsData {
  spots_remaining: number;
  spots_total: number;
}

interface Props {
  initialSpots: number;
}

export default function PioneerSection({ initialSpots }: Props) {
  const [spots, setSpots] = useState(initialSpots);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    service_type: '',
    location: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'pioneer' | 'waitlist' | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState('');

  // Refresh spot count on mount (hydrate with live data)
  useEffect(() => {
    if (!EDGE_URL) return;
    fetch(EDGE_URL, {
      headers: { Authorization: `Bearer ${ANON_KEY}` },
    })
      .then((r) => r.json())
      .then((d: SpotsData) => {
        if (typeof d.spots_remaining === 'number') {
          setSpots(d.spots_remaining);
        }
      })
      .catch(() => {});
  }, []);

  const filledPct = Math.min(100, ((PIONEER_MAX - spots) / PIONEER_MAX) * 100);

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

      setResult(data.status);
      setAlreadyRegistered(data.already_registered ?? false);
      if (typeof data.spots_remaining === 'number') {
        setSpots(data.spots_remaining);
      }
    } catch {
      setError('Network error — please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pioneer-section" id="vendors">
      <div className="container">
        <div className="pioneer-inner">
          {/* Left: info */}
          <div>
            <div className="pioneer-badge">★ Pioneer Programme</div>
            <h2 className="pioneer-title">
              Be one of the first<br />50 VARS vendors.
            </h2>
            <p className="pioneer-sub">
              Pioneers get a permanent badge that builds trust with every customer,
              and keep 100% of their first 3 bookings. After that, the standard
              platform fee applies.
            </p>

            {/* Live spots counter */}
            <div className="spots-counter">
              <div>
                <div className="spots-number">{spots}</div>
              </div>
              <div className="spots-bar-wrap">
                <div className="spots-label">
                  Pioneer spots remaining<br />
                  <span style={{ color: '#D4A017', fontWeight: 700 }}>
                    {PIONEER_MAX - spots} of {PIONEER_MAX} claimed
                  </span>
                </div>
                <div className="spots-bar-track">
                  <div
                    className="spots-bar-fill"
                    style={{ width: `${filledPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Perks list */}
            <ul className="pioneer-perks">
              <li className="pioneer-perk">
                <span className="perk-icon">0%</span>
                Zero commission on your first 3 completed bookings
              </li>
              <li className="pioneer-perk">
                <span className="perk-icon">★</span>
                Permanent Pioneer badge visible to every customer
              </li>
              <li className="pioneer-perk">
                <span className="perk-icon">1</span>
                Priority ranking in search results at launch
              </li>
            </ul>
          </div>

          {/* Right: form */}
          <div className="pioneer-form-wrap">
            {result ? (
              <div className="form-success">
                <span className="form-success-icon">
                  {result === 'pioneer' ? '🎉' : '📋'}
                </span>
                <div className="form-success-title">
                  {result === 'pioneer'
                    ? alreadyRegistered
                      ? "You're already registered as a Pioneer!"
                      : "You're a Pioneer!"
                    : alreadyRegistered
                    ? "You're on the waitlist."
                    : "You're on the waitlist!"}
                </div>
                <p className="form-success-sub">
                  {result === 'pioneer'
                    ? `Congratulations! You've secured a Pioneer spot. We'll reach out on WhatsApp with your onboarding steps. Download the VARS app to complete your profile.`
                    : `All Pioneer spots were claimed. You're on the waitlist and will be notified when new spots open. Download the app and set up your profile to be ready.`}
                </p>
              </div>
            ) : (
              <>
                <div className="pioneer-form-title">
                  {spots > 0
                    ? `Claim your Pioneer spot`
                    : 'Join the waitlist'}
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
                    {submitting
                      ? 'Submitting...'
                      : spots > 0
                      ? `Claim your Pioneer spot (${spots} left)`
                      : 'Join the waitlist'}
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
