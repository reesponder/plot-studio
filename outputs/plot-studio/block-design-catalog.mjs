function layouts(definitions) {
  return definitions.map(([label, description, css, mobile = '', props = {}]) => ({
    id: label.toLowerCase().replaceAll(' ', '-'),
    label, description, css, mobile, props,
  }));
}

export const BLOCK_TONES = Object.freeze({
  studio: { label: 'Site colors', swatch: ['#fdfcf9', '#272822', '#788174'] },
  paper: { label: 'Warm paper', swatch: ['#f4ecdb', '#302719', '#75451f'] },
  ink: { label: 'Dark ink', swatch: ['#202224', '#f5f4ef', '#d0b78a'] },
  accent: { label: 'Site accent', swatch: ['#dce7dc', '#293e32', '#466651'] },
});

const catalog = {
  nav: layouts([
    ['Side by side', 'Brand left, links and action on the right.', '& .ps-nav-inner{min-height:72px}'],
    ['Centered links', 'Links centered between brand and action.', '& .ps-nav-inner{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}& .ps-nav-desktop{margin:0;justify-content:center}& .ps-button{justify-self:end}', '& .ps-nav-inner{grid-template-columns:minmax(0,1fr) auto auto}'],
    ['Centered brand', 'Logo in the middle, links and action on either side.', '& .ps-nav-inner{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}& .ps-brand{grid-column:2}& .ps-nav-desktop{grid-column:1;grid-row:1;margin:0}& .ps-button{grid-column:3;grid-row:1;justify-self:end}', '& .ps-nav-inner{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}& .ps-nav-mobile{grid-column:1;grid-row:1;margin:0}& .ps-button{min-width:0;text-wrap:wrap}'],
    ['Masthead', 'Centered brand above a separate navigation row.', '& .ps-nav-inner{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);row-gap:0;padding-block:22px 0}& .ps-brand{grid-column:2;grid-row:1;font-size:clamp(1.8rem,5vw,3.6rem)}& .ps-nav-desktop{grid-column:1/-1;grid-row:2;justify-content:center;margin:20px 0 0;padding:10px 0;border-top:1px solid var(--pbv-line)}& .ps-button{grid-column:3;grid-row:1;justify-self:end}', '& .ps-nav-inner{padding-block:10px}& .ps-nav-mobile{grid-column:1;grid-row:1;margin:0}& .ps-brand{font-size:1.5rem}& .ps-button{min-width:0;text-wrap:wrap}'],
    ['Double deck', 'Brand and action on top, a full links row underneath.', '& .ps-nav-inner{display:grid;grid-template-columns:1fr auto;row-gap:12px;padding-block:14px 0}& .ps-nav-desktop{grid-column:1/-1;grid-row:2;margin:0;padding:10px 0;border-top:1px solid var(--pbv-line)}& .ps-button{grid-column:2;grid-row:1}', '& .ps-nav-inner{grid-template-columns:1fr auto auto;padding-block:8px}& .ps-button{grid-column:3}'],
    ['Floating bar', 'An inset, rounded bar with a shadow over the page.', '&{border:0;padding:12px var(--ps-gutter);background:none}& .ps-nav-inner{max-width:calc(var(--ps-width) - var(--ps-gutter)*2);padding-inline:clamp(12px,3vw,32px);background:var(--pbv-surface);border:1px solid var(--pbv-line);border-radius:26px;box-shadow:0 8px 26px #0002}& .ps-nav-mobile nav{border:1px solid var(--pbv-line);border-radius:0 0 16px 16px}', '&{padding:6px 8px}& .ps-nav-inner{gap:9px;border-radius:18px}'],
    ['Reading rail', 'A shallow, left-aligned bar for documentation.', '& .ps-nav-inner{min-height:52px;gap:20px}& .ps-brand{font-size:1.12rem}& .ps-nav-desktop{margin:0;padding-inline-start:18px;border-inline-start:1px solid var(--pbv-line);gap:16px}& .ps-button{margin-inline-start:auto}', '& .ps-nav-inner{gap:12px}& .ps-button{margin-inline-start:0}'],
    ['Sticky toolbar', 'A compact bar that follows the reader down the page.', '&{position:sticky;top:0;z-index:20;box-shadow:0 1px 10px #0001}& .ps-nav-inner{min-height:58px;gap:16px}& .ps-nav-desktop{gap:18px}& .ps-button{border-radius:7px}'],
    ['Menu first', 'Keep the navigation in a compact menu on every screen.', '& .ps-nav-desktop{display:none}& .ps-nav-mobile{display:block;order:-1;margin:0}& .ps-nav-mobile nav{right:auto;min-width:min(18rem,100%);border:1px solid var(--pbv-line);box-shadow:0 12px 20px #0002}& .ps-button{margin-inline-start:auto}'],
    ['Framed links', 'Separate page links inside their own outlined bar.', '& .ps-nav-desktop{border:1px solid var(--pbv-line);border-radius:8px;padding:7px 13px;gap:18px}& .ps-nav-inner{gap:18px}& .ps-button{border-radius:8px}'],
    ['Index row', 'Give long menus a dedicated horizontally scrollable row.', '& .ps-nav-inner{display:grid;grid-template-columns:1fr auto;padding-block:10px 0;gap:9px}& .ps-nav-desktop{display:flex;flex-wrap:nowrap;grid-column:1/-1;grid-row:2;margin:0;overflow:auto;padding:8px 0 12px;border-top:1px solid var(--pbv-line);scrollbar-width:thin}& .ps-nav-desktop a{white-space:nowrap}& .ps-nav-mobile{display:none}& .ps-button{grid-column:2;grid-row:1}', '& .ps-nav-inner{padding-block:7px 0}'],
    ['Reverse bar', 'Set the brand on the right with actions near the left.', '& .ps-nav-inner{justify-content:flex-start}& .ps-brand{order:3;margin-inline-start:auto}& .ps-nav-desktop{margin:0;order:1}& .ps-button{order:2}', '& .ps-nav-mobile{order:1;margin:0}& .ps-button{margin-inline-start:auto}& .ps-brand{margin-inline-start:0}'],
  ]),
  hero: layouts([
    ['Wide image', 'Copy left, visual on the right with additional width.', '&.ps-hero-with-image{grid-template-columns:minmax(0,4fr) minmax(0,6fr)}& figure,& .ps-hero-copy{grid-area:auto}& img{aspect-ratio:4/3;height:auto}'],
    ['Image left', 'Full image on the left with a right-hand introduction.', '&.ps-hero-with-image{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}& figure{grid-column:1;grid-row:1}& .ps-hero-copy{grid-column:2;grid-row:1}& img{aspect-ratio:1;height:auto}'],
    ['Centered stack', 'Centered copy followed by a wide image.', '&.ps-hero-with-image{grid-template-columns:minmax(0,1fr)}& .ps-hero-copy{grid-area:auto;justify-items:center;text-align:center;margin-inline:auto}& figure{grid-area:auto;width:100%}& img{aspect-ratio:16/7;height:auto}'],
    ['Portrait split', 'A narrow portrait sits opposite a deliberately wide headline.', '&.ps-hero-with-image{grid-template-columns:minmax(0,1.4fr) minmax(0,.7fr)}& figure,& .ps-hero-copy{grid-area:auto}& img{aspect-ratio:3/4;height:auto}'],
    ['Cover overlay', 'Headline and action sit on a shaded full-width image.', '&.ps-hero-with-image{display:grid;grid-template-columns:minmax(0,1fr);min-height:clamp(360px,61vw,770px);isolation:isolate;align-items:end;overflow:hidden;text-align:start}&.ps-hero-with-image::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#111d 4%,#1113 78%)}&.ps-hero-with-image figure{position:absolute;inset:0;grid-area:auto;z-index:-2;height:100%;margin:0}&.ps-hero-with-image img{height:100%;width:100%}&.ps-hero-with-image figcaption{position:absolute;right:20px;bottom:15px;color:#fff}&.ps-hero-with-image .ps-hero-copy{grid-area:auto;justify-items:start;max-width:48ch;margin:0;color:#fff}&.ps-hero-with-image .ps-hero-description{color:#fff}&.ps-hero-with-image{position:relative}'],
    ['Copy over crop', 'Overlap a bordered copy panel and an offset image.', '&.ps-hero-with-image{grid-template-columns:repeat(12,minmax(0,1fr));gap:0;align-items:center}& figure{grid-column:5/-1;grid-row:1}& .ps-hero-copy{grid-column:1/8;grid-row:1;z-index:1;max-width:42rem;padding:clamp(22px,4vw,64px);background:var(--pbv-surface);border:1px solid var(--pbv-line)}& img{aspect-ratio:5/4;height:auto}', '&.ps-hero-with-image{gap:12px}'],
    ['Title led', 'Oversized copy with a broad bottom image and no overlap.', '&.ps-hero-with-image{grid-template-columns:minmax(0,1fr)}& figure,& .ps-hero-copy{grid-area:auto;width:100%;margin:0;text-align:start;justify-items:start}& .ps-hero-copy h1{max-width:14ch;font-size:var(--ps-title-size,clamp(3rem,10vw,9rem))}& img{aspect-ratio:20/7;height:auto}'],
    ['Top image', 'Lead with a wide photograph, followed by compact copy.', '&.ps-hero-with-image{grid-template-columns:minmax(0,1fr)}& figure{grid-column:1;grid-row:1}& .ps-hero-copy{grid-column:1;grid-row:2;margin:0;justify-items:start;text-align:start}& img{aspect-ratio:16/6;height:auto}', '&.ps-hero-with-image figure{order:-1}'],
    ['Inset frame', 'Inward-facing photo and copy in a single bordered panel.', '&{margin:clamp(12px,3vw,56px) auto;max-width:min(calc(100% - var(--ps-gutter) * 2),var(--ps-width));border:1px solid var(--pbv-line);border-radius:18px;overflow:hidden}&.ps-hero-with-image{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}& figure,& .ps-hero-copy{grid-area:auto}& img{aspect-ratio:4/3;height:auto;border-radius:10px}'],
    ['Full height text', 'A spacious title-led opening with a smaller edge image.', '&{min-height:min(620px,74svh);align-content:center}&.ps-hero-with-image{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}& figure,& .ps-hero-copy{grid-area:auto;align-self:center}& img{aspect-ratio:4/5;height:auto}', '&{min-height:0}'],
  ]),
  section: layouts([
    ['Reading column', 'Keep long text comfortably narrow.', '&{max-width:min(100%,760px);gap:20px;padding-block:36px}'],
    ['Full canvas', 'A full-bleed section with responsive gutters.', '&{max-width:none;padding-block:clamp(34px,8vw,128px);gap:clamp(16px,4vw,56px)}'],
    ['Framed content', 'Enclose a group of blocks in one large outline.', '&{max-width:min(calc(100% - var(--ps-gutter)*2),1120px);padding:clamp(16px,4vw,52px);margin-block:26px;border:1px solid var(--pbv-line);border-radius:14px}'],
    ['Centered content', 'Center each block and center its text.', '&{justify-items:center;text-align:center;gap:20px}&>.ps-button{justify-self:center}'],
    ['Two areas', 'Give the first block a narrow left column.', '&{grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start;gap:clamp(18px,5vw,72px)}&>:where(:first-child){grid-column:1;grid-row:1/span 2}&>:where(:not(:first-child)){grid-column:2}', '&{grid-template-columns:minmax(0,1fr)}&>*{grid-area:auto}'],
    ['Stacked rows', 'Separate each child block with a fine rule.', '&{row-gap:0}&>*+*{border-top:1px solid var(--pbv-line);padding-top:18px;margin-top:18px}'],
  ]),
  columns: layouts([
    ['Equal pair', 'Two equally sized columns.', '&{grid-template-columns:repeat(2,minmax(0,1fr))}'],
    ['Equal thirds', 'Three equally sized columns.', '&{grid-template-columns:repeat(3,minmax(0,1fr))}'],
    ['Quarter grid', 'Four columns, then two on a tablet.', '&{grid-template-columns:repeat(4,minmax(0,1fr))}', '&{grid-template-columns:repeat(2,minmax(0,1fr))}'],
    ['Lead left', 'Give the left column twice the space.', '&{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}'],
    ['Lead right', 'A narrow sidebar alongside a wide right column.', '&{grid-template-columns:minmax(0,1fr) minmax(0,2fr)}'],
    ['Bento grid', 'The first block spans two columns in a flexible grid.', '&{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch}&>:first-child{grid-column:span 2}', '&>:first-child{grid-column:auto}'],
  ]),
  heading: layouts([
    ['Display', 'Oversized, tight heading for an opening or chapter.', '&{font-size:clamp(2.6rem,7.1vw,7.6rem);line-height:.97;letter-spacing:-.065em}'],
    ['Rule below', 'A left-aligned title over a thin horizontal rule.', '&{font-size:clamp(1.8rem,3vw,4.6rem);padding-block-end:.36em;border-bottom:1px solid var(--pbv-line)}'],
    ['Centered title', 'Centered headline in a comfortable reading width.', '&{text-align:center;max-width:26ch;margin-inline:auto;font-size:clamp(2.1rem,5vw,5.2rem);text-wrap:balance}'],
    ['Compact title', 'Tighter scale and a stronger weight for short labels.', '&{font-family:var(--ps-font);font-size:clamp(1.1rem,2.1vw,1.8rem);font-weight:700;letter-spacing:-.018em}'],
    ['Margin line', 'Short title with a heavy side rule.', '&{padding-inline-start:.5em;border-inline-start:.12em solid var(--pbv-mark);font-size:clamp(1.7rem,4vw,4.2rem)}'],
    ['Right title', 'Right-aligned heading set against a top line.', '&{text-align:end;padding-block-start:.25em;border-top:1px solid var(--pbv-line);font-size:clamp(1.8rem,5vw,5rem);text-wrap:balance}'],
  ]),
  text: layouts([
    ['Body copy', 'Readable line length for long paragraphs.', '&{max-width:68ch;line-height:1.75}'],
    ['Lead paragraph', 'Larger type and looser line spacing.', '&{max-width:42ch;font-size:clamp(1.2rem,2.5vw,1.9rem);line-height:1.38}'],
    ['Fine print', 'Small, restrained text for secondary details.', '&{max-width:78ch;font-size:.83rem;line-height:1.65}'],
    ['Centered deck', 'A short paragraph centered under a headline.', '&{text-align:center;max-width:54ch;margin-inline:auto;line-height:1.55}'],
    ['Inset note', 'Pad a paragraph and mark it with a side rule.', '&{padding:14px 18px;border-inline-start:3px solid var(--pbv-mark);max-width:68ch}'],
    ['Two columns', 'Flow long prose across two reading columns.', '&{columns:2 24ch;column-gap:clamp(18px,4vw,60px);line-height:1.65}', '&{columns:1}'],
  ]),
  list: layouts([
    ['Spaced list', 'Conventional list with room between each item.', '& li+li{margin-top:12px}'],
    ['Inline list', 'Short items run horizontally with separators.', '&{display:flex;flex-wrap:wrap;gap:8px 18px;list-style:none;padding:0}& li+li{margin:0}& li+li::before{content:"·";margin-inline-end:12px;color:var(--pbv-mark)}'],
    ['Item rows', 'Place a horizontal rule under each item.', '&{padding-inline-start:2.25em}& li{padding:9px 8px;border-bottom:1px solid var(--pbv-line)}'],
    ['Split list', 'Flow longer lists into a second column.', '&{columns:2 16ch;column-gap:26px}& li{break-inside:avoid}', '&{columns:1}'],
    ['Marker blocks', 'A separated block and strong marker for each item.', '&{padding-inline-start:0;list-style:none}& li{padding:9px 14px;border-inline-start:3px solid var(--pbv-mark);background:var(--pbv-wash)}'],
    ['Number tiles', 'Add a two-digit counter to each bordered item.', '&{list-style:none;counter-reset:entry;display:grid;gap:6px;padding:0}& li{counter-increment:entry;display:flex;gap:14px;align-items:baseline;padding:8px 12px;border:1px solid var(--pbv-line)}& li::before{content:counter(entry,decimal-leading-zero);font-variant-numeric:tabular-nums;color:var(--pbv-mark);font-size:.78em}'],
  ]),
  code: layouts([
    ['Snippet', 'Language label over a simple bordered code surface.', '& pre{border:1px solid var(--pbv-line);border-radius:6px}'],
    ['Terminal window', 'A joined title bar and terminal-like code body.', '&{gap:0;border:1px solid var(--pbv-line);border-radius:10px;overflow:hidden}& figcaption{padding:8px 14px;border-bottom:1px solid var(--pbv-line);background:var(--pbv-wash)}& pre{padding:18px}'],
    ['Copy inset', 'An indented sample with a strong left edge.', '& pre{padding-inline-start:22px;border-inline-start:4px solid var(--pbv-mark)}'],
    ['Reading width', 'A small, centered block for code in running prose.', '&{max-width:64ch;margin-inline:auto}& pre{padding:10px;font-size:.86em}'],
    ['Roomy sample', 'More spacing for multi-line configuration examples.', '& pre{padding:clamp(18px,4vw,48px);line-height:1.8;border:1px solid var(--pbv-line)}'],
    ['Corner label', 'A small language chip sits above the right edge.', '& figcaption{justify-self:end;border:1px solid var(--pbv-line);padding:3px 9px;font-family:monospace}& pre{border-top:2px solid var(--pbv-mark)}'],
  ]),
  image: layouts([
    ['Natural ratio', 'Show the original photo proportions with a quiet caption.', '& img{object-fit:contain;max-height:none}'],
    ['Wide crop', 'A cinematic crop for a horizontal visual break.', '& :is(img,.ps-image-placeholder){width:100%;aspect-ratio:21/9;height:auto;object-fit:cover}'],
    ['Portrait crop', 'Portrait framing, with a centered, narrow figure.', '&{width:min(100%,420px);margin-inline:auto}& :is(img,.ps-image-placeholder){aspect-ratio:4/5;object-fit:cover}'],
    ['Square frame', 'A square photo outlined by a fine border and mat.', '&{padding:12px;border:1px solid var(--pbv-line)}& :is(img,.ps-image-placeholder){aspect-ratio:1;object-fit:cover}'],
    ['Inset caption', 'Overlay the caption on a dark plate within the image.', '&{position:relative}& img{min-height:130px}& figcaption{position:absolute;bottom:10px;inset-inline:10px auto;max-width:calc(100% - 20px);padding:5px 9px;background:#141414e8;color:#fff}'],
    ['Round portrait', 'A circular portrait with a centered caption below.', '&{width:min(100%,280px);margin-inline:auto;text-align:center}& :is(img,.ps-image-placeholder){aspect-ratio:1;object-fit:cover;border-radius:50%;border:1px solid var(--pbv-line)}'],
  ]),
  button: layouts([
    ['Square control', 'A compact, square-edged button.', '&{border-radius:0;padding:8px 14px;min-height:44px}'],
    ['Round pill', 'A rounded silhouette with generous side padding.', '&{border-radius:999px;padding-inline:24px}'],
    ['Wide action', 'Stretch the action to the width available.', '&{display:flex;justify-self:stretch;align-self:stretch;min-height:50px;padding-inline:16px}'],
    ['Soft rectangle', 'Slightly rounded corners with a subtle shadow.', '&{border-radius:9px;padding-inline:20px;box-shadow:0 3px 6px #0002}'],
    ['Double rule', 'A clearly outlined action with a second inset line.', '&{outline:1px solid var(--pbv-mark);outline-offset:3px;padding-inline:18px}'],
    ['Large action', 'Prominent action for the end of a page or section.', '&{min-height:61px;padding:12px 24px;font-size:1.05rem;font-weight:700}'],
  ]),
  link: layouts([
    ['Underlined', 'Classic inline link with a visible underline.', '&{text-decoration:underline;text-underline-offset:4px}'],
    ['Contained', 'A standalone link inside a low rectangular border.', '&{padding:6px 10px;border:1px solid var(--pbv-line);text-decoration:none}'],
    ['Label link', 'A small link for metadata and secondary navigation.', '&{font-size:.79rem;text-underline-offset:4px;font-weight:600}'],
    ['Side rule', 'Use an accent line to mark an important resource.', '&{border-inline-start:2px solid var(--pbv-mark);padding-inline-start:10px;text-decoration:none}'],
    ['Link row', 'A full-width link with a separator beneath it.', '&{display:block;padding:8px 0;border-bottom:1px solid var(--pbv-line);text-decoration:none}'],
    ['Prominent link', 'A large underlined action without a button box.', '&{font-size:clamp(1.1rem,2.2vw,1.45rem);text-decoration-thickness:2px;text-underline-offset:5px}'],
  ]),
  input: layouts(fieldDesigns('input:not([type=checkbox]), textarea')),
  select: layouts(fieldDesigns('select')),
  toggle: layouts([
    ['Plain switch', 'Compact field with the label beside the switch.', '&{gap:8px}'],
    ['Switch row', 'Stretch the label and move the control to the far edge.', '&{flex-direction:row-reverse;justify-content:space-between;width:auto;padding:6px 12px;border-bottom:1px solid var(--pbv-line)}'],
    ['Outlined switch', 'An outlined box for a single standalone setting.', '&{padding:8px 14px;border:1px solid var(--pbv-line);border-radius:8px}'],
    ['Toggle track', 'A sliding knob using the same accessible form control.', '& input{appearance:none;width:42px;height:24px;flex:none;border:1px solid var(--pbv-mark);border-radius:999px;background:radial-gradient(circle at 10px 50%,var(--pbv-ink) 6px,transparent 7px)}& input:checked{background:radial-gradient(circle at 30px 50%,var(--pbv-mark) 6px,transparent 7px),var(--pbv-wash)}'],
    ['Switch above', 'Stack the switch above a centered label.', '&{display:grid;justify-items:center;text-align:center;gap:4px;padding:5px 12px}'],
    ['Large control', 'A larger control for touch-friendly layouts.', '&{gap:12px;min-height:58px}& input{width:28px;height:28px}'],
  ]),
  video: layouts([
    ['Wide player', 'A wide 16:9 frame for a standard video.', '& :is(video,.ps-image-placeholder){aspect-ratio:16/9;object-fit:contain}'],
    ['Wide cinema', 'A shorter 21:9 frame with letterboxing.', '& :is(video,.ps-image-placeholder){aspect-ratio:21/9;object-fit:contain}'],
    ['Portrait player', 'A narrow, centered frame for a vertical clip.', '&{width:min(100%,460px);margin-inline:auto}& :is(video,.ps-image-placeholder){aspect-ratio:9/16;object-fit:contain}'],
    ['Square mat', 'A square video inside a contrasting border.', '&{padding:10px;border:1px solid var(--pbv-line)}& :is(video,.ps-image-placeholder){aspect-ratio:1;object-fit:contain}'],
    ['Rounded player', 'Large corner radius and a visible outer edge.', '&{border:1px solid var(--pbv-line);border-radius:20px;overflow:hidden}& :is(video,.ps-image-placeholder){aspect-ratio:16/9;object-fit:contain}'],
    ['Inset screen', 'Keep the video in a narrow card with padding.', '&{max-width:720px;margin-inline:auto;padding:clamp(8px,2vw,24px);border:1px solid var(--pbv-line)}& :is(video,.ps-image-placeholder){aspect-ratio:4/3;object-fit:contain}'],
  ]),
  audio: layouts([
    ['Plain player', 'Native playback controls in a compact row.', '& audio{width:min(100%,480px)}'],
    ['Full row', 'Stretch native playback controls across the container.', '& audio{width:100%}'],
    ['Audio card', 'Separate an audio clip inside a padded card.', '&{padding:14px;border:1px solid var(--pbv-line);border-radius:12px}& audio{width:100%}'],
    ['Caption first', 'Put the track description above the controls.', '&{display:flex;flex-direction:column}& figcaption{order:-1;margin:0 0 10px;font-size:.9rem;font-weight:600}'],
    ['Centered clip', 'A narrow centered player for short clips.', '&{width:min(100%,360px);margin-inline:auto;text-align:center}& audio{width:100%}'],
    ['Lined strip', 'Horizontal separators frame the media player.', '&{border-block:1px solid var(--pbv-line);padding-block:12px}& audio{width:100%}'],
  ]),
  table: layouts(tableDesigns()),
  'records-table': layouts(tableDesigns()),
  progress: layouts([
    ['Fine meter', 'A slim bar for compact status displays.', '& progress{height:6px}'],
    ['Heavy meter', 'A taller progress bar with room for strong emphasis.', '& progress{height:24px}'],
    ['Status card', 'Place the progress label and bar inside a box.', '&{padding:14px;border:1px solid var(--pbv-line);border-radius:10px}'],
    ['Full width meter', 'Display a long meter across the available space.', '&{max-width:none}& progress{height:16px}'],
    ['Centered meter', 'Keep progress centered in a narrow container.', '&{width:min(100%,340px);margin-inline:auto}& .ps-progress-label{justify-content:center}'],
    ['Meter first', 'Bar above its status label with a fine bottom rule.', '&{display:flex;flex-direction:column-reverse;border-bottom:1px solid var(--pbv-line);padding-bottom:10px}'],
  ]),
  callout: layouts([
    ['Inset note', 'A quiet box for explanatory content.', '&{border-radius:8px;padding:20px}'],
    ['Full outline', 'A complete border and a heavier top line.', '&{border:1px solid var(--pbv-line);border-top:4px solid var(--pbv-mark)}'],
    ['Narrow message', 'Constrain long copy to a readable width.', '&{max-width:60ch;margin-inline:auto;padding:16px 20px}'],
    ['Inline message', 'A title and supporting text in two adjacent areas.', '&{grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:baseline;gap:18px}', '&{grid-template-columns:1fr;gap:8px}'],
    ['Centered banner', 'A centered notice with rules above and below.', '&{justify-items:center;text-align:center;border:0;border-block:1px solid var(--pbv-line)}'],
    ['Small annotation', 'Fine text beneath a compact bold heading.', '&{padding:10px 13px;font-size:.86rem}& h3{font-family:var(--ps-font);font-size:.94rem;font-weight:700}'],
  ]),
  feature: layouts(articleDesigns()),
  card: layouts(articleDesigns()),
  gallery: layouts([
    ['Two across', 'Two equal photo columns at desktop widths.', '& .ps-columns{grid-template-columns:repeat(2,minmax(0,1fr))}', '& .ps-columns{grid-template-columns:1fr}'],
    ['Three across', 'A three-column contact sheet with equal crop ratio.', '& .ps-columns{grid-template-columns:repeat(3,minmax(0,1fr))}& img{aspect-ratio:4/3}', '& .ps-columns{grid-template-columns:repeat(2,minmax(0,1fr))}'],
    ['Tight mosaic', 'A dense four-column grid of square crops.', '& .ps-columns{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}& img{aspect-ratio:1}', '& .ps-columns{grid-template-columns:repeat(2,minmax(0,1fr))}'],
    ['Feature image', 'Give the lead image double the space.', '& .ps-columns{grid-template-columns:repeat(3,minmax(0,1fr))}& figure:first-child{grid-column:span 2}& figure:first-child img{aspect-ratio:16/9}', '& .ps-columns{grid-template-columns:repeat(2,minmax(0,1fr))}'],
    ['Horizontal gallery', 'Scroll through larger photographs from left to right.', '& .ps-columns{grid-auto-flow:column;grid-auto-columns:minmax(185px,54%);grid-template-columns:none;overflow:auto;scroll-snap-type:x mandatory}& figure{scroll-snap-align:start}& img{aspect-ratio:4/3}', '& .ps-columns{grid-auto-columns:84%}'],
    ['Photo essay', 'Stack images and place a fine rule above every caption.', '& .ps-columns{grid-template-columns:minmax(0,1fr);max-width:920px;margin-inline:auto;width:100%;gap:30px}& img{aspect-ratio:16/8}& figcaption{border-top:1px solid var(--pbv-line);padding-top:6px}'],
  ]),
  quote: layouts([
    ['Pull quote', 'Large type restrained by a thin side rule.', '& blockquote{font-size:clamp(1.45rem,4vw,3rem)}'],
    ['Centered quote', 'Centered attribution and quote between horizontal rules.', '&{border:0;border-block:1px solid var(--pbv-line);padding-inline:22px;text-align:center;justify-items:center}'],
    ['Margin note', 'A short, left-aligned quotation at reading width.', '&{max-width:55ch;padding:8px 14px}& blockquote{font-size:1.2rem}'],
    ['Large quotation', 'An opening mark anchors a wide display quote.', '&{position:relative;border:0;padding:28px 20px 20px clamp(34px,8vw,96px)}&::before{content:"“";position:absolute;top:0;left:0;color:var(--pbv-mark);font-family:var(--ps-heading-font);font-size:clamp(3rem,9vw,7rem);line-height:1}& blockquote{font-size:clamp(1.6rem,4vw,3.4rem)}'],
    ['Framed quote', 'One continuous border and an inset attribution.', '&{border:1px solid var(--pbv-line);padding:clamp(14px,3vw,36px)}& figcaption{padding-block-start:8px;border-top:1px solid var(--pbv-line);width:100%}'],
    ['Right aligned', 'Reverse the alignment and set off the source.', '&{border:0;border-inline-end:3px solid var(--pbv-mark);padding-inline:12px;text-align:end}'],
  ]),
  pricing: layouts([
    ['Comparison card', 'An outlined plan card with clearly separated features.', '& ul{padding-block:12px;margin:0;border-block:1px solid var(--pbv-line);width:100%}'],
    ['Price first', 'Begin with the price, then explain what comes with it.', '& .ps-price{order:-1}& .ps-price strong{font-size:clamp(2rem,5vw,4.6rem)}'],
    ['Centered plan', 'Center the plan name, price, and action.', '&{text-align:center;justify-items:center;padding:30px 18px}& li{text-align:start}& .ps-button{justify-self:center}'],
    ['Horizontal plan', 'Put the price and button opposite the included items.', '&{grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:9px 23px}& .ps-price,& .ps-button{grid-column:2;justify-self:end}& .ps-price{grid-row:1}& ul{grid-row:2}', '&{grid-template-columns:1fr}& :is(.ps-price,.ps-button,ul){grid-area:auto;justify-self:start}'],
    ['Open plan', 'Use horizontal rules instead of a full frame.', '&{border:0;border-block:1px solid var(--pbv-line);padding-inline:0}'],
    ['Wide action plan', 'A full-width purchase action and generous price area.', '&{padding:clamp(16px,3vw,34px)}& .ps-price strong{font-size:clamp(2.4rem,6vw,4.8rem)}& .ps-button{justify-self:stretch}'],
  ]),
  faq: layouts([
    ['Ruled accordion', 'A fine divider separates each question.', '&{gap:2px}& details{padding-block:14px}'],
    ['Boxed questions', 'Place each question in its own outline.', '& details{border:1px solid var(--pbv-line);border-radius:7px;padding:12px}'],
    ['Single panel', 'Frame the entire group in one box.', '&{border:1px solid var(--pbv-line);padding:18px;gap:6px}& details:last-child{border:0}'],
    ['Two column FAQ', 'Place questions side by side, below a full-width title.', '&{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;column-gap:24px}& h2{grid-column:1/-1}', '&{grid-template-columns:1fr}'],
    ['Title alongside', 'Leave the questions in a column to the right of the title.', '&{grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:0 24px}& h2{grid-column:1;grid-row:1/span 12}& details{grid-column:2}', '&{grid-template-columns:1fr;gap:12px}& :is(h2,details){grid-area:auto}'],
    ['Inset answers', 'Keep answers in a separate shaded area inside the row.', '& details p{background:var(--pbv-wash);border-inline-start:2px solid var(--pbv-mark);padding:9px 12px}'],
  ]),
  form: layouts([
    ['Simple stack', 'One column of full-width fields.', '&{width:min(100%,640px);gap:12px}'],
    ['Two column form', 'Pair short fields, keep long messages full width.', '&{grid-template-columns:repeat(2,minmax(0,1fr));width:min(100%,800px)}& :is(h2,p,button,.ps-field:has(textarea)){grid-column:1/-1}', '&{grid-template-columns:1fr}'],
    ['Form card', 'Group fields together inside a padded outline.', '&{padding:clamp(14px,4vw,34px);border:1px solid var(--pbv-line);border-radius:10px}'],
    ['Wide submit', 'A compact form with a full-width submit action.', '&{width:min(100%,540px)}& button[type=submit]{justify-self:stretch}'],
    ['Centered form', 'Center the form and its title in the available space.', '&{width:min(100%,520px);margin-inline:auto}& :is(h2,p,button){justify-self:center;text-align:center}'],
    ['Horizontal labels', 'Keep field labels and inputs in separate columns.', '& .ps-field:not(.ps-confirm){grid-template-columns:minmax(9ch,1fr) minmax(0,3fr);align-items:center;gap:8px}', '& .ps-field:not(.ps-confirm){grid-template-columns:1fr}'],
  ]),
  divider: layouts([
    ['Hairline', 'An unobtrusive full-width one-pixel rule.', '&{border-top:1px solid var(--pbv-line)}'],
    ['Short rule', 'A short centered rule between sections.', '&{width:min(24%,90px);margin-inline:auto;border-top:2px solid var(--pbv-mark)}'],
    ['Heavy edge', 'A thick rule for a substantial visual break.', '&{border-top:4px solid var(--pbv-mark)}'],
    ['Double rule', 'Two parallel lines form a printed-page separator.', '&{border-top:4px double var(--pbv-mark)}'],
    ['Dashed rule', 'A full-width separator with widely spaced dashes.', '&{height:1px;border:0;background:repeating-linear-gradient(to right,var(--pbv-mark) 0 12px,transparent 12px 21px)}'],
    ['Left marker', 'A short rule anchored to the start of the content.', '&{width:70px;margin-inline:0 auto;border-top:3px solid var(--pbv-mark)}'],
  ]),
  spacer: layouts(spacerDesigns()),
  footer: layouts([
    ['Horizontal footer', 'Brand left and links to the right.', '&{align-items:center;gap:25px}'],
    ['Centered footer', 'Centered brand, description, and links on separate rows.', '&{display:grid;justify-items:center;justify-content:center;text-align:center}& nav{justify-content:center}'],
    ['Split stack', 'Place links in a compact list beside the brand.', '&{display:grid;grid-template-columns:1fr minmax(8ch,auto)}& nav{display:grid;gap:7px}', '&{grid-template-columns:1fr}'],
    ['Bottom links', 'Separate a full-width row of links beneath the brand.', '&{display:grid;gap:18px}& nav{border-top:1px solid var(--pbv-line);padding-block-start:13px}'],
    ['Brand led', 'A larger brand wordmark anchors the end of the page.', '&{display:grid;gap:25px}& .ps-brand{font-size:clamp(2rem,8vw,7rem);white-space:normal}'],
    ['Compact footer', 'One low row with tightly arranged links.', '&{padding-block:13px;align-items:center;gap:12px}& .ps-brand{font-size:1.02rem}& nav{gap:12px}& nav a{font-size:.74rem}'],
  ]),
};

