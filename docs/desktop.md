# Jevf on your desktop

The web version in this repo only works on web pages. This is the other thing:
the actual system pointer on your machine, in every app.

**What you get:** the cursor art, replacing the normal arrow.
**What you do not get:** the click sound. See [Why there is no sound](#why-there-is-no-sound).

| File | Platform |
| --- | --- |
| [`desktop/Jevf.cape`](../desktop/Jevf.cape) | macOS, via Mousecape |
| [`desktop/jevf.cur`](../desktop/jevf.cur) | Windows, built in |

---

## Windows

No extra software. Windows has supported custom cursors since the nineties.

1. Download [`desktop/jevf.cur`](../desktop/jevf.cur) and put it somewhere you
   will not delete it later, such as `Documents\Cursors\`.
2. Press **Win + R**, type `main.cpl`, press Enter. The Mouse Properties window
   opens.
3. Go to the **Pointers** tab.
4. In the list, click **Normal Select**.
5. Click **Browse…**, choose `jevf.cur`, then **Open**.
6. Click **Apply**.

The file carries 32, 48 and 64 pixel versions, so it stays sharp if you have
cursor size turned up in accessibility settings.

**To undo it:** same window, click **Use Default**, then **Apply**. Or pick
"Windows Default" from the Scheme dropdown to reset everything at once.

---

## macOS

Apple has no supported way to replace the system cursor. The only practical
tool is **Mousecape**, a free open-source app that calls private, undocumented
system APIs to do it.

Read this part before you start, because it is genuinely rough:

- The last released Mousecape **build** is from **June 2020**.
- The **source** has commits through **July 2024**, including a fix to the
  `CGSRegisterCursorImages` call signature — which is exactly the kind of thing
  that breaks between macOS versions. That fix has never been packaged into a
  release build.
- So on a recent macOS, the downloadable 2020 binary may simply not work, and
  you may have to build from source in Xcode.
- It is unsigned, so macOS will refuse to open it on the first try.
- Apple can break it again in any OS update. Nothing here is Apple-supported.

### Steps

1. Get Mousecape from <https://github.com/alexzielenski/Mousecape>. Try the
   release build first; if the cursor never changes, build from source instead.
2. Because it is unsigned, the first launch is blocked. **Right-click the app →
   Open**, then confirm. Double-clicking will just show an error.
3. Download [`desktop/Jevf.cape`](../desktop/Jevf.cape).
4. Open Mousecape. Drag `Jevf.cape` into its library window — you should see a
   **Jevf** entry appear in the list.
5. Double-click the **Jevf** entry to apply it.

**To undo it:** in Mousecape, use **Restore Cursor** to drop back to the stock
pointer. Logging out and back in also clears an applied cape.

### What it changes

Only the arrow — `com.apple.coregraphics.Arrow` and its contextual-menu
variant. The text I-beam, the resize handles and the spinner are left alone
on purpose: replacing the I-beam makes text genuinely hard to edit, and a
mascot is not worth an unusable machine.

The cursor is 39 × 28 points with the hotspot at (10, 0) — the tip of the left
antenna. Retina art is included at 2x.

---

## Why there is no sound

The web version plays the sound because a web page already knows when you click
inside it. The operating system is a different story.

To play a sound on **every** click anywhere on your machine, a program has to
install a global event tap and watch all mouse input system-wide. On macOS that
requires **Input Monitoring** permission — the same permission a keylogger
needs. On Windows it means a low-level global mouse hook, which is what
antivirus software is built to flag.

That is a real trust ask, and "a meme coin's mascot wants to watch every click
you make" is not a request anyone should say yes to casually. So this ships as
art only. If you want the sound, open the [live demo](https://alucky1.github.io/jevf-cursor/)
and click around in your browser, where the permission question never comes up.

---

## Rebuilding the files

Both files are generated from `assets/jevf-master.png`:

```bash
python3 tools/build_desktop.py assets/jevf-master.png
```

Swap in your own transparent PNG to make a cursor of your own. The hotspot
ratios and the point size are constants at the top of that script.

The `.cape` format is not documented by anyone official. The key names, the
version numbers and the rule that a representation's scale is inferred from
`pixelsWide ÷ PointsWide` were all read out of Mousecape's own source
(`mousecloak/MCDefs.m` and `src/models/MCCursor.m`); the script explains each
one where it uses it.
