# Jevf Cursor

A drop-in custom cursor for the web that plays a sound when you click.

No dependencies, no build step, no framework. One script tag, four asset files, done.

**[Live demo](https://alucky1.github.io/jevf-cursor/)**

---

## Install

Copy `dist/jevf-cursor.js` and the contents of `assets/` into a folder on your site
(this example calls it `cursor/`), then add one line before `</body>`:

```html
<script src="cursor/jevf-cursor.js" data-jevf-auto data-base="cursor"></script>
```

That is the entire install.

## Configure

```html
<script src="cursor/jevf-cursor.js"></script>
<script>
  JevfCursor.init({
    image:   'cursor/cursor.png',
    image2x: 'cursor/cursor@2x.png',
    hotspot: [16, 0],
    sound:   ['cursor/click.mp3', 'cursor/click.ogg'],
    volume:  0.7,
    retrigger: 'restart',
    toggleButton: true
  });
</script>
```

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `image` | `cursor/cursor.png` | The cursor art. |
| `image2x` | `cursor/cursor@2x.png` | Used on retina screens via `image-set()`. |
| `hotspot` | `[16, 0]` | Which pixel of the 1x image is the actual pointing tip. |
| `sound` | `['cursor/click.mp3', 'cursor/click.ogg']` | Sources in order of preference; the browser takes the first it can decode. |
| `volume` | `0.7` | 0 to 1. |
| `retrigger` | `'restart'` | `restart` cuts the sound off and replays it, `overlap` stacks copies, `ignore` lets the current one finish. |
| `buttons` | `[0]` | Which mouse buttons make noise. 0 left, 1 middle, 2 right. |
| `requireFinePointer` | `true` | Skips the whole thing on touch screens. |
| `preserveTextCursor` | `true` | Keeps the normal I-beam inside inputs and text areas. |
| `toggleButton` | `false` | Injects a small mute button in the bottom right. |
| `persistMute` | `true` | Remembers the mute choice in `localStorage`. |
| `onReady` | `null` | Callback fired once the cursor is live. |

### Data attributes

If you use `data-jevf-auto`, these work without writing any JavaScript:

| Attribute | Example |
| --- | --- |
| `data-base` | `data-base="cursor"` — folder holding the four asset files |
| `data-volume` | `data-volume="0.5"` |
| `data-retrigger` | `data-retrigger="overlap"` |
| `data-toggle-button` | present = show the mute button |

### Methods

```js
JevfCursor.mute();
JevfCursor.unmute();
JevfCursor.toggle();
JevfCursor.isMuted();      // -> boolean
JevfCursor.setVolume(0.4);
JevfCursor.play();         // fire the sound without a click
JevfCursor.destroy();      // remove the cursor and stop listening
```

## How it works

The cursor itself is a plain CSS `cursor: url(...)` rule, not a `<div>` chasing your
mouse. That means there is no lag, no jitter, and it keeps working over every element
on the page including iframes' edges and native controls. Retina art is served through
`image-set()`, with a plain `url()` declared first as the fallback for older engines.

Browsers cap cursor images at 128×128, so the art ships at 62×44 (1x) and 124×88 (2x).

The sound is played through the Web Audio API, which is what makes rapid clicking feel
instant. The audio buffer is fetched and decoded once on the first click, then reused.
Because browsers only allow audio to start after a user gesture, the very first click
falls back to a plain `<audio>` element so it is never silent, and every click after
that uses the decoded buffer. If Web Audio is missing or the decode fails, the whole
thing degrades to `<audio>` and keeps working.

## Accessibility and manners

- Nothing runs on touch screens by default: no cursor art, no surprise audio.
- Text inputs keep their I-beam so people can see where they are typing.
- Sound is off-limits until the visitor clicks, which is their own gesture.
- `toggleButton: true` gives visitors a visible way to shut it up, and the choice is
  remembered. If you ship this on a real site, turn it on.

## Browser support

Chrome, Edge, Safari, Firefox, and anything else with `pointerdown` and CSS cursor
images. There is no polyfill and nothing to transpile; the source is ES5.

## Bring your own art

Nothing here is hardcoded to this robot. Point `image` at any PNG under 128×128,
set `hotspot` to the pixel that should sit under the real pointer position, and point
`sound` at any audio file the browser can decode.

## License

The code in `dist/` is MIT licensed — see [LICENSE](LICENSE).

The art and audio in `assets/` are sample media included so the demo runs out of the
box. They are **not** covered by the MIT grant and are not cleared for redistribution;
swap in your own before shipping this anywhere that matters.