function fieldDesigns(selector) {
  const control = '& :is(' + selector + ')';
  return [
    ['Outline field', 'Use a standard rectangle with a clear border.', control + '{border-color:var(--pbv-line);border-radius:0;min-height:42px}'],
    ['Bottom rule', 'Put the input on an underline with no surrounding box.', control + '{border:0;border-bottom:2px solid var(--pbv-mark);padding-inline:2px;background:none;border-radius:0}'],
    ['Rounded field', 'Round the corners and increase touch spacing.', control + '{border:1px solid var(--pbv-line);border-radius:12px;min-height:49px;padding-inline:13px}'],
    ['Inset fill', 'Set off the editable area with a tinted fill.', control + '{background:var(--pbv-wash);border:1px solid transparent;border-radius:6px;padding-inline:14px}'],
    ['Label beside', 'Place the label and control on the same row.', '&{grid-template-columns:minmax(11ch,1fr) minmax(0,3fr);align-items:center;gap:12px}', '&{grid-template-columns:1fr}'],
    ['Field group', 'Put the label and control inside a single larger frame.', '&{border:1px solid var(--pbv-line);padding:7px 10px;border-radius:6px}& span{font-size:.76rem}' + control + '{border:0;background:none;padding:3px 0;min-height:34px}'],
  ];
}

