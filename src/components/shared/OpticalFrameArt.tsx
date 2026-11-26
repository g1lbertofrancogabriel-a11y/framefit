import React from 'react';

export const SUPPORTED_SVG_FRAMES = new Set([
  'svg:wp-percey',
  'svg:wp-durand',
  'svg:wp-wright',
  'svg:ow-air',
  'svg:ow-dillinger',
  'svg:gm-unac',
  'svg:gm-ade',
  'svg:rb-roundmetal',
  'svg:rb-wayfarer',
  'svg:op-gregorypeck',
  'svg:ms-lemtosh',
  'svg:pr-cateye',
]);

interface OpticalFrameArtProps {
  frameKey: string;
  alt: string;
  className?: string;
}

export const OpticalFrameArt: React.FC<OpticalFrameArtProps> = ({
  frameKey,
  alt,
  className = 'w-full h-full object-contain',
}) => {
  switch (frameKey) {
    // 1. Warby Parker Percey — Chestnut Tortoise round keyhole-bridge acetate
    case 'svg:wp-percey':
      return (
        <svg viewBox="0 0 520 164" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="wpPerceyTort" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6D3B1A" />
              <stop offset="28%" stopColor="#3B1D0B" />
              <stop offset="56%" stopColor="#8F5124" />
              <stop offset="82%" stopColor="#2F1608" />
              <stop offset="100%" stopColor="#673717" />
            </linearGradient>
            <linearGradient id="wpLens" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(225,244,255,0.28)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(185,222,245,0.18)" />
            </linearGradient>
          </defs>
          {/* Folded temples behind */}
          <path d="M24 52 L74 112" stroke="#3B1D0B" strokeWidth="11" strokeLinecap="round" opacity="0.65" />
          <path d="M496 52 L446 112" stroke="#3B1D0B" strokeWidth="11" strokeLinecap="round" opacity="0.65" />
          {/* Left & Right round lenses */}
          <ellipse cx="144" cy="84" rx="84" ry="62" fill="url(#wpLens)" />
          <ellipse cx="376" cy="84" rx="84" ry="62" fill="url(#wpLens)" />
          {/* Acetate frame rims */}
          <ellipse cx="144" cy="84" rx="84" ry="62" fill="none" stroke="url(#wpPerceyTort)" strokeWidth="14" />
          <ellipse cx="376" cy="84" rx="84" ry="62" fill="none" stroke="url(#wpPerceyTort)" strokeWidth="14" />
          {/* Keyhole bridge */}
          <path d="M225 66 Q260 54 295 66" fill="none" stroke="url(#wpPerceyTort)" strokeWidth="13" strokeLinecap="round" />
          {/* End-pieces & silver rivets */}
          <path d="M24 54 H60 M460 54 H496" stroke="url(#wpPerceyTort)" strokeWidth="14" strokeLinecap="round" />
          <circle cx="46" cy="54" r="3.2" fill="#D9DFE6" />
          <circle cx="474" cy="54" r="3.2" fill="#D9DFE6" />
          {/* Specular sheen */}
          <path d="M92 52 L118 42" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M324 52 L350 42" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );

    // 2. Warby Parker Durand — Smoked Crystal medium-wide rectangle
    case 'svg:wp-durand':
      return (
        <svg viewBox="0 0 520 156" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="wpDurandSmoke" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6B7580" stopOpacity="0.92" />
              <stop offset="50%" stopColor="#8F9BA6" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#525B64" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <path d="M22 46 L72 108" stroke="#4D565F" strokeWidth="10" strokeLinecap="round" opacity="0.58" />
          <path d="M498 46 L448 108" stroke="#4D565F" strokeWidth="10" strokeLinecap="round" opacity="0.58" />
          <rect x="48" y="24" width="184" height="106" rx="22" fill="rgba(220,240,255,0.16)" stroke="url(#wpDurandSmoke)" strokeWidth="14" />
          <rect x="288" y="24" width="184" height="106" rx="22" fill="rgba(220,240,255,0.16)" stroke="url(#wpDurandSmoke)" strokeWidth="14" />
          <path d="M232 54 Q260 44 288 54" fill="none" stroke="url(#wpDurandSmoke)" strokeWidth="12" strokeLinecap="round" />
          <path d="M18 44 H52 M468 44 H502" stroke="url(#wpDurandSmoke)" strokeWidth="14" strokeLinecap="round" />
          <rect x="33" y="40" width="9" height="4" rx="2" fill="#E6ECF2" />
          <rect x="478" y="40" width="9" height="4" rx="2" fill="#E6ECF2" />
        </svg>
      );

    // 3. Warby Parker Wright — Whiskey Tortoise structured square
    case 'svg:wp-wright':
      return (
        <svg viewBox="0 0 520 162" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="wpWrightWhiskey" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A6652E" />
              <stop offset="40%" stopColor="#7A4216" />
              <stop offset="70%" stopColor="#BF7C3E" />
              <stop offset="100%" stopColor="#5C2F0E" />
            </linearGradient>
          </defs>
          <path d="M24 44 L80 112" stroke="#5C2F0E" strokeWidth="11" strokeLinecap="round" opacity="0.62" />
          <path d="M496 44 L440 112" stroke="#5C2F0E" strokeWidth="11" strokeLinecap="round" opacity="0.62" />
          <path
            d="M46 28 Q138 22 230 32 L222 118 Q216 136 138 136 Q56 136 52 114 Z"
            fill="rgba(225,244,255,0.16)"
            stroke="url(#wpWrightWhiskey)"
            strokeWidth="15"
            strokeLinejoin="round"
          />
          <path
            d="M474 28 Q382 22 290 32 L298 118 Q304 136 382 136 Q464 136 468 114 Z"
            fill="rgba(225,244,255,0.16)"
            stroke="url(#wpWrightWhiskey)"
            strokeWidth="15"
            strokeLinejoin="round"
          />
          <path d="M228 50 Q260 40 292 50" fill="none" stroke="url(#wpWrightWhiskey)" strokeWidth="13" />
          <path d="M18 42 H50 M470 42 H502" stroke="url(#wpWrightWhiskey)" strokeWidth="14" strokeLinecap="round" />
          <circle cx="38" cy="42" r="3" fill="#E8C77B" />
          <circle cx="482" cy="42" r="3" fill="#E8C77B" />
        </svg>
      );

    // 4. OWNDAYS AIR Ultrafelt AU2089 — Matte Navy featherweight Ultem rectangle
    case 'svg:ow-air':
      return (
        <svg viewBox="0 0 520 144" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="owAirNavy" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#263D5C" />
              <stop offset="50%" stopColor="#1B2B44" />
              <stop offset="100%" stopColor="#101B2D" />
            </linearGradient>
          </defs>
          <path d="M20 44 L76 102" stroke="#16243A" strokeWidth="8" strokeLinecap="round" opacity="0.65" />
          <path d="M500 44 L444 102" stroke="#16243A" strokeWidth="8" strokeLinecap="round" opacity="0.65" />
          <rect x="46" y="24" width="186" height="96" rx="16" fill="rgba(220,242,255,0.16)" stroke="url(#owAirNavy)" strokeWidth="10" />
          <rect x="288" y="24" width="186" height="96" rx="16" fill="rgba(220,242,255,0.16)" stroke="url(#owAirNavy)" strokeWidth="10" />
          <path d="M232 52 Q260 44 288 52" fill="none" stroke="url(#owAirNavy)" strokeWidth="9" strokeLinecap="round" />
          {/* Nose pads */}
          <ellipse cx="236" cy="74" rx="4.5" ry="9" fill="rgba(210,225,240,0.65)" stroke="#8B99AA" strokeWidth="1.5" />
          <ellipse cx="284" cy="74" rx="4.5" ry="9" fill="rgba(210,225,240,0.65)" stroke="#8B99AA" strokeWidth="1.5" />
          <path d="M16 42 H48 M472 42 H504" stroke="url(#owAirNavy)" strokeWidth="10" strokeLinecap="round" />
        </svg>
      );

    // 5. OWNDAYS John Dillinger JD1042 — Havana / Brushed Gold Browline
    case 'svg:ow-dillinger':
      return (
        <svg viewBox="0 0 520 162" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="owDillHavana" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5C3218" />
              <stop offset="50%" stopColor="#321809" />
              <stop offset="100%" stopColor="#6B3A1B" />
            </linearGradient>
            <linearGradient id="owDillGold" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E6C67A" />
              <stop offset="50%" stopColor="#B89242" />
              <stop offset="100%" stopColor="#8B6B29" />
            </linearGradient>
          </defs>
          <path d="M24 46 L76 112" stroke="#4D2912" strokeWidth="9" strokeLinecap="round" opacity="0.62" />
          <path d="M496 46 L444 112" stroke="#4D2912" strokeWidth="9" strokeLinecap="round" opacity="0.62" />
          {/* Gold lower wire rims */}
          <path d="M56 62 C52 114 78 136 142 136 C204 136 226 112 224 62 Z" fill="rgba(225,244,255,0.16)" stroke="url(#owDillGold)" strokeWidth="5.5" />
          <path d="M464 62 C468 114 442 136 378 136 C316 136 294 112 296 62 Z" fill="rgba(225,244,255,0.16)" stroke="url(#owDillGold)" strokeWidth="5.5" />
          {/* Gold bridge & nose pads */}
          <path d="M224 54 Q260 44 296 54" fill="none" stroke="url(#owDillGold)" strokeWidth="6" />
          <ellipse cx="234" cy="76" rx="4.5" ry="9" fill="rgba(240,228,195,0.75)" stroke="#B89242" strokeWidth="1.4" />
          <ellipse cx="286" cy="76" rx="4.5" ry="9" fill="rgba(240,228,195,0.75)" stroke="#B89242" strokeWidth="1.4" />
          {/* Thick Havana top browline */}
          <path d="M36 46 C62 20 198 20 228 46 L224 62 C196 44 74 44 52 64 Z" fill="url(#owDillHavana)" />
          <path d="M484 46 C458 20 322 20 292 46 L296 62 C324 44 446 44 468 64 Z" fill="url(#owDillHavana)" />
          <circle cx="48" cy="46" r="3" fill="#E6C67A" />
          <circle cx="472" cy="46" r="3" fill="#E6C67A" />
        </svg>
      );

    // 6. Gentle Monster Una.C — Crystal Clear / Silver sculptural square
    case 'svg:gm-unac':
      return (
        <svg viewBox="0 0 520 164" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="gmCrystal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
              <stop offset="45%" stopColor="#DDE6EE" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#B8C5D4" stopOpacity="0.88" />
            </linearGradient>
          </defs>
          <path d="M24 44 L80 116" stroke="#9AA8B8" strokeWidth="12" strokeLinecap="round" opacity="0.52" />
          <path d="M496 44 L440 116" stroke="#9AA8B8" strokeWidth="12" strokeLinecap="round" opacity="0.52" />
          <rect x="44" y="22" width="188" height="118" rx="24" fill="rgba(235,247,255,0.22)" stroke="url(#gmCrystal)" strokeWidth="16" />
          <rect x="44" y="22" width="188" height="118" rx="24" fill="none" stroke="#8C9AA8" strokeWidth="1.8" />
          <rect x="288" y="22" width="188" height="118" rx="24" fill="rgba(235,247,255,0.22)" stroke="url(#gmCrystal)" strokeWidth="16" />
          <rect x="288" y="22" width="188" height="118" rx="24" fill="none" stroke="#8C9AA8" strokeWidth="1.8" />
          <path d="M232 54 Q260 44 288 54" fill="none" stroke="url(#gmCrystal)" strokeWidth="14" />
          <path d="M232 54 Q260 44 288 54" fill="none" stroke="#8C9AA8" strokeWidth="1.6" />
          <path d="M16 42 H46 M474 42 H504" stroke="url(#gmCrystal)" strokeWidth="15" strokeLinecap="round" />
          {/* Gentle Monster signature dual metallic studs */}
          <circle cx="34" cy="40" r="2.6" fill="#525D68" />
          <circle cx="34" cy="48" r="2.6" fill="#525D68" />
          <circle cx="486" cy="40" r="2.6" fill="#525D68" />
          <circle cx="486" cy="48" r="2.6" fill="#525D68" />
        </svg>
      );

    // 7. Gentle Monster Ade — Obsidian Black architectural geometric
    case 'svg:gm-ade':
      return (
        <svg viewBox="0 0 520 154" className={className} aria-label={alt}>
          <path d="M20 42 L74 108" stroke="#181C22" strokeWidth="12" strokeLinecap="round" opacity="0.65" />
          <path d="M500 42 L446 108" stroke="#181C22" strokeWidth="12" strokeLinecap="round" opacity="0.65" />
          <polygon
            points="44,28 228,34 220,118 68,124 44,96"
            fill="rgba(220,242,255,0.16)"
            stroke="#161A20"
            strokeWidth="15"
            strokeLinejoin="round"
          />
          <polygon
            points="476,28 292,34 300,118 452,124 476,96"
            fill="rgba(220,242,255,0.16)"
            stroke="#161A20"
            strokeWidth="15"
            strokeLinejoin="round"
          />
          <path d="M226 48 H294" stroke="#161A20" strokeWidth="14" strokeLinecap="round" />
          <path d="M16 38 H46 M474 38 H504" stroke="#161A20" strokeWidth="15" strokeLinecap="round" />
          <rect x="28" y="35" width="12" height="5" rx="1.5" fill="#D4DCE6" />
          <rect x="480" y="35" width="12" height="5" rx="1.5" fill="#D4DCE6" />
        </svg>
      );

    // 8. Ray-Ban RB3447V Round Metal — Antique Gold thin wire
    case 'svg:rb-roundmetal':
      return (
        <svg viewBox="0 0 520 164" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="rbAntGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E6C56E" />
              <stop offset="50%" stopColor="#B38B34" />
              <stop offset="100%" stopColor="#8B6822" />
            </linearGradient>
          </defs>
          <path d="M26 56 L78 112" stroke="#8B6822" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          <path d="M494 56 L442 112" stroke="#8B6822" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          <circle cx="146" cy="84" r="68" fill="rgba(225,244,255,0.16)" stroke="url(#rbAntGold)" strokeWidth="5.5" />
          <circle cx="374" cy="84" r="68" fill="rgba(225,244,255,0.16)" stroke="url(#rbAntGold)" strokeWidth="5.5" />
          <path d="M214 66 Q260 50 306 66" fill="none" stroke="url(#rbAntGold)" strokeWidth="5.5" strokeLinecap="round" />
          <ellipse cx="232" cy="82" rx="4.5" ry="9" fill="rgba(240,228,195,0.75)" stroke="#B38B34" strokeWidth="1.5" />
          <ellipse cx="288" cy="82" rx="4.5" ry="9" fill="rgba(240,228,195,0.75)" stroke="#B38B34" strokeWidth="1.5" />
          <path d="M18 56 H78 M442 56 H502" stroke="url(#rbAntGold)" strokeWidth="5.5" strokeLinecap="round" />
        </svg>
      );

    // 9. Ray-Ban RX5121 Original Wayfarer — Havana Tortoise
    case 'svg:rb-wayfarer':
      return (
        <svg viewBox="0 0 520 162" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="rbWayHavana" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4F2611" />
              <stop offset="35%" stopColor="#1E0E06" />
              <stop offset="70%" stopColor="#753919" />
              <stop offset="100%" stopColor="#261107" />
            </linearGradient>
          </defs>
          <path d="M22 44 L80 118" stroke="#2B1408" strokeWidth="13" strokeLinecap="round" opacity="0.65" />
          <path d="M498 44 L440 118" stroke="#2B1408" strokeWidth="13" strokeLinecap="round" opacity="0.65" />
          <path
            d="M36 24 C104 20 198 22 230 34 C228 84 218 128 164 134 C102 140 62 122 50 76 Z"
            fill="rgba(220,240,255,0.16)"
            stroke="url(#rbWayHavana)"
            strokeWidth="16"
            strokeLinejoin="round"
          />
          <path
            d="M484 24 C416 20 322 22 290 34 C292 84 302 128 356 134 C418 140 458 122 470 76 Z"
            fill="rgba(220,240,255,0.16)"
            stroke="url(#rbWayHavana)"
            strokeWidth="16"
            strokeLinejoin="round"
          />
          <path d="M228 48 Q260 40 292 48" fill="none" stroke="url(#rbWayHavana)" strokeWidth="15" />
          <path d="M16 36 H48 M472 36 H504" stroke="url(#rbWayHavana)" strokeWidth="16" strokeLinecap="round" />
          {/* Iconic metallic wing rivets */}
          <ellipse cx="42" cy="36" rx="5.5" ry="2.5" fill="#DCE2E8" />
          <ellipse cx="478" cy="36" rx="5.5" ry="2.5" fill="#DCE2E8" />
        </svg>
      );

    // 10. Oliver Peoples Gregory Peck OV5186 — Clear Olive vintage panto oval
    case 'svg:op-gregorypeck':
      return (
        <svg viewBox="0 0 520 162" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="opOlive" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6D7A53" stopOpacity="0.92" />
              <stop offset="50%" stopColor="#859467" stopOpacity="0.86" />
              <stop offset="100%" stopColor="#556140" stopOpacity="0.94" />
            </linearGradient>
          </defs>
          <path d="M24 52 L76 112" stroke="#556140" strokeWidth="10" strokeLinecap="round" opacity="0.58" />
          <path d="M496 52 L444 112" stroke="#556140" strokeWidth="10" strokeLinecap="round" opacity="0.58" />
          <path
            d="M64 78 C64 36 100 22 146 22 C192 22 224 42 224 78 C224 116 188 140 144 140 C98 140 64 116 64 78 Z"
            fill="rgba(225,244,255,0.16)"
            stroke="url(#opOlive)"
            strokeWidth="13"
          />
          <path
            d="M456 78 C456 36 420 22 374 22 C328 22 296 42 296 78 C296 116 332 140 376 140 C422 140 456 116 456 78 Z"
            fill="rgba(225,244,255,0.16)"
            stroke="url(#opOlive)"
            strokeWidth="13"
          />
          <path d="M222 58 Q260 44 298 58" fill="none" stroke="url(#opOlive)" strokeWidth="12" strokeLinecap="round" />
          <path d="M22 50 H66 M454 50 H498" stroke="url(#opOlive)" strokeWidth="13" strokeLinecap="round" />
          <circle cx="42" cy="50" r="2.5" fill="#E6ECE2" />
          <circle cx="48" cy="50" r="2.5" fill="#E6ECE2" />
          <circle cx="472" cy="50" r="2.5" fill="#E6ECE2" />
          <circle cx="478" cy="50" r="2.5" fill="#E6ECE2" />
        </svg>
      );

    // 11. MOSCOT Lemtosh Optical — Sage Tortoise diamond-rivet classic
    case 'svg:ms-lemtosh':
      return (
        <svg viewBox="0 0 520 164" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="msSageTort" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#465848" />
              <stop offset="45%" stopColor="#263328" />
              <stop offset="80%" stopColor="#657A60" />
              <stop offset="100%" stopColor="#2E3D30" />
            </linearGradient>
          </defs>
          <path d="M22 48 L74 114" stroke="#263328" strokeWidth="12" strokeLinecap="round" opacity="0.65" />
          <path d="M498 48 L446 114" stroke="#263328" strokeWidth="12" strokeLinecap="round" opacity="0.65" />
          <ellipse cx="146" cy="84" rx="82" ry="60" fill="rgba(220,242,255,0.16)" stroke="url(#msSageTort)" strokeWidth="16" />
          <ellipse cx="374" cy="84" rx="82" ry="60" fill="rgba(220,242,255,0.16)" stroke="url(#msSageTort)" strokeWidth="16" />
          <path d="M224 62 Q260 48 296 62" fill="none" stroke="url(#msSageTort)" strokeWidth="14" />
          <path d="M18 46 H64 M456 46 H502" stroke="url(#msSageTort)" strokeWidth="16" strokeLinecap="round" />
          {/* Signature diamond rivets */}
          <polygon points="44,40 50,46 44,52 38,46" fill="#DCE2E8" />
          <polygon points="476,40 482,46 476,52 470,46" fill="#DCE2E8" />
        </svg>
      );

    // 12. Persol PO3292V Tailored Cat-Eye — Espresso / Gold Arrow
    case 'svg:pr-cateye':
    default:
      return (
        <svg viewBox="0 0 520 162" className={className} aria-label={alt}>
          <defs>
            <linearGradient id="prEspresso" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5C232A" />
              <stop offset="50%" stopColor="#351116" />
              <stop offset="100%" stopColor="#722D36" />
            </linearGradient>
          </defs>
          <path d="M22 42 L78 112" stroke="#351116" strokeWidth="11" strokeLinecap="round" opacity="0.62" />
          <path d="M498 42 L442 112" stroke="#351116" strokeWidth="11" strokeLinecap="round" opacity="0.62" />
          <path
            d="M32 30 C92 22 184 32 226 58 C228 106 198 134 144 134 C84 134 52 104 46 60 Z"
            fill="rgba(255,242,246,0.18)"
            stroke="url(#prEspresso)"
            strokeWidth="14"
            strokeLinejoin="round"
          />
          <path
            d="M488 30 C428 22 336 32 294 58 C292 106 322 134 376 134 C436 134 468 104 474 60 Z"
            fill="rgba(255,242,246,0.18)"
            stroke="url(#prEspresso)"
            strokeWidth="14"
            strokeLinejoin="round"
          />
          <path d="M226 58 Q260 44 294 58" fill="none" stroke="url(#prEspresso)" strokeWidth="12" />
          {/* Silver/Gold Persol Arrow hinge accent */}
          <path d="M18 32 H42 L48 37 L42 42 H18" fill="none" stroke="#E5C87B" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M502 32 H478 L472 37 L478 42 H502" fill="none" stroke="#E5C87B" strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      );
  }
};
