# Stock supply images — attribution

The SVG files in this directory are from [Twemoji](https://github.com/jdecked/twemoji)
(the maintained fork of the original Twitter Emoji project).

**License:** Creative Commons Attribution 4.0 International (CC BY 4.0).
**Required attribution:** "Copyright 2020 Twitter, Inc and other contributors. Graphics licensed under CC-BY 4.0."

LabBuddy uses these images as recognizable visual stand-ins for common
science-experiment supplies (paper cups, batteries, magnets, etc.) so we
don't pay per-image to generate them every time.

Filenames map to supply names; lookup is done by `server/src/stock-images.ts`.

To re-fetch (e.g. after adding a new mapping in `scripts/fetch-stock-images.sh`):

```bash
./scripts/fetch-stock-images.sh
```