function articleDesigns() {
  return [
    ['Open article', 'Open composition with a fine line above.', '&{border:0;border-top:1px solid var(--pbv-line);padding:14px 0;gap:9px}'],
    ['Framed article', 'Put content and its visual in a single outlined box.', '&{border:1px solid var(--pbv-line);padding:18px;border-radius:9px}'],
    ['Centered article', 'Center the heading and supporting copy.', '&{justify-items:center;text-align:center;padding:18px;border:1px solid var(--pbv-line)}'],
    ['Side rule', 'An emphasized edge anchors the content group.', '&{border:0;border-inline-start:3px solid var(--pbv-mark);padding:10px 16px}'],
    ['Inline article', 'Place the supporting copy alongside the heading or image.', '&{grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 20px;align-items:start}&:has(img) img{grid-column:1;grid-row:1/span 6;aspect-ratio:1}&:has(img)>:not(img){grid-column:2}', '&{grid-template-columns:1fr}&:has(img)>*{grid-area:auto}'],
    ['Large article', 'Give the image and headline extra room.', '&{border:1px solid var(--pbv-line);padding:clamp(16px,4vw,42px);gap:18px}& img{aspect-ratio:16/9}& h3{font-size:clamp(1.6rem,4vw,3rem)}'],
  ];
}

