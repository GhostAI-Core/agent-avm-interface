# Voice sample previews

Place one MP3 per Inworld voice. Filename must match the voice ID suffix from `docs/voicelist.md`:

```
{gender}_{name}_{ethnicity}.mp3
{gender}_{name}_{ethnicity}_soft.mp3   # soft variants
```

Examples:

- `male_abulele_african.mp3`
- `female_jennifer_white_soft.mp3`

Files are served at `/voice-samples/<filename>` and used by the campaign voice picker.
