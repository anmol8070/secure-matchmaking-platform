/**
 * Public landing page. Everything it says describes a feature that exists in
 * this product — there are no statistics, testimonials or sample members.
 * The small interface sketches are illustrations (aria-hidden) of real screens.
 */
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import HeroVisual from '../../components/landing/HeroVisual.jsx';
import Icon from '../../components/common/Icon.jsx';
import useAuth from '../../hooks/useAuth.js';
import { useReveal } from '../../hooks/useMotion.js';
import { USER_PATHS } from '../../routes/paths.js';

const STEPS = [
  { icon: 'shield', title: 'Join and verify', text: 'Register with email or mobile and confirm it with a one-time password. Each sign-in ends with a quick live camera check that a real person is present.' },
  { icon: 'user', title: 'Shape your profile', text: 'Add the details you want to share and a profile picture. You decide, field by field, who may see each one.' },
  { icon: 'sliders', title: 'Tell us what matters', text: 'Set the age range, location and lifestyle you are looking for, pick your hobbies and answer the compatibility quiz.' },
  { icon: 'heart', title: 'Meet, then talk', text: 'Get recommendations with the reasons behind them. Send a request; once it is accepted you can chat and video call.' },
];

const FACTORS = ['Location', 'Age', 'Education', 'Occupation', 'Lifestyle', 'Food preference', 'Shared hobbies', 'Quiz answers'];

const SAFETY = [
  { icon: 'eye', title: 'Field-by-field privacy', text: 'Profile, picture, age, location, education, occupation, lifestyle, bio, hobbies and online status each have their own visibility setting.' },
  { icon: 'lock', title: 'Connections first', text: 'Messages and video calls are only possible between members who have accepted each other’s connection request.' },
  { icon: 'close', title: 'Block anytime', text: 'Blocking removes the connection and stops messages, calls and recommendations between you both.' },
  { icon: 'flag', title: 'Report and review', text: 'Reports go to the moderation team, who can review the account and take action. Every admin decision is logged.' },
  { icon: 'camera', title: 'A person at sign-in', text: 'The sign-in camera checks that one face is in the marker. It does not compare that face with your profile picture, and the photo is not stored as proof of identity.' },
  { icon: 'video', title: 'Calls stay between you', text: 'Video calls connect your browsers directly (WebRTC) and are never recorded.' },
];

const FAQ = [
  ['How is the compatibility score worked out?', 'It combines eight factors from both members’ profiles and preferences — location, age, education, occupation, lifestyle, food preference, shared hobbies and quiz answers. Every recommendation shows the breakdown, so you can see exactly where the number comes from.'],
  ['Does a recommendation model change my score?', 'No. When a recommendation model is in use it can change the order of your list, and the page says so. The percentage on each card is always the compatibility score.'],
  ['Why do I need my camera to sign in?', 'After your password or one-time code, a short check looks for one face in the marker. It does not prove who you are, and it does not compare the picture with your profile photo. The photo itself is not sent or stored.'],
  ['Who can message me?', 'Only members you are connected with. You can block or report anyone from their profile, chat or call screen.'],
  ['Can I hide parts of my profile?', 'Yes. Each profile field has its own visibility, and you can limit your whole profile to your connections.'],
];

