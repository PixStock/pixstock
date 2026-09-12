import type { Dictionary } from "@/i18n/getDictionary";

export function ProblemCarousel({
  dict,
  previous,
  next,
}: {
  dict: Dictionary["home"]["problem"];
  previous: string;
  next: string;
}) {
  const [slide1, slide2, slide3, slide4] = dict.slides;

  return (
    <section className="band band--invert car" id="problem">
      <div className="shell car-head">
        <p className="eyebrow">{dict.eyebrow}</p>
        <h2 className="title appear">{dict.title}</h2>
        <p className="lede appear" style={{ "--d": "80ms" }}>
          {dict.lede}
        </p>
      </div>

      <div className="car-rail" id="car-rail">
        <div className="car-track" id="car-track">
          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide1.kicker}</p>
              <h3>{slide1.title}</h3>
              <p>{slide1.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide1.alt}>
                <rect className="an" style={{ "--i": 0 }} x="30" y="26" width="360" height="248" rx="10" fill="none" stroke="currentColor" strokeOpacity=".2" />
                <circle className="an" style={{ "--i": 1 }} cx="61" cy="61" r="13" fill="currentColor" fillOpacity=".16" />
                <rect className="an" style={{ "--i": 1 }} x="84" y="53" width="92" height="7" rx="3.5" fill="currentColor" fillOpacity=".45" />
                <rect className="an" style={{ "--i": 1 }} x="84" y="67" width="44" height="6" rx="3" fill="currentColor" fillOpacity=".2" />
                <line className="an" style={{ "--i": 2 }} x1="30" y1="94" x2="390" y2="94" stroke="currentColor" strokeOpacity=".14" />
                <g className="an" style={{ "--i": 3 }}>
                  <text x="50" y="123">LIQUIDITY LOCK</text>
                  <rect x="248" y="112" width="124" height="14" rx="3" fill="currentColor" fillOpacity=".82" />
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <text x="50" y="163">MINT AUTHORITY</text>
                  <rect x="248" y="152" width="124" height="14" rx="3" fill="currentColor" fillOpacity=".82" />
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <text x="50" y="203">DEPLOYER HISTORY</text>
                  <rect x="248" y="192" width="124" height="14" rx="3" fill="currentColor" fillOpacity=".82" />
                </g>
                <g className="an" style={{ "--i": 6 }}>
                  <text x="50" y="243">PRICE</text>
                  <text className="hi" x="372" y="243" textAnchor="end">$0.0041</text>
                </g>
              </svg>
            </div>
          </article>

          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide2.kicker}</p>
              <h3>{slide2.title}</h3>
              <p>{slide2.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide2.alt}>
                <text className="an" style={{ "--i": 0 }} x="46" y="52">TOP TRENDING</text>
                <g className="lift">
                  <rect x="30" y="66" width="360" height="42" rx="8" fill="currentColor" fillOpacity=".13" />
                  <text x="46" y="92" className="hi">1</text>
                  <rect x="72" y="82" width="104" height="9" rx="4.5" fill="currentColor" fillOpacity=".6" />
                  <rect x="252" y="76" width="122" height="22" rx="11" fill="none" stroke="currentColor" strokeOpacity=".45" />
                  <text className="tiny hi" x="313" y="91" textAnchor="middle">SPONSORED</text>
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <text x="46" y="128">2</text>
                  <rect x="72" y="121" width="96" height="8" rx="4" fill="currentColor" fillOpacity=".3" />
                  <rect x="300" y="121" width="72" height="8" rx="4" fill="currentColor" fillOpacity=".16" />
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <text x="46" y="168">3</text>
                  <rect x="72" y="161" width="74" height="8" rx="4" fill="currentColor" fillOpacity=".3" />
                  <rect x="300" y="161" width="72" height="8" rx="4" fill="currentColor" fillOpacity=".16" />
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <text x="46" y="208">4</text>
                  <rect x="72" y="201" width="88" height="8" rx="4" fill="currentColor" fillOpacity=".3" />
                  <rect x="300" y="201" width="72" height="8" rx="4" fill="currentColor" fillOpacity=".16" />
                </g>
                <g className="an" style={{ "--i": 6 }}>
                  <text x="46" y="248">5</text>
                  <rect x="72" y="241" width="62" height="8" rx="4" fill="currentColor" fillOpacity=".3" />
                  <rect x="300" y="241" width="72" height="8" rx="4" fill="currentColor" fillOpacity=".16" />
                </g>
              </svg>
            </div>
          </article>

          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide3.kicker}</p>
              <h3>{slide3.title}</h3>
              <p>{slide3.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide3.alt}>
                <text className="an" style={{ "--i": 0 }} x="30" y="96">POOL</text>
                <rect className="an" style={{ "--i": 1 }} x="30" y="108" width="228" height="30" rx="6" fill="none" stroke="currentColor" strokeOpacity=".28" />
                <rect className="drain" x="34" y="112" width="220" height="22" rx="4" fill="currentColor" fillOpacity=".72" />
                <g className="an" style={{ "--i": 2 }}>
                  <path d="M270 123h40" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" />
                  <path d="M304 118l7 5-7 5" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" strokeLinejoin="round" />
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <rect x="322" y="100" width="66" height="46" rx="7" fill="currentColor" fillOpacity=".16" />
                  <text className="tiny" x="355" y="127" textAnchor="middle">DEPLOYER</text>
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <path d="M60 176v34h300v-34" fill="none" stroke="currentColor" strokeOpacity=".18" strokeDasharray="3 4" />
                  <rect x="128" y="212" width="164" height="38" rx="8" fill="none" stroke="currentColor" strokeOpacity=".24" />
                  <text className="tiny" x="210" y="236" textAnchor="middle">CONSEQUENCE</text>
                  <path d="M140 246l140-30" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.4" />
                </g>
              </svg>
            </div>
          </article>

          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide4.kicker}</p>
              <h3>{slide4.title}</h3>
              <p>{slide4.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide4.alt}>
                <text className="an" style={{ "--i": 0 }} x="30" y="88">TRACK RECORD, PER ACCOUNT</text>
                <g className="an" style={{ "--i": 1 }}>
                  <rect x="30" y="112" width="112" height="76" rx="9" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <rect x="44" y="126" width="18" height="18" rx="4" fill="currentColor" fillOpacity=".2" />
                  <text x="70" y="141">7xK…a4</text>
                  <text className="tiny" x="44" y="172">SCORE 0</text>
                </g>
                <g className="an" style={{ "--i": 2 }}>
                  <rect x="154" y="112" width="112" height="76" rx="9" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <rect x="168" y="126" width="18" height="18" rx="4" fill="currentColor" fillOpacity=".2" />
                  <text x="194" y="141">Bq2…9f</text>
                  <text className="tiny" x="168" y="172">SCORE 0</text>
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <rect x="278" y="112" width="112" height="76" rx="9" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <rect x="292" y="126" width="18" height="18" rx="4" fill="currentColor" fillOpacity=".2" />
                  <text x="318" y="141">Ldv…c1</text>
                  <text className="tiny" x="292" y="172">SCORE 0</text>
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <path d="M334 200v26H86v-26" fill="none" stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 5" />
                  <path d="M81 211l5-7 5 7" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" strokeLinejoin="round" />
                  <text className="tiny" x="210" y="248" textAnchor="middle">NEW ACCOUNT, HISTORY GONE</text>
                </g>
              </svg>
            </div>
          </article>
        </div>
      </div>

      <div className="car-nav">
        <button className="car-arrow" id="car-prev" type="button" aria-label={previous}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.5 1.5 3 6l4.5 4.5" />
          </svg>
        </button>
        <div className="car-dots" id="car-dots" />
        <button className="car-arrow" id="car-next" type="button" aria-label={next}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 1.5 9 6l-4.5 4.5" />
          </svg>
        </button>
      </div>
    </section>
  );
}