function tableDesigns() {
  return [
    ['Clean rows', 'A minimal table with fine row separators.', '& :is(th,td){border-color:var(--pbv-line);padding:10px 12px}'],
    ['Striped rows', 'Alternate row fills to make wide tables easier to read.', '& tbody tr:nth-child(even){background:var(--pbv-wash)}'],
    ['Cell grid', 'Draw a fine border around every cell.', '& :is(th,td){border:1px solid var(--pbv-line)}'],
    ['Dense rows', 'Reduce height and leave more room for data.', '& :is(th,td){padding:4px 8px;font-size:.81rem}'],
    ['Open rows', 'Larger row padding for a shorter comparison.', '& :is(th,td){padding:16px 14px}& th{border-bottom:2px solid var(--pbv-mark)}'],
    ['Centered data', 'Center values and keep the first column aligned to the start.', '& :is(th,td){text-align:center}& :is(th,td):first-child{text-align:start;font-weight:600}'],
  ];
}

function spacerDesigns() {
  const profiles = [
    ['fixed gap', 'Same gap on every device.', 1, 1, 1],
    ['reduced phone gap', 'Keep phone spacing at half the desktop size.', 1, 1, .5],
    ['condensed gap', 'Reduce spacing on tablets and reduce it further on phones.', 1, .75, .25],
    ['desktop gap', 'Show the gap only on wide screens.', 1, 0, 0],
    ['tablet gap', 'Show the gap only on tablet widths.', 0, 1, 0],
    ['phone gap', 'Show the gap only on phones.', 0, 0, 1],
    ['touch gap', 'Add spacing on tablets and phones.', 0, 1, 1],
    ['expanded phone gap', 'Give the phone more space than desktop.', 1, 1, 1.5],
  ];
  const heights = [['Small', 16], ['Medium', 48], ['Large', 112]];
  const rule = multiplier => '&{min-height:calc(var(--ps-spacer-height,48px) * ' + multiplier + ')}';
  return heights.flatMap(([size, height]) => profiles.map(([label, description, desktop, tablet, mobile]) => [
    size + ' ' + label,
    height + ' px base height. ' + description,
    rule(desktop),
    rule(mobile),
    { height, tabletRule: rule(tablet) },
  ]));
}