function Home() {
  const { isAuthenticated } = useAuth();
  const { hash } = useLocation();
  const pageRef = useReveal();
  const discover = isAuthenticated ? USER_PATHS.MATCHES : USER_PATHS.REGISTER;

  // Links such as /#safety from the navigation scroll to their section.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className="landing" ref={pageRef}>
      {/* 1. Hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="eyebrow reveal">Secure social networking &amp; matchmaking</p>
          <h1 id="hero-title" className="hero__title">
            <span className="hero__line">Some connections</span>{' '}
            <span className="hero__line">
              change <em className="text-gradient">everything.</em>
            </span>
          </h1>
          <p className="hero__lead reveal" style={{ '--reveal-delay': '160ms' }}>
            Meet people who share your interests and values. Recommendations come with the reasons behind
            them, conversations stay between connections, and you control who sees what.
          </p>
          <div className="hero__actions reveal" style={{ '--reveal-delay': '260ms' }}>
            <Link to={discover} className="btn btn--primary btn--large">
              Discover your match <Icon name="arrowRight" />
            </Link>
            <a href="#how-it-works" className="btn btn--ghost btn--large">
              How it works
            </a>
          </div>
        </div>

        <div className="hero__stage">
          <HeroVisual />
          <ul className="hero__floaters" aria-hidden="true">
            <li className="floater floater--1">
              <Icon name="heart" size={16} /> Shared hobbies
            </li>
            <li className="floater floater--2">
              <Icon name="sparkles" size={16} /> Why this match
            </li>
            <li className="floater floater--3">
              <Icon name="message" size={16} /> Private chat
            </li>
            <li className="floater floater--4">
              <Icon name="video" size={16} /> Video call
            </li>
          </ul>
        </div>

        <a href="#how-it-works" className="scroll-cue" aria-label="Scroll to how it works">
          <span className="scroll-cue__wheel" aria-hidden="true" />
        </a>
      </section>

      {/* 2. How it works */}
      <section id="how-it-works" className="section steps" aria-labelledby="steps-title">
        <header className="section__header reveal">
          <p className="eyebrow">How matchmaking works</p>
          <h2 id="steps-title" className="display-2">
            Four steps from <span className="text-gradient">hello</span> to <span className="text-gradient">us.</span>
          </h2>
        </header>
        <ol className="steps__list">
          {STEPS.map((step, i) => (
            <li key={step.title} className="step reveal" style={{ '--reveal-delay': `${i * 110}ms` }}>
              <span className="step__number" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="step__icon" aria-hidden="true">
                <Icon name={step.icon} size={22} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <svg className="steps__thread" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 20 C 160 -10, 340 50, 500 20 S 840 -10, 1000 20" />
        </svg>
      </section>

      {/* 3. Personalised profiles */}
      <section id="features" className="section split" aria-labelledby="profiles-title">
        <div className="split__art reveal" aria-hidden="true">
          <div className="sketch-profile">
            <div className="sketch-profile__cover" />
            <div className="sketch-profile__avatar">You</div>
            <div className="sketch-profile__lines">
              <span />
              <span />
            </div>
            <ul className="sketch-profile__chips">
              <li>Hiking</li>
              <li>Cooking</li>
              <li>Jazz</li>
              <li>Travel</li>
            </ul>
            <div className="sketch-profile__meter">
              <span />
            </div>
          </div>
          <div className="sketch-card sketch-card--back" />
          <div className="sketch-card sketch-card--backer" />
        </div>
        <div className="split__copy">
          <p className="eyebrow reveal">Personalised profiles</p>
          <h2 id="profiles-title" className="display-2 reveal">More than a photo.</h2>
          <p className="lead reveal">
            Your profile tells people who you are: what you do, how you live, what you love and what you are
            looking for. A completion meter shows what is still missing.
          </p>
          <ul className="ticks reveal">
            <li>Name, age, location, education, occupation, lifestyle and an about-me</li>
            <li>Hobbies and a compatibility quiz that feed your recommendations</li>
            <li>The sign-in camera looks for one face. It is not a comparison with your profile picture, and nothing from the camera is stored as identity evidence</li>
          </ul>
        </div>
      </section>

      {/* 4. Compatibility */}
      <section className="section compat" aria-labelledby="compat-title">
        <div className="compat__orbit reveal" aria-hidden="true">
          <div className="compat__ring">
            <span className="compat__ring-label">Your score</span>
          </div>
          {FACTORS.map((f, i) => (
            <span key={f} className="compat__factor" style={{ '--i': i, '--n': FACTORS.length }}>
              {f}
            </span>
          ))}
        </div>
        <div className="compat__copy">
          <p className="eyebrow reveal">Compatibility &amp; shared interests</p>
          <h2 id="compat-title" className="display-2 reveal">
            A score you can <span className="text-gradient">read.</span>
          </h2>
          <p className="lead reveal">
            Eight factors from both of your profiles and preferences add up to one compatibility score. Open any
            recommendation to see how many points each factor contributed, the hobbies you share and the plain
            reasons you were matched.
          </p>
        </div>
      </section>

      {/* 5. Recommendations */}
      <section id="explore" className="section band" aria-labelledby="recs-title">
        <div className="band__inner reveal">
          <p className="eyebrow eyebrow--on-band">Recommendations</p>
          <h2 id="recs-title" className="band__title">Your list is ordered for you. Your score stays honest.</h2>
          <div className="band__cols">
            <p>
              Recommendations are sorted by compatibility. When a recommendation model is in use, it can also learn
              from how members respond to suggestions and adjust the order — and the page tells you when that is
              happening.
            </p>
            <p>
              The percentage on every card is always the compatibility score, never the model’s guess. Filter by
              location, age, education or lifestyle whenever you want to narrow things down.
            </p>
          </div>
        </div>
      </section>

      {/* 6. Connections & messaging */}
      <section className="section split split--reverse" aria-labelledby="chat-title">
        <div className="split__copy">
          <p className="eyebrow reveal">Connections &amp; messaging</p>
          <h2 id="chat-title" className="display-2 reveal">Say hello when it’s mutual.</h2>
          <p className="lead reveal">
            Send a connection request from any recommendation. When it is accepted you can message in real time —
            text and photos — and see when your connection is online, if they allow it.
          </p>
          <ul className="ticks reveal">
            <li>Incoming and sent requests, with accept, decline and cancel</li>
            <li>Real-time private chat with photo sharing</li>
            <li>Block or report from any conversation</li>
          </ul>
        </div>
        <div className="split__art reveal" aria-hidden="true">
          <div className="sketch-chat">
            <div className="sketch-chat__head">
              <span className="sketch-chat__dot" /> Connected
            </div>
            <p className="sketch-bubble sketch-bubble--theirs">Hi! I saw you’re into hiking too.</p>
            <p className="sketch-bubble sketch-bubble--mine">Yes! Any favourite trails?</p>
            <p className="sketch-bubble sketch-bubble--theirs">A few. Video call later?</p>
            <div className="sketch-chat__composer">
              <span />
              <Icon name="send" size={16} />
            </div>
          </div>
        </div>
      </section>

      {/* 7. Video calling */}
      <section className="section video-promo" aria-labelledby="video-title">
        <div className="video-promo__stage reveal" aria-hidden="true">
          <div className="video-promo__remote">
            <span className="video-promo__pulse" />
          </div>
          <div className="video-promo__self" />
          <div className="video-promo__dock">
            <span>
              <Icon name="mic" size={18} />
            </span>
            <span>
              <Icon name="camera" size={18} />
            </span>
            <span className="video-promo__end">
              <Icon name="phone" size={18} />
            </span>
          </div>
        </div>
        <div className="video-promo__copy">
          <p className="eyebrow reveal">Video calling</p>
          <h2 id="video-title" className="display-2 reveal">Face to face, before you meet.</h2>
          <p className="lead reveal">
            Call any of your connections from the chat. Mute, turn the camera off or hang up at any time. Calls go
            directly between your browsers and are never recorded.
          </p>
        </div>
      </section>

      {/* 8. Privacy & safety */}
      <section id="safety" className="section safety" aria-labelledby="safety-title">
        <header className="section__header reveal">
          <p className="eyebrow">Privacy &amp; safety</p>
          <h2 id="safety-title" className="display-2">You decide who sees you.</h2>
        </header>
        <ul className="bento">
          {SAFETY.map((item, i) => (
            <li key={item.title} className={`bento__tile bento__tile--${i} reveal`} style={{ '--reveal-delay': `${(i % 3) * 90}ms` }}>
              <span className="bento__icon" aria-hidden="true">
                <Icon name={item.icon} size={22} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 9. FAQ */}
      <section id="faq" className="section faq" aria-labelledby="faq-title">
        <header className="section__header reveal">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-title" className="display-2">Good to know.</h2>
        </header>
        <div className="faq__list">
          {FAQ.map(([q, a]) => (
            <details key={q} className="faq__item reveal">
              <summary>
                {q}
                <span className="faq__icon" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 10. Sign-up call to action */}
      <section className="section cta" aria-labelledby="cta-title">
        <div className="cta__panel reveal">
          <h2 id="cta-title" className="cta__title">
            Your next great conversation is <span className="text-gradient">waiting.</span>
          </h2>
          <div className="hero__actions">
            <Link to={discover} className="btn btn--primary btn--large">
              {isAuthenticated ? 'See your matches' : 'Create your account'} <Icon name="arrowRight" />
            </Link>
            {!isAuthenticated && (
              <Link to={USER_PATHS.LOGIN} className="btn btn--ghost btn--large">
                Log in
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
