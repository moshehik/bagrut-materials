import s from "./nut-crack-art.module.css";

/** קו המתאר של האגוז — משותף לאגוז השלם ולשני החצאים כדי שההחלפה ביניהם תהיה בלתי נראית */
const SHELL_L = "M200 118 C160 112 128 138 126 188 C124 232 156 258 200 258";
const SHELL_R = "M200 118 C240 112 272 138 274 188 C276 232 244 258 200 258";
/** קו התפר המשוונן שבו האגוז נסדק (מלמטה למעלה) */
const ZIG_BACK = "L205 242 L194 224 L207 203 L193 182 L208 160 L192 140 Z";
const ZIG_DOWN = "M200 118 L192 140 L208 160 L193 182 L207 203 L194 224 L205 242 L200 258";

const Spark = ({ x, y, cls }: { x: number; y: number; cls: string }) => (
  <g className={`${s.t} ${s.spark} ${cls}`} style={{ transformOrigin: `${x}px ${y}px` }}>
    <path d={`M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}`} />
    <path d={`M${x - 3} ${y - 3} L${x + 3} ${y + 3} M${x + 3} ${y - 3} L${x - 3} ${y + 3}`} />
  </g>
);

/** אנימציית פיצוח אגוז בקו שחור דק — מתחת לכותרת "בואי תפצחי את זה לעומק" */
export function NutCrackArt() {
  return (
    <svg className={s.art} viewBox="60 0 280 280" aria-hidden>
      <g className={s.scene}>
        {/* קרקע */}
        <path className={`${s.t} ${s.ground}`} pathLength={1} strokeDasharray={1} d="M118 268 H282" />
        <path className={`${s.t} ${s.ground2}`} pathLength={1} strokeDasharray={1} d="M146 274 H254" />

        <g className={s.nut}>
          {/* האגוז השלם */}
          <g className={s.whole}>
            <path className={`${s.l} ${s.outline}`} pathLength={1} strokeDasharray={1} d="M200 118 C160 112 128 138 126 188 C124 232 156 258 200 258 C244 258 276 232 274 188 C272 138 240 112 200 118 Z" />
            <g className={`${s.t} ${s.details}`}>
              <path d="M197 124 C193 160 203 212 198 254" />
              <path d="M203 124 C199 160 209 212 202 254" />
              <path d="M150 150 C142 168 142 192 150 212" />
              <path d="M164 134 C156 142 152 150 151 158" />
              <path d="M168 168 C162 182 164 198 170 210" />
              <path d="M158 228 C168 240 182 246 194 246" />
              <path d="M176 148 C172 158 172 168 176 176" />
              <path d="M250 150 C258 168 258 192 250 212" />
              <path d="M236 134 C244 142 248 150 249 158" />
              <path d="M232 168 C238 182 236 198 230 210" />
              <path d="M242 228 C232 240 218 246 206 246" />
              <path d="M224 148 C228 158 228 168 224 176" />
            </g>
          </g>

          {/* הסדק */}
          <path className={`${s.l} ${s.crack}`} pathLength={1} strokeDasharray={1} d={ZIG_DOWN} />

          {/* שני חצאי הקליפה */}
          <g className={s.halves}>
            <g className={s.left}>
              <path className={s.l} d={`${SHELL_L} ${ZIG_BACK}`} />
              <path className={s.t} d="M150 150 C142 168 142 192 150 212" />
              <path className={s.t} d="M164 134 C156 142 152 150 151 158" />
              <path className={s.t} d="M168 168 C162 182 164 198 170 210" />
              <path className={s.t} d="M158 228 C168 240 182 246 194 246" />
              <path className={s.t} d="M176 148 C172 158 172 168 176 176" />
            </g>
            <g className={s.right}>
              <path className={s.l} d={`${SHELL_R} ${ZIG_BACK}`} />
              <path className={s.t} d="M250 150 C258 168 258 192 250 212" />
              <path className={s.t} d="M236 134 C244 142 248 150 249 158" />
              <path className={s.t} d="M232 168 C238 182 236 198 230 210" />
              <path className={s.t} d="M242 228 C232 240 218 246 206 246" />
              <path className={s.t} d="M224 148 C228 158 228 168 224 176" />
            </g>
          </g>

          {/* הגרעין */}
          <g className={s.kernel}>
            <path className={s.l} d="M198 160 C180 148 154 154 152 176 C142 184 144 202 153 210 C151 228 170 240 188 234 C193 237 197 235 198 231 C196 210 200 180 198 160 Z" />
            <path className={s.l} d="M202 160 C220 148 246 154 248 176 C258 184 256 202 247 210 C249 228 230 240 212 234 C207 237 203 235 202 231 C204 210 200 180 202 160 Z" />
            <path className={s.t} d="M170 170 C180 166 188 172 184 182 C180 190 168 188 170 180" />
            <path className={s.t} d="M162 196 C172 192 182 198 178 208 C176 216 164 214 164 206" />
            <path className={s.t} d="M182 214 C188 212 194 218 190 224" />
            <path className={s.t} d="M230 170 C220 166 212 172 216 182 C220 190 232 188 230 180" />
            <path className={s.t} d="M238 196 C228 192 218 198 222 208 C224 216 236 214 236 206" />
            <path className={s.t} d="M218 214 C212 212 206 218 210 224" />
          </g>

          {/* קרני גילוי מעל הגרעין */}
          <g className={`${s.t} ${s.rays}`}>
            <path d="M200 144 V130" />
            <path d="M226 151 L233 138" />
            <path d="M174 151 L167 138" />
            <path d="M243 164 L254 155" />
            <path d="M157 164 L146 155" />
          </g>
        </g>

        {/* שובל התנופה */}
        <path className={`${s.t} ${s.trail}`} pathLength={1} strokeDasharray={1} d="M262 53 A70 70 0 0 1 200 90" />
        <path className={`${s.t} ${s.trail2}`} pathLength={1} strokeDasharray={1} d="M284 66 A92 92 0 0 1 200 112" />

        {/* פגיעה: קרניים, אדווה ורסיסים */}
        <g className={`${s.t} ${s.flash}`}>
          <path d="M150 112 L134 104" />
          <path d="M146 124 L128 126" />
          <path d="M152 100 L140 88" />
          <path d="M250 112 L266 104" />
          <path d="M254 124 L272 126" />
          <path d="M248 100 L260 88" />
        </g>
        <ellipse className={`${s.t} ${s.ripple}`} cx="200" cy="121" rx="46" ry="8" />
        <path className={`${s.t} ${s.chip} ${s.c1}`} d="M166 124 l-8 -6 l10 -4 z" />
        <path className={`${s.t} ${s.chip} ${s.c2}`} d="M234 126 l9 -5 l-3 9 z" />
        <path className={`${s.t} ${s.chip} ${s.c3}`} d="M204 114 l-5 -8 l9 1 z" />
        <path className={`${s.t} ${s.chip} ${s.c4}`} d="M178 120 l-4 -7 l7 0 z" />

        {/* המקבת */}
        <g className={s.hammer}>
          <path className={s.l} d="M194 84 L192 32 C192 14 208 14 208 32 L206 84" />
          <path className={s.t} d="M193 40 C198 43 202 43 207 40 M193 48 C198 51 202 51 207 48 M193 56 C198 59 202 59 207 56" />
          <rect className={s.l} x="164" y="84" width="72" height="34" rx="9" />
          <path className={s.t} d="M178 84 V118 M222 84 V118" />
          <path className={s.t} d="M190 92 H210" />
        </g>

        {/* נצנוצים */}
        <Spark x={128} y={128} cls={s.sp1} />
        <Spark x={278} y={118} cls={s.sp2} />
        <Spark x={296} y={206} cls={s.sp3} />
        <Spark x={108} y={204} cls={s.sp4} />
      </g>
    </svg>
  );
}
