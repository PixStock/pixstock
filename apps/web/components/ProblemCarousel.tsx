import type { Content } from "@/content/site";

/**
 * Four things a tokenized-stock holder has to put up with today, one per slide.
 * Each illustration is a schematic of the failure it names — no product
 * screenshots, so nothing here can go stale between now and the demo.
 */
export function ProblemCarousel({
  dict,
  previous,
  next,
}: {
  dict: Content["home"]["problem"];
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
          {/* 1 · the shares sit inside someone else's account */}
          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide1.kicker}</p>
              <h3>{slide1.title}</h3>
              <p>{slide1.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide1.alt}>
                <text className="an" style={{ "--i": 0 }} x="30" y="46">EXCHANGE ACCOUNT</text>
                <rect className="an" style={{ "--i": 1 }} x="30" y="60" width="248" height="176" rx="10" fill="none" stroke="currentColor" strokeOpacity=".26" />
                <g className="an" style={{ "--i": 2 }}>
                  <text x="50" y="102">TSLAx</text>
                  <text className="hi" x="258" y="102" textAnchor="end">12.400</text>
                  <line x1="50" y1="116" x2="258" y2="116" stroke="currentColor" strokeOpacity=".12" />
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <text x="50" y="150">AAPLx</text>
                  <text className="hi" x="258" y="150" textAnchor="end">31.020</text>
                  <line x1="50" y1="164" x2="258" y2="164" stroke="currentColor" strokeOpacity=".12" />
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <text x="50" y="198">NVDAx</text>
                  <text className="hi" x="258" y="198" textAnchor="end">8.750</text>
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <path d="M298 148h22" stroke="currentColor" strokeOpacity=".3" strokeDasharray="3 4" />
                  <rect x="330" y="134" width="56" height="44" rx="8" fill="currentColor" fillOpacity=".14" />
                  <path d="M347 134v-11a11 11 0 0 1 22 0v11" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.6" />
                  <circle cx="358" cy="156" r="3.4" fill="currentColor" fillOpacity=".6" />
                  <text className="tiny" x="358" y="196" textAnchor="middle">THEIR KEY</text>
                </g>
                <text className="an tiny" style={{ "--i": 6 }} x="30" y="268">WITHDRAWALS CAN PAUSE WHILE THE MARKET IS OPEN</text>
              </svg>
            </div>
          </article>

          {/* 2 · the wallet asks you to approve a hash */}
          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide2.kicker}</p>
              <h3>{slide2.title}</h3>
              <p>{slide2.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide2.alt}>
                <rect className="an" style={{ "--i": 0 }} x="118" y="22" width="184" height="230" rx="18" fill="none" stroke="currentColor" strokeOpacity=".26" />
                <text className="an hi tiny" style={{ "--i": 1 }} x="210" y="58" textAnchor="middle">SIGN TRANSACTION</text>
                <line className="an" style={{ "--i": 1 }} x1="138" y1="72" x2="282" y2="72" stroke="currentColor" strokeOpacity=".14" />
                <g className="an" style={{ "--i": 2 }}>
                  <text x="210" y="108" textAnchor="middle">4f8a91c07 7de2b1</text>
                  <text x="210" y="128" textAnchor="middle">a0c4e5 19bb7d3f</text>
                  <text x="210" y="148" textAnchor="middle">62ca08 d4e1902c</text>
                </g>
                <g className="lift">
                  <rect x="146" y="182" width="128" height="34" rx="8" fill="currentColor" fillOpacity=".18" />
                  <text className="hi" x="210" y="204" textAnchor="middle">APPROVE</text>
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <path d="M96 128c-16 22-14 62 14 86" fill="none" stroke="currentColor" strokeOpacity=".3" strokeDasharray="3 4" />
                  <path d="M104 122l-9 7 2 11" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" strokeLinejoin="round" />
                </g>
                <text className="an tiny" style={{ "--i": 6 }} x="210" y="286" textAnchor="middle">WHICH ACCOUNT? HOW MUCH? AT WHAT PRICE?</text>
              </svg>
            </div>
          </article>

          {/* 3 · a second asset stands between you and the first share */}
          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide3.kicker}</p>
              <h3>{slide3.title}</h3>
              <p>{slide3.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide3.alt}>
                <text className="an" style={{ "--i": 0 }} x="30" y="44">BEFORE YOUR FIRST SHARE</text>
                <g className="an" style={{ "--i": 1 }}>
                  <rect x="30" y="62" width="108" height="34" rx="17" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <text className="tiny" x="84" y="83" textAnchor="middle">BUY SOL</text>
                  <path d="M146 79h14" stroke="currentColor" strokeOpacity=".35" />
                </g>
                <g className="an" style={{ "--i": 2 }}>
                  <rect x="168" y="62" width="108" height="34" rx="17" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <text className="tiny" x="222" y="83" textAnchor="middle">PAY THE RENT</text>
                  <path d="M284 79h14" stroke="currentColor" strokeOpacity=".35" />
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <rect x="306" y="62" width="84" height="34" rx="17" fill="none" stroke="currentColor" strokeOpacity=".26" />
                  <text className="tiny" x="348" y="83" textAnchor="middle">TOP IT UP</text>
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <rect x="30" y="132" width="360" height="62" rx="10" fill="none" stroke="currentColor" strokeOpacity=".3" strokeDasharray="5 5" />
                  <text className="hi" x="210" y="169" textAnchor="middle">BUY 1 TSLAx</text>
                </g>
                <g className="an" style={{ "--i": 5 }}>
                  <text x="210" y="222" textAnchor="middle">FEE BALANCE 0.000 SOL</text>
                  <path d="M104 210l12 12M116 210l-12 12" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round" />
                </g>
                <text className="an tiny" style={{ "--i": 6 }} x="210" y="264" textAnchor="middle">THE ASSET YOU WANT IS NOT THE ASSET YOU NEED</text>
              </svg>
            </div>
          </article>

          {/* 4 · nothing compares the order to the market */}
          <article className="car-slide">
            <div className="car-text">
              <p className="car-kicker">{slide4.kicker}</p>
              <h3>{slide4.title}</h3>
              <p>{slide4.body}</p>
            </div>
            <div className="car-shot">
              <svg viewBox="0 0 420 300" role="img" aria-label={slide4.alt}>
                <text className="an" style={{ "--i": 0 }} x="30" y="42">TSLAx · PRICE AT SIGNATURE</text>
                <path
                  className="an"
                  style={{ "--i": 1 }}
                  d="M34 208 78 192 116 200 156 164 198 176 240 140 282 152 324 118 366 108"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity=".4"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <g className="an" style={{ "--i": 2 }}>
                  <path d="M30 108h336" stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 5" />
                  <text className="hi" x="30" y="98">MARKET 412.60</text>
                </g>
                <g className="an" style={{ "--i": 3 }}>
                  <path d="M30 168h336" stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 5" />
                  <circle cx="240" cy="168" r="4.2" fill="currentColor" fillOpacity=".8" />
                  <text x="30" y="188">SIGNED 389.10</text>
                </g>
                <g className="an" style={{ "--i": 4 }}>
                  <path d="M380 108v60M374 108h12M374 168h12" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.3" />
                  <text className="tiny hi" x="368" y="142" textAnchor="end">−5.7 %</text>
                </g>
                <text className="an tiny" style={{ "--i": 6 }} x="30" y="262">NO WALLET CHECKS THIS, AND THE SIGNATURE IS FINAL</text>
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
