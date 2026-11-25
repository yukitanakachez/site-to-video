# Decisions

## ElevenLabs (Task 1)

All pages read in full on 2026-11-24. The Music Terms, Terms of Service, Service-Specific Terms, ElevenAPI Terms and ElevenCreative Terms were all last updated 9 October 2026. The OEM Terms were last updated 28 February 2025.

### Which plan

**Plan to upgrade to: Scale ($299/month, 1,800,000 credits; $2,990/year).** It is the lowest plan that no term bars from this agent's use. That use: Yuki's account generates voice, music and sound effects inside a paid on-demand service, and hands each customer a finished video.

**Cheaper alternative, only with written confirmation from ElevenLabs: Starter ($6/month, 30,000 credits).** Starter is enough if ElevenLabs agrees that delivering finished videos from our own product is "generating and distributing Output", not "Making Available" the Services. Yuki can ask ElevenLabs support that question. Two terms decide it:

1. **OEM Terms bar Free–Pro from building ElevenLabs into a service for others.** The Terms of Service list the OEM Terms as covering "your bundling, making available and sublicensing of certain Services (ex. incorporating the ElevenLabs Services in your own solution)" ([terms-of-use](https://elevenlabs.io/terms-of-use), section 1). The OEM Terms then say: "if you are a Customer accessing the Services under a Free, Starter, Creator, or Pro tier plan, you are expressly prohibited from Making Available the Services or any Bundled Service" (2.B). They also bar it for anyone "not accessing the Services as a Business Entity", meaning a Scale, Business or Enterprise customer (1.D) ([oem-terms](https://elevenlabs.io/oem-terms)). A "Customer Solution" is a "subscription-based, hosted, supported, on-demand services that Customer provides to End Users" (1.E), which fits a Starwish agent closely.
2. **The Music Terms limit Free–Pro to "For Individual Use Only".** Scale is open to "Individuals, or entities or organizations with fewer than 10 employees" ([music-terms](https://elevenlabs.io/music-terms), Exhibit A, Eligibility Restrictions). A paid service for customers is the use that most likely falls outside "Individual Use".

Pointing the other way, toward Starter:

- The ElevenAPI Terms expect products built on the API with users of their own: "A 'Customer Application' is any application, product, or service of yours through which you access the Services through the API … You are responsible for … authenticating and authorizing its users" (2.3, [elevenapi-terms](https://elevenlabs.io/elevenapi-terms)).
- The Music Terms say "an entity does not become a Reseller solely by generating and distributing Output through its own product, provided it does not make the Music Models or API access to them available to any third party" (4.8(i)).

**Open question even on Scale.** If the OEM Terms apply, each End User must accept an "End User Agreement" (a clickwrap) that carries ElevenLabs' minimum terms, with ElevenLabs as a third-party beneficiary (OEM 3.A). An "End User" is a customer using the solution "only for its own internal business operations" (1.I). Starwish's hire flow probably does not include such an agreement. This is the same question to put to ElevenLabs.

**The terms do not say only Enterprise allows it.** Enterprise is needed only for film, TV, radio and Studio Games ("Enterprise Music" column), which this agent does not make.

### Terms points, quoted

| Point | Quote | Source |
|---|---|---|
| Paid plans may use the Services commercially | "if you access or use our Services through a paid subscription plan … you may use the Services for commercial purposes"; Free users "may only use the Services for non-commercial purposes" | [terms-of-use](https://elevenlabs.io/terms-of-use) 1(c) |
| The user owns Output | "as between you and ElevenLabs, you retain all rights in and to your Output" | terms-of-use 4(c)(ii) |
| Output may be used outside ElevenLabs | "you are permitted to use such Output outside of the Services but always subject to these Terms and our Prohibited Use Policy" | terms-of-use 4(a) |
| Music: online commercial use | Starter through Business: "All online and offline commercial use permitted, except film, TV, radio, and Studio Games"; "Media Rights" include "the right to synchronize Output in timed relation to audiovisual content" | [music-terms](https://elevenlabs.io/music-terms) Exhibit A; 4.8(d) |
| Music: Free plan | Downloads "Not permitted", API Access "No", Attribution "Required" | music-terms Exhibit A |
| Music: API from Starter | API Access "Yes" from Starter; Monthly Download Limit: Starter 30 min, Creator 250, Pro 500, Scale 1,500; Concurrency: Starter–Pro 2, Scale 5 | music-terms Exhibit A |
| Music: no libraries | "You must not … use Output to compile, create, or contribute to a Music Library"; a Music Library is "any collection of Output … made available to third parties for those third parties to use, license, download, or incorporate into their content" | music-terms 4.2, 4.8(f) |
| Music: no resale of API access | "Unless you are an Authorized Reseller, you shall not resell, repackage, redistribute, sublicense, or otherwise make API access to the Music Service available to any third party" | elevenapi-terms Exhibit 3 |
| Music: prompts | No artist, songwriter, song, album, publisher or label names, and no lyrics, in a prompt | music-terms 2.1 |
| Sound effects: only inside other material | "You may exercise those rights only in respect of Output combined with other material, and you may not … make Output available as isolated audio files or samples" | [creative-terms](https://elevenlabs.io/creative-terms) Exhibit 4, 2 |
| AI disclosure | "You must clearly disclose when people are interacting with AI where required by law or where failing to do so would materially mislead them. You must not remove, alter, or conceal ElevenLabs watermarks, metadata or other provenance signals" | [use-policy](https://elevenlabs.io/use-policy) |
| Key handling | "You shall not share credentials outside your organization, expose them in third-party-accessible clients or artifacts" | elevenapi-terms 2.1 |

**What follows for the build:** the customer gets only the finished, mixed video. Narration, music and sound effects are never handed over as separate audio files. Sound effects may not be delivered standalone at all, and a set of separate music tracks would be a "Music Library". The customer never gets the key or a way to make free-form audio requests (spec 9 already says this).

### Pricing (from [pricing](https://elevenlabs.io/pricing), 2026-11-24, monthly billing)

Free $0 (10k credits), Starter $6 (30k), Creator $22 (121k), Pro $99 (600k), Scale $299 (1.8M), Business $990 (6M), Enterprise custom. The pricing page FAQ gives these costs: text to speech is 1 credit per character on Eleven v4, v3 and Multilingual v2 (0.5 on Flash and Turbo through the API); music is "about 900 per minute", varying by plan; sound effects are "200 per generation or 40 per second with manual duration". A rough job (narration of about 300 characters, 20 s of music, up to 6 effects) is about 300 + 300 + 1,200 ≈ 1,800 credits. Paid plans add overage at the rates shown when subscribing (terms-of-use 6(c)), which is why the spending cap matters. API keys can carry their own credit quota ([authentication](https://elevenlabs.io/docs/api-reference/authentication)).

### API

- **Host:** `https://api.elevenlabs.io` (also `api.us.elevenlabs.io` and regional residency hosts; we use the default).
- **Auth header:** `xi-api-key: <key>` ([authentication](https://elevenlabs.io/docs/api-reference/authentication)). A key can be limited by endpoint scope, credit quota and IP allowlist.
- **Output formats:** `output_format` query parameter, `codec_samplerate_bitrate`, default `mp3_44100_128`. 192 kbps mp3 needs Creator or above; 44.1 kHz PCM/WAV needs Pro or above (text to speech and sound effects pages).
- `enable_logging=false` (zero retention) is Enterprise only, so we leave it at its default.

**Narration with word timings:** `POST /v1/text-to-speech/{voice_id}/with-timestamps` ([docs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)).
- Body (JSON): `text` (required), `model_id` (default `eleven_multilingual_v2`), `language_code`, `voice_settings` {`stability` 0.5, `similarity_boost` 0.75, `style` 0, `use_speaker_boost` true, `speed` 1}, `seed` (0–4294967295, best effort), `previous_text`, `next_text`, `apply_text_normalization` (`auto`|`on`|`off`).
- Response (JSON): `audio_base64` (string), `alignment` and `normalized_alignment`, each `{ characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[] }`. Timings are per character; caption words are built by grouping characters.
- Limits: characters per request by model ([models](https://elevenlabs.io/docs/overview/models)): `eleven_v3` 5,000, `eleven_multilingual_v2` 10,000, `eleven_flash_v2_5` 40,000. Our narration (~60 words) is far below all of them. Concurrency (pricing page): Starter 3, Creator 5, Pro 10, Scale 15.

**Sound effects:** `POST /v1/sound-generation` ([docs](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)).
- Body (JSON): `text` (required), `duration_seconds` (0.5–30; omitted = the model picks), `prompt_influence` (0–1, default 0.3), `loop` (default false), `model_id` (`eleven_text_to_sound_v2` default, or `eleven_text_to_sound_v3`).
- Response: the audio file itself (binary, in `output_format`).

**Music:** `POST /v1/music` ([docs](https://elevenlabs.io/docs/api-reference/music/compose)).
- Body (JSON): `prompt` or `composition_plan` (one only), `music_length_ms` (3,000–600,000, with `prompt` only), `model_id` (`music_v1` default, `music_v2`, `music_v2_5`), `force_instrumental` (with `prompt` only; we set it true so a bed never has lyrics), `seed` (not with `prompt`), `sign_with_c2pa` (mp3 only).
- Query: `output_format` default `auto` (mp3_44100_128 for v1, mp3_48000_192 for v2).
- Response: the audio file itself (binary).
- Limits: the plan's monthly music download minutes and concurrency (table above).

**Voices:** `GET /v1/shared-voices` lists the Voice Library ([docs](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared)). Query includes `search`, `category`, `gender`, `age`, `accent`, `language`, `use_cases`, `min_notice_period_days`, `include_custom_rates`, `include_live_moderated`, `page_size` (≤100). Each voice carries `voice_id`, `name`, `category`, `preview_url`, `rate` (credit multiplier), `notice_period` (days), `free_users_allowed`, `live_moderation_enabled`.

### Voice library: commercial-use rules

- The old Default (premade) voices end soon: "All our Default voices will expire on December 31, 2026, and they will no longer be accessible after this date … Default voices are only available for accounts that were created before March 2026" ([What are Default voices?](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices)). So none are on our list.
- Their replacements are **Infinity voices**: "Infinity voices are ElevenLabs-created voices built from licensed recordings. They have an infinite notice period, which means they will remain available in the Voice Library" ([Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library)). All candidates below are Infinity voices from that replacement table. Being ElevenLabs' own voices from licensed recordings, their Output falls under the plain Terms of Service rule: commercial on a paid plan (terms-of-use 1(c)). The docs give no per-voice "commercial" flag. The Voice Library Addendum ([vla](https://elevenlabs.io/vla), last updated 6 March 2026) sends the question back to the Terms of Service: "The rights in and to ElevenLabs Voice Models and User Voice Models, including those made available as part of the Voice Library Service, are set out in our Terms of Service" (section 1).
- Community-shared voices are avoided. Their owner can withdraw them (immediately if there is no notice period), some carry a credit multiplier (`rate`), and some are live-moderated, which adds delay.
- Checked through the API on 2026-11-24, every candidate has `rate` 1.0 (no surcharge), `live_moderation_enabled` false, `free_users_allowed` true and `notice_period` 4015 days.

### Voices (provisional, awaiting Yuki)

`config/voices.json` holds three provisional voices: Jade, Darian and Elara. They come from six candidates offered to Yuki in the Task 1 report, and the coordinator swaps the IDs after Yuki picks.

### Still to be recorded here (Yuki)

- The plan Yuki upgraded to, the monthly spending cap, and that `ELEVENLABS_API_KEY` is exported locally.
- The approved voices.
- ~~The agent's permanent name and display name.~~ Decided by Yuki, 2026-11-24: `site-to-video`, "Site to Video" (agent.yaml, package.json, package-lock.json). The folder is still `demo-video/`.

## make-audio (Task 6)

- **Per-call limits in the tool, per-job limits in the package gate.** A tool cannot see its earlier calls in the same job, so `make-audio` enforces per-call limits only (voice: 60 words and 400 characters, raised to 80 and 540 in Task 15; music: 200-character prompt, seconds clamped to 15-22; sound: 1-6 items, 120-character prompts, 0.5-3 s, removed in Task 15). The package gate allows at most 2 calls per action (one retry), counted with `audioCallsMade()`. The ElevenLabs spending cap is the money backstop.
- **Prompt refusals (Music Terms 2.1).** A music or sound prompt is refused (exit 2, no call) if it has quotes, or the words `by`, `song`, `album`, `artist`, `lyrics`, `in the style of`, or `like <Capitalised name>`. It is a blunt filter; it will also refuse innocent uses of "by".
- **Music** is sent with `force_instrumental: true`. Default output format `mp3_44100_128`.
- **Output files are intermediates.** `voice.mp3`, `voice-alignment.json`, `music.mp3` and `sound-*.mp3` feed the renderer only and must never be listed as customer outputs.
- **Live smoke test (2026-11-24, Yuki's key, real API):** voice (35 characters, Jade) 6.5 s, 2.4 s of audio, word timings correct; music (18 s) 4.7 s, 289 KB; sound failed with HTTP 401 `missing_permissions: sound_generation`, so the key needs the Sound Effects scope. Credits used could not be read (the subscription endpoint returned no usage, the key is scope-limited). By the pricing FAQ: voice about 35, music about 270 (900 per minute x 0.3), sound about 200 per generation.

## Rendering and capture (Task 2)

Local only (macOS arm64, 14 CPUs, 24 GB); the work machine half is Task 13. Full numbers, method and caveats: `spikes/FINDINGS.md`.

- **License:** allowed. remotion.dev/license, read 2026-11-24: "You are eligible to use Remotion for free if you are: an individual …" and "Permission is hereby granted, free of charge, to any person eligible for the "Free License", to use the software non-commercially or commercially for the purpose of creating videos and images". Disallowed only: selling "your own derivate of Remotion". Remotion 5.0 will change the license slightly; re-read before upgrading past 4.x.
- **Versions:** `remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/cli` 4.0.547; `react`, `react-dom` 19.3.1; `puppeteer-core` 25.18.1. All pinned exactly.
- `renderSecondsWide`: **6.4** (20 s at 1920×1080, h264/aac, default concurrency 7); 14.7 at concurrency 2, which is what the 4-CPU work machine will use by default.
- `renderSecondsTall`: **5.9** (20 s at 1080×1920); 14.7 at concurrency 2.
- `peakMemoryMB`: **3025** (summed RSS of node and all Chrome processes, an upper bound; `/usr/bin/time -l` max RSS of node alone: 852); 1861 at concurrency 2. Bundling adds ~1 s.
- `remotionBrowser`: **`remotion`**. System Chrome 156 rendered correct frames but took 44–64 s and crashed mid-render 2–21 times per job (Remotion retried). Remotion's Chrome Headless Shell (158.0.8127.2) had no crashes and was 4–10× faster. Install line, after `npm ci`: **`npx remotion browser ensure`** (downloads ~140 MB linux64 headless shell; needs network at install and Chrome's shared libraries, which the work machine's `/usr/bin/google-chrome` suggests are present). In code, `browserExecutable: null`.
- `captureMethod`: **`virtual-time`**. 1440×810 at DPR 2, 4 s, 30 fps: 0 duplicate frames (mpdecimate) in all 7 runs at ~1.3× real time; CDP screencast gave 0–1 duplicates in 8 runs at 1.0×. Virtual time also cannot stutter on a slow machine, only take longer, whereas screencast at 2880×1620 on 4 CPUs without a GPU may fall under 30 fps. The clock virtualizes `requestAnimationFrame`, `performance.now`, `Date` and every `document.getAnimations()` entry (CSS animations and transitions, including hover transitions); not `setTimeout`/`setInterval` or `<video>`. If it runs over 4× real time on the work machine, measure `screencast` there the same way.
- **Fallback if neither is smooth:** screenshots only, with camera moves and a drawn cursor, skipping live interactions (spec 10).

## Local runs (Task 12)

### Deliberate narrowings and checks

- **Spec 5.5's exception is narrowed.** The spec allows "a site's own pre-filled example input, which may be run once if running it needs no account". `capture.mjs` has no such action: it never types or submits, and the only clicks it allows are the scout's `demo-link` and `example-button` elements, tabs, menus and `summary`. A site's own "Try an example" button is still allowed; running a pre-filled form (pressing its submit) is not. Judging whether a submit "creates something" or costs the owner money cannot be checked by a program, so the safe reading wins. Revisit with Yuki only if the live-product videos are too weak to post (spec 5.5, last bullet).
- **Audio prompts are checked in stage 3.** `lib/audio-prompt.cjs` holds make-audio's prompt rule (no quote marks or apostrophes, no artist or song cue words); `validateShotlist` runs it on `musicBrief` and each `sounds[].prompt`, and checks the joined narration against make-audio's 400-character limit, so a refusal is caught before the paid stage.

### The four links (spec 14), scouted 2026-11-24

All four loaded in Chrome through `kit/scout.mjs` with no sign-in, `blocked: false`, `latinShare` 1.

1. Landing page, `wide`: https://www.raycast.com (dark hero, animated gradient, 12,000 px page).
2. The same landing page, `tall`.
3. GitHub CLI repo with no site: https://github.com/sharkdp/hyperfine (`homepage` empty, description "A command-line benchmarking tool").
4. Web app with a public no-sign-in demo: https://svelte.dev (scout's `demoLinks`: https://svelte.dev/playground, same site). Rejected: jsoncrack.com (its "Go to Editor" is not found as a demo link), typescriptlang.org (kept as a spare: `demoLinks` /play).

### Runs

Cost is `total_cost_usd` from the claude result event (Opus 5.5, this Mac). ElevenLabs credits are estimated from the pricing FAQ (1 credit per narration character; music about 900 per minute; sound 200 per generation): the key cannot read its own usage.

**Run 1: Raycast, `wide`.** PASS, packaged on the first `--package`. 4 min 54 s, $1.57 (58 input + 122,831 cache-write + 2,781,110 cache-read + 19,947 output tokens). ElevenLabs: 2 voice calls (277 + 250 characters), 1 music call (18 s, about 270 credits), 1 sound call refused with HTTP 401 (key lacks `sound_generation`): about 800 credits. Video: 19.9 s, Elara, four moments (hero push-in, extension cards, AI Chat panel, a recorded clip of the keyboard keys lighting up) and an end card. Problems seen:
- The voice ran 20.5 s for 43 words (2.1 words a second; the second take was 37 words in 18.6 s, 2.0), not the 2.6 the validator assumes, so a second voice call was needed and the video grew to 20 s.
- The music was asked for in the same command as the voice, at 18 s, before the video was lengthened; the last 1.9 s (the end card) were silent. Fixed: `render.mjs` refuses a music bed more than 0.3 s shorter than the video (`musicTooShort`, test), and the prompt now orders voice, then settle the length, then music.
- `check-video` read the container's 20.01 s (AAC padding) for a 600-frame render and failed it. Fixed: the duration rule reads the video stream's duration (test).
- Narration captions sit over the lower part of the feature cards and the AI Chat panel; the model's frame review did not flag it.
- Confirmed: `Read` works on files outside `--add-dir runDir` (the model read PNGs under `/tmp`), so no change to `run-job.mjs`; the model's shell sees `DEMO_JOB_ROOT` and `DEMO_AGENT_ROOT` (`stage.mjs` found the job folder); `tool-output/c1`–`c4` were created, one per call. `run-job.mjs` prints no `[progress]` lines because the model puts each `echo` in the same command as the stage command; harmless.
- **Voice pace, measured.** The same 37 words took Jade 15.8 s (2.3 words a second), Darian 17.3 s (2.1) and Elara 18.6 s (2.0); two measuring calls, about 500 credits. `voices.json` now gives each voice a `wordsPerSec`, and the validator judges the narration's length at the chosen voice's pace (test). In a 15–20 s video that allows about 35–42 words, not the spec's 35–50 (5.4 is a proposal); the prompt now aims for 35–42. Test fixtures whose 36 words could not fit 16 s at Jade's pace were trimmed to 35 words from 0.2 s (the terminal fixture lengthened to 16 s). A voice Yuki adds later needs its pace measured once.

**Run 3: hyperfine (GitHub CLI repo, no site), `wide`.** PASS. 4 min 29 s, $0.98 (48 input + 82,644 cache-write + 1,441,193 cache-read + 13,858 output tokens). Ran in parallel with run 2. ElevenLabs: 1 voice call (255 characters), 1 music call (20 s, about 300 credits), 1 sound call refused with 401: about 555 credits. Video: 20 s, Elara, README push-in, a glide to the Features list, an animated terminal typing three README commands (the README shows its output only as an image, so commands only), end card. The new order worked: the voice came back at 18.5 s for a 19 s video, the model lengthened the video to 20 s, then asked for 20 s of music. Problems seen:
- The voice ran 0.03 s over what Elara's 2.0 words a second predicted; Elara is now 1.9.
- The terminal moment was 9 s, but its three commands finish typing about 4 s in, then the picture holds still for 5 s. The prompt now gives the terminal's typing speed and asks to size the moment to it, or split it in two.
- Elara again: both runs so far chose the same voice.

**Run 2: Raycast, `tall`.** PASS. 9 min 52 s, $1.61 (84 input + 92,941 cache-write + 3,015,769 cache-read + 27,145 output tokens). ElevenLabs: 1 voice call (221 characters), 1 music call (20 s, about 300 credits), 1 sound call refused with 401: about 520 credits. Video: 20 s, Elara, hero push-in, the Clipboard History window and dock, the Linear extension card, a 7 s recorded clip of the AI Chat section (below the 12,000 px screenshot cap, so a clip was the only way to reach it), end card. Problems seen:
- The scout failed twice with "Execution context was destroyed, most likely because of a navigation" (the page navigates itself after loading at phone width), and the model then spent about 4 minutes reading the kit and writing probe scripts in the run folder before a third try passed. Fixed: `scout.mjs` reads the page through `readAfterNavigation`, which waits for the network to settle and reads once more when a navigation destroys the context (unit test; the race could not be reproduced with a local page, so the test drives the helper directly; three later scouts of raycast.com at `tall` passed). The prompt now says the kit is fixed: never read, debug or import it; retry a failing program once, then refuse; keep scratch files under `work/scratch/`.
- The AI Chat clip is 7 s with little motion; the model said so itself. Narration captions overlap the lower edge of the Clipboard History dock and the AI Chat window.
- The model saw `wordsPerSec` 2.0 in `voices.json` but the validator used 1.9: I changed the file during the run; not a defect.

**Run 4: svelte.dev (web app with a public demo), `wide`.** PASS. 3 min 48 s, $0.98 (46 input + 82,563 cache-write + 1,555,754 cache-read + 12,669 output tokens). ElevenLabs: 1 voice call (215 characters), 1 music call (18.5 s, about 280 credits), 1 sound call refused with 401: about 495 credits. Video: 18.5 s, Jade, hero push-in on "web development for the rest of us", a glide to the framework description and survey chart, a 6.5 s clip of the Playground (code beside its Hello world result, cursor hovering), end card. Problems seen:
- The Playground clip is mostly still: no typing is allowed and the model did not use the Playground's example menu, so the "live product" shows one static example.
- The opening narration caption sits over the top of the "/svelt/" section in the hero frame.

### Refusal checks (step 4b)

- **Redirect to a private address:** `https://postman-echo.com/redirect-to?url=http://192.168.1.1/` (a real 302; httpbin.org and httpbingo.org refuse private targets themselves, so they test nothing). The scout refused it; the job ended with only `result.md`: "It redirects to a private network address (192.168.1.1), and this service only films public pages on the open internet." 20 s, $0.22, no audio calls.
- **Bot check:** `https://nowsecure.nl` (a "Verify you are human" page). The scout reported `blocked`; only `result.md`: "The page opens on a 'Verify you are human' bot check and shows almost no readable text …". 29 s, $0.26, no audio calls.

### Cost and variety (step 4)

- **ElevenLabs per job, without sound effects:** about 500–800 credits (narration 215–527 characters including retakes, music 18–20 s at about 15 credits a second). Music is about 280–300 of those, roughly half today, but about a quarter once the 2–3 sound effects (200 each) work. At Scale's rate ($299 for 1.8M credits) music is about $0.05 a job; the model costs $0.98–1.61. Music calls took about 5 s. Music is neither most of the cost nor slow, so the spec 9 fallback (tracks made once) is not needed.
- **Variety:** the four videos differ in moments (a dark product page with recorded keyboard keys; the same page at phone width with Clipboard History and a recorded AI section; a README pass into an animated terminal; a framework hero into a live Playground clip), camera moves (push-ins, glides, a recorded scroll) and pacing (18.5–20 s, 3–4 content moments). Voices: Elara three times (both Raycast runs, hyperfine), Jade once (Svelte), Darian never. Elara for a product's two formats is reasonable; the narrow spread is noted for Yuki's voice picks.

### Reruns (4 of the 6 allowed were used for videos, 2 for the refusal checks)

**Run 3b: hyperfine, `wide`, after the terminal-pacing prompt.** PASS. 4 min 44 s, $1.16 (58 input + 89,297 cache-write + 1,878,077 cache-read + 16,864 output tokens). ElevenLabs: 1 voice call (36 words), 1 music call (19 s), sound refused with 401: about 530 credits. Video: 19 s, Darian; README push-in on the benchmark screenshot, two terminal moments (4 s and 5.5 s) that type steadily to their ends, a glide to the feature list, end card. Better than run 3: no frozen terminal. The closing narration caption sits over plain README text.

**Run 2b: Raycast, `tall`, after the scout fix and kit rule.** PASS. 7 min 16 s, $1.63 (66 input + 108,469 cache-write + 2,899,427 cache-read + 25,588 output tokens). ElevenLabs: 1 voice call (41 words), 1 music call (19 s), sound refused with 401: about 540 credits. The scout passed first time; the model did not touch the kit. Video: 19 s, Jade; hero, Clipboard History with its toolbar, the Linear card, the AI section, an end card with the cropped logo. Problems: the "With Clipboard History, you'll never forget" moment caption touches the page's own text under it, and the narration caption sits over the AI Chat window's lower half.

**Sound effects, retried at the end (2026-11-24):** still HTTP 401 `missing_permissions: sound_generation`. Every video above has narration and music but no sound effects; each run's model dropped its cues and carried on, as the gate allows. Needs Yuki to add the Sound Effects permission to the key, then one run to confirm.

**Run 1b: Raycast, `wide`, rerun after the music-length fix.** PASS. 6 min 31 s, $1.80 (70 input + 130,145 cache-write + 3,421,004 cache-read + 23,229 output tokens). ElevenLabs: 1 voice call (38 words), 1 music call (19 s), sound refused with 401: about 520 credits. The validator caught a narration too long for Darian's pace before any paid call. Video: 19 s, Darian; hero push-in, Clipboard History, the extension cards, a push-in on the AI Chat window, end card. Problem: the audio is almost silent from 16 s (the end card), though the music file was 19 s long. Measured across all runs: **ElevenLabs winds a music bed down over its last 2–5 s** (Svelte's 18.5 s bed was at −45 dB by 15 s), so most end cards played with fading or no music.

**Music tail fix.** `make-audio music` now asks ElevenLabs for 8 s more than the video (`seconds` still clamped 15–22, so at most 30 s), and the renderer's own 1.2 s fade ends the bed at the video's end (test). Measured with the same prompt for a 19 s video: asking for 24 s (5 s extra), the bed was at −26 dB at 18 s and −34 dB at 19 s, still winding down; asking for 27 s (8 s extra), it held −22 dB from 12 s to 25 s. Cost: about 120 more credits a job (about $0.02 at Scale's rate). Two test calls, about 750 credits.

**Run 1c: Raycast, `wide`, after the music tail fix (the last rerun allowed).** PASS. 5 min 6 s, $1.72 (70 input + 121,403 cache-write + 3,273,649 cache-read + 22,798 output tokens). ElevenLabs: 1 voice call (244 characters), 1 music call (19.5 s asked, 27.5 s made, about 410 credits), sound refused with 401: about 655 credits. Video: 19.5 s, Darian; hero push-in, Clipboard History captioned "Remember Everything.", a pull-out over the extension cards, the AI Chat window, end card. The music holds through the end card (−28 dB at 18 s, then the renderer's fade). No problems seen beyond the missing sound effects.

### The four videos for Yuki (step 5)

| Link | Run | Folder under `local-runs/` | Voice | Note |
|---|---|---|---|---|
| raycast.com `wide` | 1c | `20261124-134019-www-raycast-com` | Darian | made after every fix |
| raycast.com `tall` | 2b | `20261124-132400-www-raycast-com` | Jade | music fades from 17 s (made before the tail fix) |
| hyperfine `wide` | 3b | `20261124-132357-github-com-sharkdp-hyperfine` | Darian | music happened to hold to the end |
| svelte.dev `wide` | 4 | `20261124-131409-svelte-dev` | Jade | music fades from 14 s; the end card is nearly silent (made before the tail fix) |

Totals for Task 12: 10 jobs (4 links, 4 video reruns, 2 refusal checks; the refusal checks counted against the 6 reruns), $11.93 of model use, and about 5,900 ElevenLabs credits (about 4,600 in jobs, plus 2 pace and 2 music measuring calls). Every video lacks sound effects (the key's permission).

## Pacing 1.35× and no sound effects (Task 15, spec 16)

### How the pace works

- **One setting:** `config/config.json` `"pace": 1.35`, read only through `lib/pace.cjs` (`pace()`; CommonJS so `tools/make-audio` can require it). It must be 0.5 to 2; missing means 1.35. Changing it needs `node kit/build-prompt.mjs` (the prompt's numbers come from it; `test/build-prompt.test.mjs` fails until prompt.md is rebuilt).
- **Plan-seconds.** The shot list, cursor `atSec` and capture actions are in plan-seconds, at normal speed. `kit/render.mjs` divides every moment's start and end by the pace (output frames = round(durationSec / pace × 30)); the camera follows the moment's frames, and the cursor and the terminal run their own plan-second clocks at `frame / fps × pace`. A clip is recorded in real time for its moment's plan-seconds and played with `OffthreadVideo playbackRate={pace}`, so it fills the shorter moment exactly. Crossfades (6 and 10 frames) and caption fades stay in frames.
- **Validator limits** (`shotlistLimits(pace)` in `lib/shotlist.mjs`): `durationSec` 15·pace to 20·pace (20.25–27; only 0.01 of slack, because the renderer rounds to frames and the check allows 15.0–20.0 s); 3–5 content moments of at least 2 plan-seconds; end card 1.5·pace to 3·pace (1.5–3 s of output); narration round(35·pace) to round(50·pace) words (47–68); the narration estimate `voiceStartSec + words ÷ wordsPerSec ≤ durationSec − 0.5·pace`. `voices.json` `wordsPerSec` stays as measured at normal speed, which is the rate in plan-seconds.
- **Voice.** ElevenLabs' `voice_settings.speed` goes from 0.7 to 1.2 ("Values above 1.0 will speed up the voice, to a maximum of 1.2. Extreme values may affect the quality", [text-to-speech guide](https://elevenlabs.io/docs/product-guides/playground/text-to-speech), read 2026-11-24; not available on Eleven v3/v4, but we use the default `eleven_multilingual_v2`). `make-audio voice` asks for `min(1.2, pace)`, records `speed` in `voice-alignment.json` (timings stay in seconds of `voice.mp3`) and answers `planSec` = last word end × speed. The renderer (`paceVoice`) applies the rest, `atempo = pace ÷ speed` (1.125), which changes tempo and keeps pitch, writing `work/audio/voice-paced.wav`, and scales the words by the same factor (`heardWords`). Captions, ducking and `check-video`'s `narration-overrun` all use those heard timings, in seconds of the video. The tempo change runs in the render step, not in make-audio, because make-audio runs in the harness VM, which may have no ffmpeg; the workspace has it.
- **Voice caps:** 80 words and 540 characters per call (`lib/audio-prompt.cjs`; were 60 and 400).
- **Music** is unchanged: made for the finished video's length (`seconds` = durationSec ÷ pace, which `validate-shotlist.mjs` now prints with each moment's output times), never sped up. `musicTooShort` compares against the output length.
- **Capture:** a clip may be up to 20·pace plan-seconds (27), up from 20.

### No sound effects (spec 16.2)

- `make-audio sound` is refused (exit 2, "sound effects are not used", no call). `agent.yaml` has only `voice` and `music`, and its descriptions no longer promise sound effects. The key no longer needs the `sound_generation` permission.
- A shot list with a top-level `sounds` or a moment's `sounds` (even empty) is refused, saying sound effects are not used. `audioCallsMade` counts only voice and music; an old `make-audio-sound.json` is ignored. The renderer neither copies nor plays sound files.
- The prompt no longer mentions sound effects. The stage is still called `sound` (it makes the voice and the music); renaming it would touch every stage test for no behaviour change.

### What ElevenLabs' speed 1.2 really does (measured 2026-11-24)

The same narration at speed 1.0 and 1.2: Darian 21.2 s vs 17.1 s (1.24×), Elara 22.4 s vs 17.9 s (1.25×). So 1.2 speeds speech up about 1.245×, and with the renderer's 1.125 the voice is heard about **1.40× faster**, a little over the 1.35 pace. `planSec` (spoken length × 1.2) therefore reads about 4% short of the true normal-speed length; the overrun check uses the heard timings, so nothing breaks. If Yuki wants exactly 1.35, the fix is one constant (tempo = pace ÷ 1.245, planSec = spoken × 1.245), better measured on all voices first. Two calls, about 635 credits.

The pitch is kept: median F0 by autocorrelation before and after the tempo change was 119.4/119.4 Hz (Darian), 183.9/188.2 (Elara), 190.5/188.2 and 200/200 (Jade), within the estimator's noise; length ratios 1.124–1.125 (target 1.125).

### Local runs at pace 1.35 (Task 15)

Same four links as Task 12, once each, all PASS on the first package, no reruns. Cost is `total_cost_usd` (Opus 5.5, this Mac); ElevenLabs credits estimated as in Task 12 (1 a narration character; music about 15 a second, asked for the video's length + 8 s).

| Run | Link | Folder under `local-runs/` | Time | Model cost | Tokens (input / cache-write / cache-read / output) | ElevenLabs |
|---|---|---|---|---|---|---|
| 1 | raycast.com `wide` | `20261124-142036-www-raycast-com` | 5 min 56 s | $1.77 | 64 / 135,373 / 3,110,629 / 23,541 | voice 326 chars, music 18.6 s: about 725 credits |
| 2 | raycast.com `tall` | `20261124-142646-www-raycast-com` | 7 min 43 s | $1.86 | 72 / 119,153 / 3,428,440 / 28,728 | voice 349 chars, music 19.2 s: about 755 |
| 3 | hyperfine `wide` | `20261124-142042-github-com-sharkdp-hyperfine` | 4 min 25 s | $1.37 | 66 / 102,837 / 2,305,373 / 19,547 | voice 309 chars, music 19.8 s (the first music call got HTTP 429 "system_busy"; the model's retry worked): about 725 |
| 4 | svelte.dev `wide` | `20261124-142536-svelte-dev` | 3 min 55 s | $1.22 | 52 / 98,794 / 1,824,798 / 17,959 | voice 330 chars, music 19 s: about 735 |

Totals: $6.22 of model use; about 2,940 ElevenLabs credits in the jobs plus 635 for the speed measurement. No sound calls were made.

- **What changed on screen.** The videos now hold 4–5 content moments (Task 12: 3–4) and 47–55 words of narration (Task 12: 35–43). Run 1: hero push-in, three recorded clips (Clipboard History, the lit keyboard, Raycast AI syncing Linear into Things), end card; 18.6 s, Darian. Run 2: hero, a Clipboard History clip, the Linear extension card, a clip gliding through the AI section, end card with the logo; 19.1 s, Jade. Run 3: the repo page, the README's benchmark output, two terminals typing the README's commands, the export table, end card; 19.2 s, Elara. Run 4: hero, the /svelt/ definition and survey card, the Playground (a screenshot), the company logos, end card; 19.0 s, Jade. Clips, terminal typing and camera moves all run visibly faster; captions stay with the voice.
- **The voice is fast.** Heard rates: 2.96 (Elara), 3.28 (Darian), 3.58 and 4.11 (Jade) words a second. Jade at 4.1 (run 2) is very quick. The validator's estimate cannot see it coming: these texts read at 2.36–2.94 words a second at normal speed, faster than the `wordsPerSec` measured in Task 12 (2.1–2.3), so the model wrote up to 55 words and the voice still ended 3–5 s before the video. No speech-to-text was available here, so intelligibility was not machine-checked; Yuki's listen decides whether Jade needs a lower pace or a word cap.
- **Still as in Task 12:** narration captions sometimes sit over page text (run 2's Clipboard History and AI sections, run 4's opening "/svelt/" and the logos headline). The Playground in run 4 is a screenshot, not a clip.

## Pace 1.3, voice heard at exactly the pace (spec 16.3, Yuki after the 1.35 runs: "ok maybe a bit too fast rn, lets do 1.3")

- `config/config.json` `"pace": 1.3`. The limits follow from it: 19.5–26 plan-seconds, end card 1.95–3.9, 46–65 words, end margin 0.65, clips up to 26 plan-seconds. Every prompt number comes from `paceValues()` in `kit/build-prompt.mjs`, now including the practical word range (round(42 × pace), 55 at 1.3), "a 4 plan-second moment is about 3.1 s on screen" and the example shot list's times (review R15 minor 3).
- **The tempo step uses the measured speed-up.** `lib/pace.cjs` `MEASURED_SPEED_UP = { setting: 1.2, speedUp: 1.245 }` (the two measurements above), with `speedUp(setting)` linear between 1.0 and 1.2. Tempo = pace ÷ speedUp(setting): 1.3 ÷ 1.245 = 1.044 at pace 1.3. make-audio's `planSec` = spoken length × speedUp(setting), the normal-speed length. If a pace is below 1.245, `voiceSpeed()` lowers the setting (rounded down to 0.01) so the tempo step stays ≥ 1. It always clamps to ElevenLabs' 0.7–1.2 (review minor 2). The linear part between 1.0 and 1.2 is an assumption; only 1.2 was measured.
- **Tests pin the fixtures' pace.** `test/helpers.mjs` `FIXTURE_PACE = 1.3`. `renderDemo`, `openStage`/`stageProblems`, and the `validate-shotlist` and `check-video` CLIs (`--pace`) take it, so a different `config.json` pace breaks only the config test and the prompt.md-is-current test (checked at pace 1.5) (review minor 4).
- **Fixtures at 1.3:** plan-seconds = output × 1.3. The job-good and landing shot lists start the voice at 0 with 46 words: at 1.3 a 16 s video with Jade (2.3 words a second) fits the 46-word minimum only from 0. Clips were re-timed from the original 4 s recordings to 5.2 s. `job-good/voice-speed-1.2/` is the fixture voice as ElevenLabs gives it at speed 1.2; a render test puts it in the job and checks the voice is heard ending where the normal-speed one does, within 2% (review minor 5).

### Reruns at pace 1.3 (two links, 2026-11-24)

Both PASS on the first package, no reruns.

| Link | Folder under `local-runs/` | Time | Model cost | Tokens (input / cache-write / cache-read / output) | ElevenLabs |
|---|---|---|---|---|---|
| raycast.com `tall` | `20261124-144905-www-raycast-com` | 6 min 25 s | $1.86 | 80 / 120,062 / 3,760,549 / 25,217 | voice 338 chars, music 19.4 s: about 750 credits |
| hyperfine `wide` | `20261124-144911-github-com-sharkdp-hyperfine` | 4 min 7 s | $1.22 | 50 / 94,768 / 1,761,348 / 19,766 | voice 320 chars, music 19.4 s: about 730 |

Plus two speed-1.0 reads of the same narrations to check the heard pace: about 660 credits. Total $3.08 and about 2,140 credits.

- **Raycast tall** is 19.4 s: hero, Clipboard History, the Linear card captioned "Plus thousands more...", a clip of the AI section, end card. The model chose **Darian**, not Jade, so the Jade case from the 1.35 run was not repeated; the voice is picked by the model from the page's tone. **Hyperfine** is 19.4 s, Darian: README push-in, two terminals typing the README's commands to their ends, the Features list, end card.
- **Heard voice:** 50 words each, heard at 2.88 (Raycast tall) and 3.45 (hyperfine) words a second; 1.35's runs were 2.96–4.11. Tempo step 1.044 in both; median pitch 122.1 → 121.2 and 122.1 → 122.1 Hz.
- **The heard pace is not exactly 1.3.** The same text read at speed 1.0 against the heard voice: Raycast tall 22.01 s at 1.0 and 17.39 s heard, **1.27×**; hyperfine 21.36 s and 14.50 s, **1.47×**. The speed-1.2 setting's own speed-up in these two takes was 1.21× and 1.41×, against 1.24× and 1.25× in the first two measurements. Four measurements so far: mean 1.28, spread 1.21–1.41. Each one compares two independent ElevenLabs takes, and a take's own reading pace varies from call to call. So no single constant can make the heard pace exactly 1.3; with 1.245 the four texts would be heard at 1.27–1.47×.
- **Options (for Yuki/coordinator):** (a) keep speed 1.2 and the constant, maybe moved to the mean of more measurements, and accept about ±10%; (b) ask ElevenLabs for speed 1.0 and do the whole 1.3 with the tempo step, so the voice is exactly 1.3× the take ElevenLabs gave (still that take's own natural pace), at the cost of a larger time-stretch (1.3 instead of 1.044); its sound would need a listen. Not changed without a decision.
- Still as before: narration captions sometimes sit over page text (the Linear card); in Raycast tall the last words "raycast.com." are still on screen as the end card fades in.

## Voice tempo from each clip's own rate (ruling R19)

- ElevenLabs' speed-1.2 effect varied 1.21–1.41× between takes, so a constant cannot hit the pace. `voice_settings.speed` stays 1.2 (its natural delivery). The tempo step is now worked out per clip in `lib/pace.cjs` `voicePlayback(alignment, rate, pace)`. The clip's words a second, from the first word's start to the last word's end (silence before and after left out), are set against the voice's normal rate (`voices.json` `wordsPerSec`, measured at speed 1.0) × pace: tempo = rate × pace ÷ clip rate. It is clamped to 0.8–1.6, well inside ffmpeg atempo's 0.5–100, and the renderer warns when it clamps. With no rate or fewer than 2 words it falls back to the measured-constant tempo (pace ÷ 1.245 at speed 1.2).
- The renderer (`paceVoice`), check-video's `narration-overrun` and make-audio's `planSec` all call `voicePlayback`, so they agree. The heard rate is then the voice's normal rate × pace (Jade 2.99, Darian 2.73, Elara 2.47 words a second at 1.3), which is exactly what the validator's estimate `voiceStartSec + words ÷ wordsPerSec` assumes in plan-seconds.
- The heard rate depends on `voices.json` `wordsPerSec`. Those rates were measured in Task 12 on one 37-word text; a voice that reads a given text faster than its listed rate is slowed down to it (tempo below the 1.245 average, possibly below 1).
- Fixture: the 46 fixture words now span 46 ÷ (2.3 × 1.3) = 15.385 s heard (0.05–15.435 s), so the fixture voice's tempo is exactly the pace, and the speed-1.2 variant's is 1.044.

### Rerun with the per-clip tempo: hyperfine `wide` (2026-11-24)

PASS on the first package. `local-runs/20261124-150254-github-com-sharkdp-hyperfine`: 3 min 45 s, $1.24 (54 input + 102,129 cache-write + 1,889,238 cache-read + 17,544 output tokens). ElevenLabs: voice 315 characters, music 19.3 s: about 725 credits.

- Video: 19.2 s, Darian, 49 words. README push-in, two terminals typing the README's commands to their ends, a glide over the Features list, end card.
- **Heard rate exactly on target.** The take came out at 3.12 words a second at speed 1.2, far faster than Darian's 2.1 × 1.245 = 2.61 average, so the tempo is **0.8745**: the voice is slowed. Heard rate 2.73 words a second = 2.1 × 1.3 (0.00% off), no clamp. The paced file is 0.875× the length of the original; median pitch 113.5 → 113.5 Hz.
- The voice now ends at 18.3 s of the 19.2 s video, so the last narration line ("Try hyperfine, linked on screen.") plays over the end card. This take shows ElevenLabs' fast reads can make the tempo step a slow-down (0.87); whether a slowed take sounds natural is for Yuki's listen.

## Starwish dev runs (Task 13)

`ELEVENLABS_API_KEY` was stored on the account before this task (status ok). Every run below is a `starwish dev` of the working tree, request text "Make a demo video." unless noted, params `{"url":…,"format":…}`. Videos for Yuki: `demo-video/starwish-runs/<n>/demo.mp4` (with `poster.png`, `result.md`, the `dev.json` stream); the folder is ignored by git and by the upload.

### The work machine, measured (spec 10 tests 1–4)

- **Workspace VM:** Linux x86-64, **8 CPUs, 12,651 MB** (`os.cpus()` and `/proc/meminfo`, from `machine` in render's and capture's JSON line; the sibling's Task 4 probe saw 4 CPUs and 12,650 MB on 2026-11-23). No GPU.
- **`workspace.install` builds:** `apt-get install -y ffmpeg && npm ci --omit=dev && npx remotion browser ensure` ran in about 55 s (ffmpeg 7.1.5, Chrome Headless Shell 158.0.8127.2 to `/agent/node_modules/.remotion/…`). Harmless noise: debconf "unable to initialize frontend", "Can not write log (Is /dev/pts mounted?)", npm's install-scripts warning for esbuild.
- **Test 1, render: passes.** Remotion's Chrome Headless Shell runs there. 18.8–19.5 s of video in **37–64 s** (wide 37.0, 43.4, 44.1; tall 43.9; with a recorded 2880×1620 clip 56.0–63.8), target under 3 minutes. **Peak memory 2.2–2.5 GB** machine-wide (MemTotal − MemAvailable, sampled every 250 ms, Chrome included) for screenshot-only videos, **4.6–5.4 GB with a clip** (`OffthreadVideo` decoding the clip), of 12.6 GB.
- **Test 2, capture: smooth, but 8.6× real time.** Virtual-time capture works on the work machine's system Chrome (`/usr/bin/google-chrome`). The 1b clip (raycast.com keyboard section, scroll and cursor): **136 of 138 frames distinct** by mpdecimate in the finished video, no stutter. But it is slow: **195 frames (6.5 s) in 56.1 s = 8.6×** real time (run 1b), and in run 1c 168 frames (5.6 s) in 48.3 s = 8.6× and 135 frames (4.5 s) in 41.0 s = 9.1×. About 15 s of each is the page load waiting out the network-idle cap (raycast.com never goes idle there; locally it does in 2.5 s), so the frame loop itself runs about 5.9×, some 170–190 ms a frame for a 2880×1620 screenshot. Capture used 1.4–1.5 GB. This is over the 4× trigger set in Task 2 (see "Capture over 4×" below).
- **Test 3, ElevenLabs through the credential gate: passes.** In every video run `make-audio voice` (2.4–3.0 s) and `music` (4.7–7.8 s) returned exit 0, and their files came back under `/job/tool-output/c1/` (`voice.mp3`, `voice-alignment.json`, `make-audio-voice.json`) and `c2/` (`music.mp3`, `make-audio-music.json`); the renderer found them there. `starwish price` counts exactly 2 calls to `api.elevenlabs.io` with `ELEVENLABS_API_KEY` per video run and none for the refusal.
- **Test 4, time and cost: passes for the four links; raycast.com with a clip can run over.** Job running time 3 min 12 s to 7 min 47 s for the four links, 9 min 15 s and **11 min 48 s** for raycast.com with a recorded clip (1b, 1c; table below), against the 10-minute target. `starwish price` (before 1c) suggested `max_response_time` 14m (slowest run + 50%); with 1c the same rule gives 18m. For Task 14. Model cost about $0.73–0.77 a video, $1.15 for 1c (Task 12/15 locally: $0.98–1.86, with 1.4–3.8M cache-read tokens against 1.1–1.4M here). ElevenLabs about 715–760 credits a video by the Task 12 estimate, as locally (2 calls; narration 312–342 characters, 47–54 words; music asked for 18.8–19.6 s, made 8 s longer, about 15 credits a second).

### Runs

Time is the job's `running` to `completed` (Starwish `run_seconds`); the queue and machine start add 1–2 min before it. Cost: runs 2, 4 and r1 are `total_cost_usd` from the harness's result event; the other runs' result events are missing from the log (below), so their cost is estimated from the tokens Starwish observed at the per-token rates that reproduce runs 2 and 4 within 3%. Tokens are input / cache-write / cache-read / output.

| Run | Link | Job | Result | Time | Cost | Tokens | Scouts | Render |
|---|---|---|---|---|---|---|---|---|
| 1 | raycast.com `wide` | job_01M87XFWGV4EW990RA8F0MHF6Z | PASS, 18.8 s, Darian, 4 moments + end card, no clip | 7 min 47 s | ≈$0.73 | 62 / 53,096 / 1,123,224 / 12,903 | 102.5 s, 89.3 s | 44.1 s (re-downloaded the browser, below) |
| 2 | raycast.com `tall` | job_01M87YDEAAKD115K9BW0FNBHDP | PASS, 18.8 s, Jade, 5 moments + end card, no clip | 6 min 3 s | $0.75 | 58 / 55,831 / 1,123,016 / 12,178 | 46.8 s, 45.2 s | 43.9 s |
| 3 | github.com/sharkdp/hyperfine `wide` | job_01M87YDZ2YWPN86YNK9ND3SCZ3 | PASS, 18.8 s, Darian, README, two terminals, Features, end card | 4 min 12 s | ≈$0.73 | 54 / 61,536 / 1,127,468 / 10,495 | 18.4 s | 43.4 s |
| 4 | svelte.dev `wide` | job_01M87YDYG30GMF95JZMF5G9F90 | PASS, 19.2 s, Jade, hero, /svelt/, Playground (screenshot), survey card, end card | 3 min 12 s | $0.77 | 60 / 51,896 / 1,400,506 / 11,281 | 6.0 s, 2.5 s | 37.0 s |
| r1 | nowsecure.nl `wide` (refusal) | job_01M87YE3AT271960P3N7NNSP8R | refused, job **failed** | 1 min 50 s | $0.13 | 12 / 17,013 / 117,930 / 987 | 41.4 s | — |
| 1b | raycast.com `wide`, request "Make a demo video. Include one recorded clip of the keyboard keys lighting up on the page." | job_01M87YX3J470XMBGP59MR7CT82 | PASS, 19.2 s, one recorded clip | 9 min 15 s | ≈$0.77 | 66 / 47,847 / 1,338,169 / 12,738 | 96.0 s, 106.1 s | 61.8 s |
| 1c | as 1b, scout and capture on the Headless Shell (experiment, reverted) | job_01M87ZH8C8TWNJ6MNX25KXZBVY | PASS, 19.5 s, one recorded clip (recorded twice, rendered three times after frame review) | 11 min 48 s | $1.15 | 82 / 70,679 / 2,279,493 / 16,777 | 107.0 s, 102.9 s | 63.8, 56.0, 56.7 s |

- **No run chose a clip by itself.** The prompt makes "a screenshot with a camera move" the default and a clip only "where real motion matters"; all four links came back screenshot-and-terminal only (locally, some Raycast runs used clips). So capture was measured with a customer wish (1b, 1c), the reruns' first use.
- **The refusal ends as failed.** nowsecure.nl no longer shows its "Verify you are human" check from here: Starwish's fetch got Cloudflare **HTTP 522** (origin timed out), and the scout passed the error page as an ordinary page (`blocked: false`, 1,018 px tall). The model refused from what it read ("the site isn't loading … Cloudflare's 'Connection timed out' page (error 522)"), wrote only `result.md`, and the platform ended the job `failed`, the state Starwish refunds (a dev run's settlement is `none`, so the refund itself is not visible). The scout's own `blocked` path (a real bot check) was not exercised on Starwish.
- **Fonts, Chrome, paths:** nothing differed from the local runs. Inter and JetBrains Mono render (contact sheets of runs 1–3 checked), `/agent` and `/job` paths and `/usr/bin/google-chrome` work as configured.

### What the runs fixed (commits 31b735a, a09c0c6, fdc0ff0)

- **Remotion re-downloaded its browser on every render.** Remotion looks for its Headless Shell under the nearest `package.json` above the *working directory*; `workspace.install` put it in `/agent/node_modules/.remotion`, but the model's commands run in `/job`, so every `render.mjs` downloaded 102.5 MB to `/job/…/.remotion` (run 1: both renders). `render.mjs` now asks `ensureBrowser()` from the agent folder once (`remotionBrowser()`, test from a folder with no `package.json`) and passes the path to every call; runs 2–4 downloaded nothing.
- **Bundle caching off:** webpack's cache at `/agent/node_modules/.cache` failed with `EACCES` (the agent folder is read-only in a job) and printed a warning the model sees; `bundle({ enableCaching: false })`.
- **Measurement:** `lib/machine.mjs` samples memory; `render.mjs` prints `machine`, `capture.mjs` prints `wallMs` and `machine`, `scout.mjs` prints `ms` (launch, load, read, shots). They stay: the numbers are useful for any later run.
- **Upload:** `.DS_Store`, `/.impeccable/` and `/starwish-runs/` are in `.starwishignore` (the first two had been uploaded once).

### Capture over 4×, and raycast.com's slow scout

- Raycast.com is the slow page. Its two scouts take 89–107 s each at `wide` (load 15 s at the idle cap, read 39–49 s, shots 40–47 s) and 45 s each at `tall`; svelte.dev's take 2.5–6 s and GitHub's 18 s. Locally the same raycast scout is 8.5 s. The page's blurs and gradients are painted by the CPU at 2880 px wide.
- **The Chrome build is not the cause.** Run 1c pointed scout and capture at Remotion's Headless Shell (`config.json` `chromePath`): scouts 107 and 103 s, capture 8.6×, the same as the system Chrome. Reverted to `/usr/bin/google-chrome`.
- **Screencast was not measured; the coordinator waived the rule (ruling R20).** Task 2's rule says to measure CDP screencast if virtual time runs over 4× there. Not done: the screencast spike is local-only (`/spikes/` is not uploaded). Hypothesis, not a finding: a 2880×1620 screenshot takes 170–190 ms a frame here, so a real-time screencast of this page *might* deliver only 5–6 frames a second, the stutter virtual time avoids; that number is a screenshot round-trip, not the page's measured paint rate. **R20:** the 4× rule is waived and virtual time stays, because the clips were smooth (136 of 138 frames distinct), the cost is job time only, and a real-time screencast on a CPU-bound page can only stutter, never run faster than the page paints.
- **The cost in job time:** a clip of n plan-seconds takes about 15 s + 6n s to record on a heavy page (41–56 s for the 4.5–6.5 s clips here), on top of about 3.4 minutes of scouting raycast.com, and a clip render takes about 60 s. When the model's frame review asks for changes, each re-record and re-render adds about 2 minutes: 1c recorded once more and rendered twice more and took 11 min 48 s, over the 10-minute target; 1b, with no second pass, took 9 min 15 s. Two ways to buy time back, not done without a decision: skip the second scout when the page to film is the link itself at the same format (the visit's scout already made the same files; about 100 s on raycast.com), and record clips at DPR 1 scaled up (about 4× fewer pixels a frame, softer clips).

### Key never leaked (step 4)

The ElevenLabs key's first 8 characters (read from the environment inside the command, never printed) were searched with `grep -c -F` in all seven runs' full `starwish logs --json` (fetched after each job ended) and in every downloaded file under `starwish-runs/` (`demo.mp4`, `poster.png`, `result.md`, `dev.json`): **0 matches** in each. Caveat: the harness's own stdout stream in the log stops after the model's first image read (runs 1, 3 and 1b lost their result events this way); the relay's `tool_call`/`tool_result` frames, which carry every command and its output, are complete.

### Notes for Task 14

- `starwish dev` returns after about 10 minutes even if the job is still running (1c); `starwish wait <job>` follows it to the end.
- Free dev runs: the account had 11 left in the rolling 24 hours before run 1; this task used 7 (the 4 links, 1 refusal, 2 of the 4 allowed reruns).

### Task 14 fixes (ruling R21)

- **The scout stage reuses the visit's scout.** Every scout writes `scout.json` (`{ url, format, result }`) beside its files. `scout.mjs --reuse <dir>` copies the four files from an earlier scout of the same page, meaning the link or its `finalUrl` after URL normalisation, at the same format, when that scout was `ok` and not `blocked`. Any other case scouts afresh. The prompt's stage 2 command always passes `--reuse` with the visit's folder, so the program decides, not the model. On Starwish this saves one of raycast.com's two 89–107 s scouts.
- **An HTTP error page is refused.** A main document whose final status is 400 or above returns `ok: false` ("The page answered with an error (HTTP 522) …") before anything is read or photographed. In Task 13's run r1 the scout passed a Cloudflare 522 page as an ordinary page (`blocked: false`). A Cloudflare bot challenge served with 403 is now refused for its status rather than reported `blocked`; both end as a refusal.
- **The render's browser lookup falls back.** If `ensureBrowser()` fails from the agent folder (for example EACCES on the read-only `/agent` when the shell is missing), `remotionBrowser()` warns and returns `null`, and Remotion finds its own browser from the job's folder.
- **The local run (raycast.com `wide`, 2026-11-24):** `local-runs/20261124-162552-www-raycast-com`, 9 min 0 s, $2.16 (84 / 134,763 / 4,407,681 / 29,997 tokens: input / cache-write / cache-read / output).
  - The visit's scout took 7.5 s (launch 1.0, load 2.6, read 2.4, shots 1.6).
  - The scout stage's scout printed `"reused": true` in **10 ms**.
  - The model chose a recorded clip and did one frame-review round. Its video passed `check-video.mjs` (19.4 s).
  - Packaging refused it: "make-audio voice was called 3 times". The first two voice calls failed with "could not reach ElevenLabs: fetch failed", because Claude Code's Bash sandbox blocks api.elevenlabs.io in local runs. The model then tried a third time, beyond the prompt's two, and the gate counted it and refused. That is the right outcome under the rules, so the agent refused with only `result.md`. On Starwish the tool goes through the credential gate, not this sandbox.
  - This is the costliest run so far ($2.16, more cache reads than any earlier run). Task 14's heavy cost row is set above it.