export const BLOCK_VARIANTS = Object.freeze(Object.fromEntries(Object.entries(catalog).map(([type, entries]) => [
  type,
  Object.freeze(entries.flatMap(layout => Object.entries(BLOCK_TONES).filter(([tone]) => type !== 'spacer' || tone === 'studio').map(([tone, palette]) => Object.freeze({
    id: layout.id + ':' + tone, layout: layout.id, tone,
    label: layout.label, description: layout.description, toneLabel: palette.label,
    height: layout.props.height,
  })))),
])));

const variantsById = new Map(Object.entries(BLOCK_VARIANTS).map(([type, variants]) => [
  type, new Map(variants.map(variant => [variant.id, variant])),
]));

export function findBlockVariant(type, id) {
  return variantsById.get(type)?.get(id);
}

const tonesCss = `
  [data-block-tone=studio]{--pbv-surface:var(--ps-background);--pbv-ink:var(--ps-ink);--pbv-mark:var(--ps-accent)}
  [data-block-tone=paper]{--pbv-surface:#f4ecdb;--pbv-ink:#302719;--pbv-mark:#75451f}
  [data-block-tone=ink]{--pbv-surface:#202224;--pbv-ink:#f5f4ef;--pbv-mark:#d0b78a}
  [data-block-tone=accent]{--pbv-surface:color-mix(in srgb,var(--ps-accent) 13%,var(--ps-background));--pbv-ink:var(--ps-ink);--pbv-mark:var(--ps-accent)}
  :where([data-block-tone]){--pbv-wash:color-mix(in srgb,var(--pbv-mark) 11%,var(--pbv-surface));--pbv-line:color-mix(in srgb,var(--pbv-ink) 27%,var(--pbv-surface))}
  [data-block-tone]{color:var(--pbv-ink);border-color:var(--pbv-line)}
  [data-block-tone]:where(:not([data-block-type=divider],[data-block-type=button],[data-block-type=link],[data-block-type=spacer])){background-color:var(--pbv-surface)}
  [data-block-tone] :is(figcaption,.ps-hero-description,.ps-brand + p,.ps-records-status){color:color-mix(in srgb,var(--pbv-ink) 84%,var(--pbv-surface))}
  [data-block-tone] :is(:where(.ps-nav-mobile) nav,pre,th,.ps-field :is(input:not([type=checkbox]),select,textarea)){background:var(--pbv-wash);color:var(--pbv-ink);border-color:var(--pbv-line)}
  [data-block-tone] :is(.ps-switch input,.ps-progress progress){accent-color:var(--pbv-mark)}
  [data-block-tone].ps-button-primary,[data-block-tone] .ps-button-primary{background:var(--pbv-mark);border-color:var(--pbv-mark);color:var(--ps-on-accent)}
  [data-block-tone=ink].ps-button-primary,[data-block-tone=ink] .ps-button-primary{color:#202224}
  [data-block-tone=paper].ps-button-primary,[data-block-tone=paper] .ps-button-primary{color:#fff}
  [data-block-tone=accent].ps-button-primary,[data-block-tone=accent] .ps-button-primary{background:var(--pbv-wash);color:var(--pbv-ink)}
  [data-block-tone=accent]:is(.ps-link,.ps-button-outline,.ps-button-text){color:var(--pbv-mark)}
  [data-block-tone].ps-button-outline,[data-block-tone] .ps-button-outline{border-color:currentColor}
  [data-block-tone]:is(.ps-input,.ps-select) :is(input,select,textarea){background:var(--pbv-surface);color:var(--pbv-ink);border-color:var(--pbv-line)}
  [data-block-tone].ps-nav .ps-brand{min-width:0;white-space:normal;overflow-wrap:anywhere}
  [data-block-tone].ps-nav .ps-nav-mobile nav{z-index:5;max-height:min(69vh,448px);overflow:auto}
`;

export function renderBlockVariantStyles(blocks) {
  const included = new Map();
  function visit(block) {
    const variant = findBlockVariant(block.type, block.props?.designVariant);
    if (variant) included.set(block.type + '/' + variant.layout, [block.type, variant.layout]);
    if (Array.isArray(block.children)) block.children.forEach(visit);
  }
  blocks.forEach(visit);
  if (!included.size) return '';
  const desktop = [];
  const tablet = [];
  const mobile = [];
  for (const [type, id] of included.values()) {
    const layout = catalog[type].find(entry => entry.id === id);
    const selector = '[data-block-type="' + type + '"][data-block-design="' + id + '"]';
    desktop.push(layout.css.replaceAll('&.ps-hero-with-image', '&:where(.ps-hero-with-image)').replaceAll('&', selector));
    if (layout.props.tabletRule) tablet.push(layout.props.tabletRule.replaceAll('&', selector));
    if (id === 'quarter-grid' && type === 'columns') tablet.push(selector + '{grid-template-columns:repeat(2,minmax(0,1fr))}');
    if (layout.mobile) mobile.push(layout.mobile.replaceAll('&', selector));
  }
  const phoneLayout = [
    '[data-block-type=columns][data-block-design]:where(:not([data-block-design=quarter-grid])){grid-template-columns:minmax(0,1fr)}',
    '[data-block-type=hero][data-block-design]:where(.ps-hero-with-image:not([data-block-design=cover-overlay])){grid-template-columns:minmax(0,1fr)}',
    '[data-block-type=hero][data-block-design]:where(.ps-hero-with-image:not([data-block-design=cover-overlay])) :is(figure,.ps-hero-copy){grid-area:auto}',
    '[data-block-type=nav][data-block-design] .ps-nav-inner{column-gap:9px}',
  ];
  return tonesCss + desktop.join('\n') +
    (tablet.length ? '\n@media(max-width:1023px){' + tablet.join('\n') + '}' : '') +
    '\n@media(max-width:767px){' + [...phoneLayout, ...mobile].join('\n') + '}\n';
}
